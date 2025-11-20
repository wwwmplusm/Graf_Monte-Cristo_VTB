# ✅ FinPulse TODO List

**Обновлено:** 20 ноября 2025  
**Статус:** 70% → 95% (осталось 18-26 часов)

---

## 🔴 КРИТИЧНЫЕ ЗАДАЧИ (20 часов)

### [ ] 1. Онбординг - Consent Flow (6 часов)

#### Backend (3 часа)
- [ ] 1.1. Добавить проверку auto-approve в `consents.py` (2 ч)
  - `hktn/backend/services/consents.py`
  - Функция: `initiate_full_consent_flow()`
  - Вернуть: `auto_approved: bool`, `authorization_url: str | null`

- [ ] 1.2. Создать endpoint для polling статуса (1 ч)
  - `hktn/backend/services/consents.py`
  - Функция: `poll_consent_status(user_id, bank_id, request_id)`
  - Endpoint: `GET /api/consent/status` (уже есть в роутере)

#### Frontend (3 часа)
- [ ] 1.3. Отображение ссылки на банк (1.5 ч)
  - `hktn/src/components/steps/Step2ConsentProgress.tsx`
  - Добавить: кнопка "Подтвердить в банке →"
  - Добавить: статус "Ожидание подтверждения..."

- [ ] 1.4. Реализация polling (1.5 ч)
  - `hktn/src/components/steps/Step2ConsentProgress.tsx`
  - Polling каждые 5 секунд
  - Обновление UI при approve/reject

---

### [ ] 2. Refinancing API (8 часов)

#### Backend Алгоритмы (5 часов)
- [ ] 2.1. Реализовать `financing_need_detector()` (2 ч)
  - `hktn/backend/services/algorithms.py`
  - Расчет DTI
  - Сбор триггеров (overdue, gap_risk, high_dti, refi_opportunity)
  - Оценка срочности (HIGH/MEDIUM/WATCH/NONE)

- [ ] 2.2. Реализовать `best_financing_offer_selector()` (3 ч)
  - `hktn/backend/services/algorithms.py`
  - Сценарий "Точечный выстрел" (Single Refi)
  - Сценарий "Консолидация" (All-in)
  - Функция `calculate_pmt()` для аннуитета
  - Сортировка по monthly_saving

#### Backend API (2 часа)
- [ ] 2.3. Создать роутер `/api/refinance/*` (2 ч)
  - Создать: `hktn/backend/routers/refinance.py`
  - Endpoint: `GET /api/refinance/optimize-loans`
  - Endpoint: `POST /api/refinance/apply`
  - Зарегистрировать в `app.py`

#### Frontend (1 час)
- [ ] 2.4. Интеграция с API (1 ч)
  - `hktn/src/utils/api.ts` - добавить функции
  - `hktn/src/screens/RefinanceScreen.tsx` - заменить mock

---

### [ ] 3. Loans/Deposits Detail API (6 часов)

#### Backend (3 часа)
- [ ] 3.1. Создать роутер `/api/loans` (2 ч)
  - Создать: `hktn/backend/routers/loans.py`
  - Endpoint: `GET /api/loans?user_id=...`
  - Парсинг product-agreements (type=loan)
  - Ранжирование по priority (Avalanche)
  - Зарегистрировать в `app.py`

- [ ] 3.2. Создать endpoint `/api/deposits` (1 ч)
  - `hktn/backend/routers/loans.py`
  - Endpoint: `GET /api/deposits?user_id=...`
  - Парсинг product-agreements (type=deposit)
  - Расчет SDP

#### Frontend (3 часа)
- [ ] 3.3. Интеграция Loans Detail (1.5 ч)
  - `hktn/src/utils/api.ts` - добавить `getLoans()`
  - `hktn/src/screens/LoansDetailScreen.tsx` - заменить mock

- [ ] 3.4. Интеграция Deposits Detail (1.5 ч)
  - `hktn/src/utils/api.ts` - добавить `getDeposits()`
  - `hktn/src/screens/DepositsDetailScreen.tsx` - заменить mock

---

## 🟠 ВАЖНЫЕ ЗАДАЧИ (6 часов)

### [ ] 4. Goal Selection - валидация (2 часа)
- [ ] 4.1. Проверка наличия кредитов (1 ч)
  - `hktn/src/components/steps/Step5Questions.tsx`
  - Загрузить кредиты через `getLoans()`
  - Проверить `loans.length > 0`

- [ ] 4.2. Блокировка кнопки (1 ч)
  - `hktn/src/components/steps/Step5Questions.tsx`
  - Кнопка "Закрыть кредиты" disabled если нет кредитов
  - Tooltip "У вас нет активных кредитов"

---

### [ ] 5. Repayment Speed - сохранение (1 час)
- [ ] 5.1. Frontend отправка (0.5 ч)
  - `hktn/src/components/steps/Step5Questions.tsx`
  - Отправить `repayment_speed` в API

