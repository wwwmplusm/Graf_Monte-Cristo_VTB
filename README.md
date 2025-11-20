# 🚀 FinPulse - Мультибанковый финансовый ассистент

**Статус:** MVP готов на 70%, требуется 18-26 часов доработки для хакатона  
**Технологии:** FastAPI + React + TypeScript + OpenBanking Russia v2.1  
**Дата:** Ноябрь 2025

---

## 🎯 Что это?

**FinPulse** - это финансовый ассистент нового поколения, который:

✅ Подключается к **нескольким банкам** через OpenBanking API  
✅ Показывает **единый dashboard** со всеми счетами, кредитами, вкладами  
✅ Рассчитывает **Safe-to-Spend** - сколько можно потратить сегодня без риска  
✅ Автоматически определяет **обязательные (MDP)** и **дополнительные (ADP)** платежи  
✅ Подбирает **лучшие условия рефинансирования** для экономии денег  
✅ Совершает **реальные платежи** через банковские API

---

## 📚 Документация

### 🎯 Быстрый старт (5 минут)

**Выбери свою роль:**

| Роль | Документ | Время |
|------|----------|-------|
| 🆕 Новичок в проекте | [`QUICK_SUMMARY.md`](./QUICK_SUMMARY.md) | 5 мин |
| 👨‍💻 Разработчик | [`TODO.md`](./TODO.md) | 3 мин |
| 📊 Product Owner | [`ROADMAP.md`](./ROADMAP.md) | 10 мин |
| 🏆 Жюри хакатона | [`ROADMAP.md`](./ROADMAP.md) (раздел "Демонстрация") | 5 мин |

### 📖 Полная навигация

**Все документы с описанием:** [`NAVIGATION.md`](./NAVIGATION.md)

---

## ⚡ Быстрый запуск

### Предварительные требования:
- Python 3.11+
- Node.js 18+
- SQLite

### Установка:

```bash
# 1. Клонировать репозиторий
cd /home/kesha/MyCode/HACKATHON/CASH_PREDICT

# 2. Установить backend зависимости
cd hktn
pip install -r requirements.txt

# 3. Установить frontend зависимости
npm install

# 4. Запустить backend (в отдельном терминале)
uvicorn backend_app:app --reload --host 0.0.0.0 --port 8000

# 5. Запустить frontend (в отдельном терминале)
npm run dev

# 6. Открыть в браузере
# http://localhost:5173
```

### Тестовые данные:
- **User ID:** `team260-3`
- **Банки:** VBank, ABank, SBank
- **OpenBanking Endpoint:** `https://abank.open.bankingapi.ru/`

---

## 🎨 Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + TS)                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │ Onboarding │→ │    Home    │→ │   Loans    │            │
│  │  (7 steps) │  │  Dashboard │  │   Detail   │            │
│  └────────────┘  └────────────┘  └────────────┘            │
└───────────────────────┬─────────────────────────────────────┘
                        │ REST API
┌───────────────────────▼─────────────────────────────────────┐
│               Backend (FastAPI + Python)                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │  Consents  │  │ Analytics  │  │  Payments  │            │
│  │  Service   │  │  Service   │  │  Service   │            │
│  └────────────┘  └────────────┘  └────────────┘            │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          Algorithms (6 реализовано)                  │   │
│  │  • STS Calculation      • MDP Calculation            │   │
│  │  • ADP Calculation      • Debt Calculation           │   │
│  │  • Balance Calculation  • Categorization             │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │ OpenBanking API v2.1
┌───────────────────────▼─────────────────────────────────────┐
│                  Banks (VBank, ABank, SBank)                 │
│  • Accounts  • Balances  • Transactions  • Credits          │
│  • Consents  • Payments                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ Что работает отлично

### Backend (85%)
- ✅ Полная интеграция с OpenBanking Russia v2.1
- ✅ 6 из 9 алгоритмов расчета (STS, MDP, ADP, Debt, Balance, Categorization)
- ✅ Dashboard API с кешированием (15-30 минут)
- ✅ Payment flow (MDP/ADP/SDP) через банковские API
- ✅ Database (SQLite) с consents и кешем

### Frontend (75%)
- ✅ Онбординг (7 шагов)
- ✅ Home Screen с 7 виджетами
- ✅ Loans/Deposits Detail screens
- ✅ Refinance Screen
- ✅ STS Detail Screen
- ✅ Cards Screen

### Интеграция (90%)
- ✅ Создание consents (accounts, products, payments)
- ✅ Загрузка счетов, балансов, транзакций
- ✅ Отправка платежей (single payments)

---

## ❌ Что нужно доработать (критично)

