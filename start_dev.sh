#!/bin/bash

# Скрипт для запуска Backend и Frontend одновременно
# Использование: ./start_dev.sh

set -e

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Запуск FinPulse приложения...${NC}\n"

# Проверка директории
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Проверка виртуального окружения
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}⚠️  Виртуальное окружение не найдено. Создаю...${NC}"
    python3 -m venv venv
fi

# Активация виртуального окружения
echo -e "${BLUE}📦 Активация виртуального окружения...${NC}"
source venv/bin/activate

# Проверка зависимостей backend
if ! python -c "import fastapi" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Установка зависимостей backend...${NC}"
    pip install -r hktn/requirements.txt
fi

# Проверка зависимостей frontend
if [ ! -d "hktn/node_modules" ]; then
    echo -e "${YELLOW}⚠️  Установка зависимостей frontend...${NC}"
    cd hktn
    npm install
    cd ..
fi

# Функция для очистки при выходе
cleanup() {
    echo -e "\n${YELLOW}🛑 Остановка серверов...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Запуск Backend
echo -e "${GREEN}🔧 Запуск Backend на http://localhost:8000${NC}"
cd hktn
uvicorn hktn.backend_app:app --reload --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Ожидание запуска backend
sleep 3

# Проверка что backend запустился
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${YELLOW}❌ Backend не запустился. Проверьте backend.log${NC}"
    exit 1
fi

# Запуск Frontend
echo -e "${GREEN}🎨 Запуск Frontend на http://localhost:5173${NC}"
cd hktn
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Ожидание запуска frontend
sleep 3

echo -e "\n${GREEN}✅ Приложение запущено!${NC}\n"
echo -e "${BLUE}📍 Backend:  ${NC}http://localhost:8000"
echo -e "${BLUE}📍 Frontend: ${NC}http://localhost:5173"
echo -e "${BLUE}📍 API Docs: ${NC}http://localhost:8000/docs"
echo -e "\n${YELLOW}📝 Логи:${NC}"
echo -e "   Backend:  tail -f backend.log"
echo -e "   Frontend: tail -f frontend.log"
echo -e "\n${YELLOW}Нажмите Ctrl+C для остановки${NC}\n"

# Ожидание завершения
wait

