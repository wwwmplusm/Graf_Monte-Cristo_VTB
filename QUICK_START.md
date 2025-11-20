# 🚀 Быстрый старт - Запуск приложения для тестирования

## 📋 Предварительные требования

- **Python 3.9+**
- **Node.js 18+** и **npm**
- **SQLite** (встроен в Python)

---

## 🔧 Шаг 1: Установка зависимостей

### Backend (Python)

```bash
# Перейти в директорию проекта
cd /home/kesha/MyCode/HACKATHON/CASH_PREDICT

# Создать виртуальное окружение (если еще не создано)
python -m venv venv

# Активировать виртуальное окружение
source venv/bin/activate  # Linux/Mac
# или
venv\Scripts\activate  # Windows

# Установить зависимости
pip install -r hktn/requirements.txt
```

### Frontend (Node.js)

```bash
# Перейти в директорию frontend
cd hktn

# Установить зависимости
npm install
```

---

## ⚙️ Шаг 2: Настройка переменных окружения (опционально)

Создайте файл `.env` в корне проекта `hktn/` (если его еще нет):

```bash
cd hktn
touch .env
```

Добавьте в `.env` (если нужно переопределить значения по умолчанию):

```env
# OpenBanking API credentials
TEAM_CLIENT_ID=team260-3
TEAM_CLIENT_SECRET=your_secret_here

# Default financial inputs (если не заданы в БД)
DEFAULT_SALARY_AMOUNT=50000
DEFAULT_NEXT_SALARY_DAYS=14
DEFAULT_CREDIT_PAYMENT_AMOUNT=15000
DEFAULT_CREDIT_PAYMENT_DAYS=10

# CORS origins (для разработки)
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## 🗄️ Шаг 3: Инициализация базы данных

База данных SQLite создается автоматически при первом запуске backend.

Если нужно сбросить БД:

```bash
cd hktn
rm finpulse_consents.db  # Удалить старую БД (если есть)
```

База данных будет создана автоматически при первом запуске.

---

## 🎯 Шаг 4: Запуск приложения

### Вариант 1: Запуск в двух терминалах (рекомендуется для разработки)

#### Терминал 1: Backend

```bash
# Активировать виртуальное окружение (если еще не активировано)
source venv/bin/activate

# Перейти в директорию проекта
cd /home/kesha/MyCode/HACKATHON/CASH_PREDICT/hktn

# Запустить backend сервер
uvicorn hktn.backend_app:app --reload --port 8000
```

**Ожидаемый вывод:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Bootstrapping FinPulse backend
INFO:     Application startup complete.
```

**Проверка:** Откройте http://localhost:8000/docs - должна открыться Swagger документация API.

#### Терминал 2: Frontend

```bash
# Перейти в директорию frontend
cd /home/kesha/MyCode/HACKATHON/CASH_PREDICT/hktn

# Запустить dev server
npm run dev
```

**Ожидаемый вывод:**
```
  VITE v6.3.5  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**Проверка:** Откройте http://localhost:5173 - должна открыться главная страница приложения.

---

### Вариант 2: Запуск через скрипт (если нужно)

Создайте файл `start.sh`:

```bash
#!/bin/bash

# Запуск backend в фоне
cd /home/kesha/MyCode/HACKATHON/CASH_PREDICT/hktn
source ../venv/bin/activate
uvicorn hktn.backend_app:app --reload --port 8000 &
BACKEND_PID=$!

# Запуск frontend
npm run dev &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo ""
echo "Нажмите Ctrl+C для остановки"

# Ожидание завершения
wait
```

Сделайте исполняемым и запустите:

```bash
chmod +x start.sh
./start.sh
```

---

## 🧪 Шаг 5: Тестирование

### Проверка Backend API

#### 1. Проверка Swagger документации:
```
http://localhost:8000/docs
```

#### 2. Проверка health endpoint:
```bash
curl http://localhost:8000/api/dashboard?user_id=team260-3
```

#### 3. Проверка списка банков:
```bash
curl http://localhost:8000/api/banks
```

### Проверка Frontend

1. Откройте http://localhost:5173
2. Должна открыться главная страница приложения
3. Если есть ошибки, проверьте консоль браузера (F12)

---

## 📊 Шаг 6: Настройка тестовых данных (опционально)

### Добавление финансовых данных пользователя в БД

Если нужно задать зарплату и платежи по кредитам для тестового пользователя:

```bash
# Подключиться к SQLite БД
sqlite3 hktn/finpulse_consents.db
```

```sql
-- Добавить или обновить финансовые данные пользователя
INSERT INTO user_financial_inputs (
    user_id, 
    salary_amount, 
    next_salary_date, 
    credit_payment_amount, 
    credit_payment_date
)
VALUES (
    'team260-3', 
    80000, 
    '2025-12-25', 
    15000, 
    '2025-12-18'
)
ON CONFLICT(user_id) DO UPDATE SET
    salary_amount=excluded.salary_amount,
    next_salary_date=excluded.next_salary_date,
    credit_payment_amount=excluded.credit_payment_amount,
    credit_payment_date=excluded.credit_payment_date;