### 1. Онбординг - нарушения спецификации (6 часов)
- ❌ Нет проверки auto-approve
- ❌ Нет ссылки на банк для ручного подтверждения
- ❌ Нет polling статуса consent

### 2. Refinancing - нет backend логики (8 часов)
- ❌ Отсутствуют алгоритмы 7-9
- ❌ Нет endpoint `/api/refinance/optimize-loans`
- ❌ Frontend использует mock данные

### 3. Loans/Deposits Detail - mock данные (6 часов)
- ❌ Нет endpoint `/api/loans`
- ❌ Нет endpoint `/api/deposits`
- ❌ Список кредитов/вкладов не загружается из API

**Подробности:** [`IMPLEMENTATION_ANALYSIS.md`](./IMPLEMENTATION_ANALYSIS.md)

---

## 📋 План доработки

### Критичные задачи (20 часов)
1. ✅ Онбординг по спецификации - 6 ч
2. ✅ Refinancing API - 8 ч
3. ✅ Loans/Deposits API - 6 ч

### Важные улучшения (6 часов)
4. ✅ Goal Selection валидация - 2 ч
5. ✅ Repayment Speed сохранение - 1 ч
6. ✅ Health Score reasons - 2 ч

**Полный план:** [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md)  
**Список задач:** [`TODO.md`](./TODO.md)

---

## 🎬 Демонстрация

### Сценарий 1: "Мультибанк с реальными данными" (3 мин)
```
1. Онбординг team260-3
2. Подключение VBank + ABank
3. Dashboard с реальными данными
4. Акцент: "Это не mock, а реальные банковские API"
```

### Сценарий 2: "Умные платежи MDP/ADP" (2 мин)
```
1. Loans Detail с реальными кредитами
2. MDP (850₽) и ADP (1,200₽) рассчитаны автоматически
3. Совершение платежа через API
4. Акцент: "Avalanche стратегия минимизирует переплату"
```

### Сценарий 3: "Refinancing Engine" (3 мин)
```
1. Refinance Screen с офферами
2. Экономия 45,000₽ за год
3. Подача заявки
4. Акцент: "Автоматический подбор лучших условий"
```

**Подробности:** [`ROADMAP.md`](./ROADMAP.md) (раздел "Демонстрация")

---

## 🔑 Killer Features

### 1. Реальная интеграция с OpenBanking
- Не mock, а настоящие банковские API
- JWKS ключи и JWT подпись
- OAuth2 авторизация
- Retry механизм

### 2. Safe-to-Spend (STS)
- Monte-Carlo симуляция на 30 дней
- Учет всех платежей и доходов
- Обновление в реальном времени
- **Уникальная фича!**

### 3. MDP/ADP система
- Mandatory Daily Payment (обязательный)
- Additional Daily Payment (ускоренный)
- Автоматический расчет каждый день
- 3 режима скорости погашения

### 4. Avalanche/Snowball стратегии
- Приоритезация кредитов
- Математическая оптимизация
- Минимизация переплаты

### 5. Refinancing Engine
- Автоподбор лучших условий
- Расчет экономии
- DTI и триггеры
- Консолидация кредитов

### 6. Умное кеширование
- Кеш на 15-30 минут
- Force refresh по запросу
- Индикатор свежести данных
- Оптимизация запросов к банкам

---

## 📊 Текущий статус: 70% → 95%

```
█████████████████████░░░░░░░░ 70% (сейчас)
████████████████████████████░ 95% (через 26 часов)

Осталось работы: 18-26 часов
```

**Прогресс по модулям:**

| Модуль | Готовность |
|--------|------------|
| Backend Core | ████████████████████ 90% |
| OpenBanking Integration | █████████████████████ 95% |
| Алгоритмы (1-6) | ██████████████████████ 100% |
| Алгоритмы (7-9) | ░░░░░░░░░░░░░░░░░░░░░░ 0% |
| Онбординг Flow | ██████████████░░░░░░░░ 70% |
| Dashboard API | █████████████████████ 95% |
| Payments API | ██████████████████████ 100% |
| Refinance API | ░░░░░░░░░░░░░░░░░░░░░░ 0% |
| Loans/Deposits API | ░░░░░░░░░░░░░░░░░░░░░░ 0% |
| UI/UX | ████████████████████ 90% |

---

## 🛠️ Технологический стек

### Backend:
- **Framework:** FastAPI (Python 3.11)
- **Database:** SQLite
- **OpenBanking:** Custom OBR Client
- **Security:** JWT RS256, JWKS
- **Libraries:** httpx, pydantic, python-jose

### Frontend:
- **Framework:** React 18
- **Language:** TypeScript
- **Build:** Vite
- **UI:** Tailwind CSS
- **State:** React Hooks
- **Router:** React Router