- [ ] 5.2. Backend сохранение (0.5 ч)
  - `hktn/backend/services/onboarding.py`
  - Сохранить в `user_financial_inputs`
  - Использовать в `adp_calculation()`

---

### [ ] 6. Health Score - reasons (2 часа)
- [ ] 6.1. Генерация reasons[] (1.5 ч)
  - `hktn/backend/services/analytics.py`
  - Функция: `_calculate_health_score()`
  - Добавить список причин:
    - "Долг под контролем"
    - "Расходы < 70% дохода"
    - "⚠️ Долг превышает активы"

- [ ] 6.2. Frontend отображение (0.5 ч)
  - `hktn/src/components/widgets/HealthWidget.tsx`
  - Показать `health_score.reasons[]`

---

## 🟡 ОПЦИОНАЛЬНЫЕ ЗАДАЧИ (10+ часов)

### [ ] 7. Profile Screen (3 часа)
- [ ] Backend endpoint `/api/profile`
- [ ] Frontend экран `ProfileScreen.tsx`
- [ ] Список подключенных банков
- [ ] Кнопка "Перейти на Premium"

### [ ] 8. STS.spent tracking (1 час)
- [ ] Фильтрация транзакций за сегодня
- [ ] Суммирование Debit транзакций
- [ ] Обновление `sts_today.spent`

### [ ] 9. Loan Simulation (6 часов)
- [ ] Backend endpoint `/api/loans/simulation`
- [ ] Прогноз закрытия кредитов
- [ ] Frontend симулятор с слайдером
- [ ] Интерактивное изменение ADP

---

## 📋 Чеклист перед коммитом

### Перед каждым коммитом:
- [ ] Код проходит линтер (ESLint/Ruff)
- [ ] Нет console.log в продакшене
- [ ] Типы TypeScript корректны
- [ ] Backend логирование добавлено
- [ ] Тестирование через curl/Postman

### Перед демо:
- [ ] Все критичные задачи выполнены
- [ ] Backend запускается без ошибок
- [ ] Frontend собирается без warnings
- [ ] Онбординг работает для team260-3
- [ ] Dashboard загружается < 3 сек
- [ ] Все 3 сценария демо протестированы

---

## 🎯 Прогресс по дням

### День 1 (8 часов)
```
[░░░░░░░░░░░░░░░░░░░░] 0/2
  [ ] Задача 1: Онбординг (6 ч)
  [ ] Задача 4: Goal Selection (2 ч)
```

### День 2 (8 часов)
```
[░░░░░░░░░░░░░░░░░░░░] 0/1
  [ ] Задача 2: Refinancing API (8 ч)
```

### День 3 (8 часов)
```
[░░░░░░░░░░░░░░░░░░░░] 0/3
  [ ] Задача 3: Loans/Deposits API (6 ч)
  [ ] Задача 5: Repayment Speed (1 ч)
  [ ] Задача 6: Health Reasons (2 ч)
```

---

## 📁 Важные файлы

### Backend
- `hktn/backend/services/consents.py` - ⚠️ Доработать
- `hktn/backend/services/algorithms.py` - ⚠️ Добавить 3 алгоритма
- `hktn/backend/routers/refinance.py` - ❌ Создать
- `hktn/backend/routers/loans.py` - ❌ Создать
- `hktn/backend/services/analytics.py` - ⚠️ Добавить reasons
- `hktn/backend/app.py` - ⚠️ Зарегистрировать роутеры

### Frontend
- `hktn/src/components/steps/Step2ConsentProgress.tsx` - ⚠️ Доработать
- `hktn/src/components/steps/Step5Questions.tsx` - ⚠️ Добавить валидацию
- `hktn/src/screens/RefinanceScreen.tsx` - ⚠️ Убрать mock
- `hktn/src/screens/LoansDetailScreen.tsx` - ⚠️ Убрать mock
- `hktn/src/screens/DepositsDetailScreen.tsx` - ⚠️ Убрать mock
- `hktn/src/utils/api.ts` - ⚠️ Добавить функции

### Документация
- `context/back onboard.md` - 📖 Спецификация
- `IMPLEMENTATION_ANALYSIS.md` - 📊 Анализ
- `DEVELOPMENT_PLAN.md` - 📋 План с кодом
- `QUICK_SUMMARY.md` - ⚡ Краткое резюме
- `ROADMAP.md` - 🗺️ Визуальный roadmap

---

## 🚀 Быстрый старт

### Для нового разработчика:
1. Прочитай `QUICK_SUMMARY.md` (5 мин)
2. Изучи `context/back onboard.md` (15 мин)
3. Открой `DEVELOPMENT_PLAN.md` → Задача 1.1 (начни отсюда)

### Для демонстрации:
1. Запусти backend: `cd hktn && uvicorn backend_app:app --reload`
2. Запусти frontend: `cd hktn && npm run dev`
3. Открой: `http://localhost:5173`
4. Пройди онбординг: `team260-3`

---

## 🎯 Цель: 95% готовности через 26 часов

**Удачи! 🚀**