-- Проверить данные
SELECT * FROM user_financial_inputs WHERE user_id = 'team260-3';
```

---

## 🐛 Решение проблем

### Проблема: Backend не запускается

**Ошибка:** `ModuleNotFoundError: No module named 'hktn'`

**Решение:**
```bash
# Убедитесь, что вы в правильной директории
cd /home/kesha/MyCode/HACKATHON/CASH_PREDICT

# Установите зависимости заново
pip install -r hktn/requirements.txt

# Запустите из корня проекта
cd hktn
uvicorn hktn.backend_app:app --reload --port 8000
```

---

### Проблема: Frontend не подключается к Backend

**Ошибка:** `Failed to fetch dashboard: NetworkError`

**Решение:**
1. Убедитесь, что backend запущен на порту 8000
2. Проверьте URL в `hktn/src/utils/api.ts`:
   ```typescript
   const API_BASE_URL = 'http://localhost:8000';
   ```
3. Проверьте CORS настройки в `hktn/backend/config.py`

---

### Проблема: Порт уже занят

**Ошибка:** `Address already in use`

**Решение:**
```bash
# Найти процесс на порту 8000
lsof -i :8000  # Linux/Mac
netstat -ano | findstr :8000  # Windows

# Убить процесс
kill -9 <PID>  # Linux/Mac
taskkill /PID <PID> /F  # Windows

# Или использовать другой порт
uvicorn hktn.backend_app:app --reload --port 8001
```

---

### Проблема: База данных не создается

**Решение:**
```bash
# Убедитесь, что есть права на запись в директорию
cd hktn
ls -la finpulse_consents.db

# Если файла нет, создайте пустую БД (она создастся автоматически при запуске)
touch finpulse_consents.db
chmod 666 finpulse_consents.db
```

---

## 📝 Полезные команды

### Backend

```bash
# Запуск с автоматической перезагрузкой при изменениях
uvicorn hktn.backend_app:app --reload --port 8000

# Запуск без перезагрузки (production mode)
uvicorn hktn.backend_app:app --port 8000

# Запуск с логированием
uvicorn hktn.backend_app:app --reload --port 8000 --log-level debug
```

### Frontend

```bash
# Запуск dev server
npm run dev

# Сборка production версии
npm run build

# Просмотр собранных файлов
npm run preview
```

### Тестирование

```bash
# Backend тесты
cd hktn
pytest

# Frontend тесты (если настроены)
npm run test

# Запуск тестов онбординга
python test_onboarding.py
```

---

## 🌐 Доступные endpoints

После запуска backend доступны следующие endpoints:

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc
- **Dashboard:** http://localhost:8000/api/dashboard?user_id=team260-3
- **Banks:** http://localhost:8000/api/banks
- **Auth:** http://localhost:8000/api/auth/login

---

## ✅ Чек-лист готовности

- [ ] Python 3.9+ установлен
- [ ] Node.js 18+ установлен
- [ ] Виртуальное окружение создано и активировано
- [ ] Backend зависимости установлены (`pip install -r hktn/requirements.txt`)
- [ ] Frontend зависимости установлены (`npm install` в `hktn/`)
- [ ] Backend запущен на http://localhost:8000
- [ ] Frontend запущен на http://localhost:5173
- [ ] Swagger документация доступна (http://localhost:8000/docs)
- [ ] Главная страница открывается без ошибок

---

## 🎯 Быстрая команда запуска (все в одном)

```bash
# В одном терминале (для быстрого теста)
cd /home/kesha/MyCode/HACKATHON/CASH_PREDICT/hktn && \
source ../venv/bin/activate && \
uvicorn hktn.backend_app:app --reload --port 8000 & \
npm run dev
```

---

## 📚 Дополнительная информация

- **Backend код:** `hktn/backend/`
- **Frontend код:** `hktn/src/`
- **Конфигурация:** `hktn/backend/config.py`
- **API документация:** http://localhost:8000/docs (после запуска)

---

**Готово!** Теперь вы можете тестировать приложение. 🎉