### DevOps:
- **Backend:** Uvicorn ASGI server
- **Frontend:** Vite dev server
- **Database:** SQLite (file-based)
- **Logging:** Python logging

---

## 📁 Структура проекта

```
CASH_PREDICT/
├── hktn/                           # Основной код
│   ├── backend/                    # Backend (FastAPI)
│   │   ├── services/              # Бизнес-логика
│   │   │   ├── consents.py        ⚠️ Доработать
│   │   │   ├── algorithms.py      ⚠️ Добавить 3 алгоритма
│   │   │   ├── analytics.py       ⚠️ Добавить reasons
│   │   │   └── ...
│   │   └── routers/               # API endpoints
│   │       ├── refinance.py       ❌ Создать
│   │       ├── loans.py           ❌ Создать
│   │       └── ...
│   ├── core/                       # Базовые модули
│   │   ├── obr_client.py          ✅ OpenBanking client
│   │   ├── database.py            ✅ SQLite operations
│   │   └── data_models.py         ✅ Pydantic models
│   └── src/                        # Frontend (React)
│       ├── components/            
│       │   └── steps/             
│       │       ├── Step2ConsentProgress.tsx ⚠️
│       │       └── Step5Questions.tsx       ⚠️
│       ├── screens/               
│       │   ├── RefinanceScreen.tsx         ⚠️
│       │   ├── LoansDetailScreen.tsx       ⚠️
│       │   └── ...
│       └── utils/                 
│           └── api.ts             ⚠️ Добавить функции
│
├── context/                        # Документация
│   └── back onboard.md            📖 Спецификация (БИБЛИЯ)
│
├── 📄 Документы
│   ├── NAVIGATION.md              🧭 Главная навигация
│   ├── QUICK_SUMMARY.md           ⚡ Быстрое резюме (5 мин)
│   ├── TODO.md                    ✅ Список задач
│   ├── ROADMAP.md                 🗺️ Визуальный план
│   ├── IMPLEMENTATION_ANALYSIS.md 📊 Полный анализ
│   ├── DEVELOPMENT_PLAN.md        📋 План с кодом
│   └── DATA_FLOW_AND_CALCULATIONS.md 🔄 Как работает
│
└── README.md                       ← ВЫ ЗДЕСЬ
```

---

## 🤝 Contributing

### Для разработчиков:

1. **Прочитай документацию:**
   - [`QUICK_SUMMARY.md`](./QUICK_SUMMARY.md) (5 мин)
   - [`TODO.md`](./TODO.md) (3 мин)

2. **Выбери задачу:**
   - Задача 1: Онбординг (6 ч)
   - Задача 2: Refinancing (8 ч)
   - Задача 3: Loans/Deposits (6 ч)

3. **Изучи инструкции:**
   - [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md) → твоя задача

4. **Кодируй!**
   - Следуй примерам кода в документации
   - Логируй всё через `logger.info()`
   - Тестируй через curl/Postman или DevTools

5. **Перед коммитом:**
   - [ ] Код проходит линтер
   - [ ] Нет console.log
   - [ ] Типы TypeScript корректны
   - [ ] Backend логирование добавлено

---

## 🎯 Roadmap

### День 1 (8 часов)
- [x] Backend Core
- [x] OpenBanking Integration
- [x] Dashboard API
- [x] Онбординг UI
- [ ] Consent Flow по спецификации ← **СДЕЛАТЬ**

### День 2 (8 часов)
- [x] Payments API
- [x] MDP/ADP расчеты
- [x] STS расчеты
- [ ] Refinancing API ← **СДЕЛАТЬ**

### День 3 (8 часов)
- [x] Loans/Deposits UI
- [ ] Loans/Deposits API ← **СДЕЛАТЬ**
- [ ] Health Score reasons ← **СДЕЛАТЬ**
- [ ] Финальное тестирование

---

## 📞 Контакты и поддержка

### Документация:
- Навигация: [`NAVIGATION.md`](./NAVIGATION.md)
- FAQ: Все вопросы в документации

### Для хакатона:
- Team: FinPulse
- Project: Мультибанковый финансовый ассистент
- Demo: team260-3

---

## 📜 Лицензия

Этот проект создан для хакатона **API Hackathon 2025**.

---

## 🏆 Цель

**Создать лучший финансовый ассистент для российского рынка:**
- ✅ Решение реальной проблемы (фрагментация финансов)
- ✅ Использование OpenBanking Russia API
- ✅ Уникальная value proposition (STS + MDP/ADP + Refinancing)
- ✅ Готовый к демонстрации продукт

**После завершения всех задач: 95% готовности и победа на хакатоне! 🚀**

---

*Последнее обновление: 20 ноября 2025*  
*Версия: 1.0*  
*Статус: MVP (70%) → Production-ready (95%)*

