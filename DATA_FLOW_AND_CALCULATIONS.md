# 📊 Поток данных и расчеты для виджетов главного экрана

## 🔄 Общая схема потока данных

```
┌─────────────────┐
│  HomeScreen.tsx  │
│  (Frontend)      │
└────────┬─────────┘
         │
         │ 1. Запрос данных
         │ GET /api/dashboard?user_id=...
         ▼
┌─────────────────┐
│  api.ts          │
│  getDashboard()  │
└────────┬─────────┘
         │
         │ 2. HTTP запрос
         │ fetch('http://localhost:8000/api/dashboard')
         ▼
┌─────────────────┐
│  analytics.py    │
│  router          │
│  /api/dashboard  │
└────────┬─────────┘
         │
         │ 3. Проверка кеша
         │ get_dashboard_metrics()
         ▼
┌─────────────────┐
│  analytics.py    │
│  _calculate_     │
│  dashboard_     │
│  metrics()       │
└────────┬─────────┘
         │
         │ 4. Параллельные запросы к банкам
         │ (accounts, balances, transactions, credits)
         ▼
┌─────────────────┐
│  banking.py      │
│  fetch_bank_*    │
│  (OpenBanking)   │
└────────┬─────────┘
         │
         │ 5. Расчеты через алгоритмы
         │ algorithms.py
         ▼
┌─────────────────┐
│  algorithms.py  │
│  - STS           │
│  - MDP/ADP       │
│  - Health Score  │
│  - Events        │
└────────┬─────────┘
         │
         │ 6. Возврат данных
         │ JSON response
         ▼
┌─────────────────┐
│  HomeScreen.tsx  │
│  Отображение     │
│  виджетов        │
└─────────────────┘
```

---

## 📍 Откуда виджеты берут данные

### 1. **Единый источник данных: Dashboard API**

Все виджеты получают данные из **одного endpoint**: `GET /api/dashboard`

**Файл:** `hktn/src/utils/api.ts`
```typescript
export async function getDashboard(userId: string, forceRefresh: boolean = false): Promise<DashboardResponse> {
    const params = new URLSearchParams({ user_id: userId });
    if (forceRefresh) {
        params.append('force_refresh', 'true');
    }
    
    const response = await fetch(`${API_BASE_URL}/api/dashboard?${params}`);
    return response.json();
}
```

### 2. **Структура ответа Dashboard API**

**Файл:** `hktn/src/utils/api.ts` (строки 92-107)
```typescript
export interface DashboardResponse {
    sts_today: STSToday;                    // Для STS Widget
    loan_summary: LoanSummary;              // Для Loans Widget
    savings_summary: SavingsSummary;        // Для Deposits Widget
    total_debit_cards_balance: number;     // Для DebitCards Widget
    events_next_30d: Array<{...}>;          // Для UpcomingEvents Widget
    health_score: HealthScore;             // Для Health Widget
    bank_statuses: BankStatus[];
    user_mode: 'loans' | 'deposits';       // Режим пользователя
    cache_info: CacheInfo;                 // Информация о кеше
}
```

### 3. **Как данные попадают в виджеты**

**Файл:** `hktn/src/screens/HomeScreen.tsx` (строки 73-97)

```typescript
// 1. Загрузка данных при монтировании компонента
useEffect(() => {
    const loadDashboard = async () => {
        const data = await getDashboard(appState.user.id);
        setDashboardData(data);  // Сохраняем в state
    };
    loadDashboard();
}, [appState.user.id, hasConsents]);

// 2. Преобразование данных для виджетов
const effectiveSTS = dashboardData ? {
    today: {
        amount: dashboardData.sts_today.amount,
        spent: dashboardData.sts_today.spent,
    },
    tomorrow: {
        impact: dashboardData.sts_today.tomorrow.impact,
    },
} : appState.sts;  // Fallback на mock данные

// 3. Передача данных в виджеты через props
<STSWidget sts={effectiveSTS} onTap={() => onNavigate('sts')} />
```

---

## 🧮 Где происходят расчеты

### **Все расчеты выполняются на Backend в Python**

**Файл:** `hktn/backend/services/analytics.py`

### Последовательность расчетов:

#### **Шаг 1: Получение данных из банков** (строки 105-232)

```python
async def _calculate_dashboard_metrics(user_id: str):
    # Параллельные запросы к банкам через OpenBanking API
    accounts_tasks = [fetch_bank_accounts_with_consent(...) for consent in consents]
    balances_tasks = [fetch_bank_balances_with_consent(...) for consent in consents]
    transactions_tasks = [fetch_bank_data_with_consent(...) for consent in consents]
    
    accounts_results = await asyncio.gather(*accounts_tasks)
    balances_results = await asyncio.gather(*balances_tasks)
    transactions_results = await asyncio.gather(*transactions_tasks)
```

**Результат:**
- `all_accounts` - список всех счетов
- `all_balances` - балансы по счетам
- `all_transactions` - транзакции за 12 месяцев
- `all_credits` - кредитные договоры

---

#### **Шаг 2: Категоризация транзакций** (строки 234-237)

**Файл:** `hktn/backend/services/algorithms.py` → `transactions_categorization_salary_and_loans()`

**Что делает:**
- Находит транзакции зарплаты (Credit + keywords: "зарплата", "salary", etc.)
- Определяет регулярность дохода (regular_monthly, regular_biweekly, irregular)
- Рассчитывает среднемесячный доход (медиана сумм по месяцам)
- Находит платежи по кредитам в транзакциях
- Определяет статус оплаты обязательств

**Результат:**
```python
{
    "estimated_monthly_income": 50000.0,
    "income_frequency_type": "regular_monthly",
    "next_income_window": {"start": "2025-11-15", "end": "2025-11-20"},
    "debt_obligations_status": [
        {
            "agreement_id": "loan-123",
            "planned_amount": 8500.0,
            "paid_in_current_period": False,
            "last_payment_date": "2025-10-15",
            "source": "contract"
        }
    ]
}
```

---

#### **Шаг 3: Расчет общего баланса дебетовых карт** (строки 239-243)

**Файл:** `hktn/backend/services/algorithms.py` → `total_debit_balance_calculation()`

**Что делает:**
- Фильтрует только дебетовые счета (Checking, CurrentAccount, Savings)
- Исключает кредитные карты и кредиты
- Суммирует балансы (InterimAvailable)
- Конвертирует валюты в RUB

**Результат:**
```python
total_debit_balance = 85000.0  # RUB
```

**Используется в:**
- DebitCards Widget → `total_debit_cards_balance`
- STS Widget → для расчета Safe-to-Spend

---

#### **Шаг 4: Расчет общей задолженности** (строки 245-255)

**Файл:** `hktn/backend/services/algorithms.py` → `total_debt_calculation()`

**Что делает:**
- Фильтрует активные кредиты (status="active")
- Суммирует остатки по кредитам и кредитным картам
- Конвертирует валюты в RUB

**Результат:**
```python
{
    "total_debt_base": 450000.0,
    "total_loans_debt_base": 300000.0,
    "total_cards_debt_base": 150000.0,
    "active_loans": [
        {
            "id": "loan-123",
            "amount": 180000.0,
            "interest_rate": 12.5,
            "monthly_payment": 8500.0,
            ...
        }
    ]
}
```

**Используется в:**
- Loans Widget → `loan_summary.total_outstanding`
- Health Widget → для расчета health score

---

#### **Шаг 5: Расчет MDP (Mandatory Daily Payment)** (строки 257-261)

**Файл:** `hktn/backend/services/algorithms.py` → `mdp_calculation()`

**Алгоритм:**
1. Для каждого кредита определяет плановый платеж:
   - Из графика платежей (если есть)
   - Или эвристика: `interest_part + principal_part`
2. Определяет дату платежа:
   - Из графика или день месяца открытия
3. Рассчитывает дневной платеж:
   - `daily_mdp = remaining / days_left`
   - Где `remaining` = плановый платеж минус уже оплаченное

**Результат:**
```python
{
    "mdp_today_base": 850.0,  # RUB в день
    "per_loan_mdp": [
        {"loan_id": "loan-123", "daily_mdp": 283.33},
        {"loan_id": "loan-456", "daily_mdp": 566.67}
    ]
}
```

**Используется в:**
- Loans Widget → `loan_summary.mandatory_daily_payment`
- Quick Actions Widget → кнопка "Оплатить MDP"
- STS Widget → вычитается из Safe-to-Spend

---

#### **Шаг 6: Расчет ADP (Additional Daily Payment)** (строки 263-274)

**Файл:** `hktn/backend/services/algorithms.py` → `adp_calculation()`

**Алгоритм:**
1. Определяет коэффициент по скорости погашения:
   - Conservative: 10% от MDP (k=0.1)
   - Balanced: 30% от MDP (k=0.3)
   - Fast: 50% от MDP (k=0.5)
2. Рассчитывает базовую сумму: `raw_adp = mdp_today_base * k`
3. Проверяет лимит безопасности:
   - Не более 20% дохода на досрочку
   - `max_daily_cap = (Income * 0.2) / 30`
4. Выбирает целевой кредит по стратегии:
   - Avalanche: по ставке (DESC)
   - Snowball: по сумме (ASC)

**Результат:**
```python
{
    "adp_today_base": 1200.0,  # RUB в день
    "target_loan_id": "loan-456",
    "target_reason": "Highest Rate"
}
```

**Используется в:**
- Loans Widget → `loan_summary.additional_daily_payment`
- Quick Actions Widget → кнопка "Оплатить ADP"
- STS Widget → вычитается из Safe-to-Spend

---

#### **Шаг 7: Расчет STS (Safe-to-Spend)** (строки 276-286)

**Файл:** `hktn/backend/services/algorithms.py` → `sts_calculation()`

**Алгоритм (Monte-Carlo симуляция на 30 дней):**
1. Инициализация:
   - `Current_Sim_Balance = total_debit_balance`
   - `Min_Low_Point = total_debit_balance`
2. Симуляция по дням (1..30):
   - Списания: если день платежа по кредиту → вычитаем `monthly_payment`
   - Поступления: если день зарплаты → добавляем `income`
   - Фиксация минимума: `Min_Low_Point = min(Min_Low_Point, Current_Sim_Balance)`
3. Расчет свободных денег:
   - `Free_Cash = Min_Low_Point - Safety_Buffer - adp_today_base`
4. Результат:
   - `sts_daily_recommended = Free_Cash / days_until_next_income`

**Результат:**
```python
{
    "sts_daily_recommended": 12500.0,  # RUB в день
    "status": "OK"  # или "DANGER" если Free_Cash < 0
}
```

**Используется в:**
- STS Widget → `sts_today.amount`
- STS Widget → прогресс-бар потраченных средств

---

#### **Шаг 8: Расчет Health Score** (строки 333-342)

**Файл:** `hktn/backend/services/analytics.py` → `_calculate_health_score()`

**Алгоритм:**
1. Базовый балл: `score = 50.0`
2. Соотношение долга к балансу:
   - Если `debt_ratio < 0.5` → +20
   - Если `debt_ratio < 1.0` → +10
   - Если `debt_ratio > 2.0` → -20
3. Соотношение расходов к доходам:
   - Если `expense_ratio < 0.7` → +20
   - Если `expense_ratio < 0.9` → +10
   - Если `expense_ratio > 1.0` → -20
4. Нормализация: `score = max(0.0, min(100.0, score))`
5. Статус:
   - 75-100: "excellent" → "спокойно"
   - 60-74: "good" → "спокойно"
   - 40-59: "fair" → "внимание"
   - 0-39: "poor" → "нужен план"

**Результат:**
```python
{
    "value": 72.0,
    "status": "good",
    "reasons": ["STS выше 40%", "Долг снизился на 5%"]
}
```

**Используется в:**
- Health Widget → `health_score.value`
- Health Widget → `health_score.status`
- Health Widget → `health_score.reasons`

---

#### **Шаг 9: Расчет Events (Ближайшие события)** (строки 322-331)

**Файл:** `hktn/backend/services/analytics.py` → `_get_upcoming_events()`

**Алгоритм:**
1. Добавляет платежи по кредитам (если в пределах 30 дней)
2. Добавляет получение зарплаты (если в пределах 30 дней)
3. Сортирует по дате
4. Возвращает топ-10 событий

**Результат:**
```python
[
    {
        "date": "2025-11-10",
        "type": "loan_payment",
        "amount": 8500.0,
        "description": "Платеж по кредиту"
    },
    {
        "date": "2025-11-15",
        "type": "salary",
        "amount": 50000.0,
        "description": "Получение зарплаты"
    }
]
```

**Используется в:**
- UpcomingEvents Widget → `events_next_30d`

---

#### **Шаг 10: Расчет Savings Summary (для режима накоплений)** (строки 304-309)

**Файл:** `hktn/backend/services/analytics.py` → `_calculate_savings_summary()`

**Алгоритм:**
1. Суммирует балансы всех депозитов/вкладов
2. Рассчитывает ежедневный платеж (SDP):
   - Если есть цель: `daily_payment = (target - total_saved) / days_until_goal`
   - Иначе: `daily_payment = monthly_income * savings_rate / 30`
3. Рассчитывает прогресс: `progress_percent = (total_saved / target) * 100`

**Результат:**
```python
{
    "total_saved": 320000.0,
    "daily_payment": 1500.0,  # SDP
    "target": 500000.0,
    "progress_percent": 64.0
}
```

**Используется в:**
- Deposits Widget → `savings_summary`
- Quick Actions Widget → кнопка "Пополнить SDP"

---

## 🔄 Кеширование данных

**Файл:** `hktn/backend/services/analytics.py` → `get_dashboard_metrics()`

**Стратегия кеширования:**
1. Проверяет кеш в БД (если не `force_refresh`)
2. Если кеш свежий (< 15 минут) → возвращает из кеша
3. Если устарел → пересчитывает
4. Сохраняет в кеш на 30 минут

**Преимущества:**
- Быстрая загрузка главного экрана
- Меньше нагрузки на банковские API
- Информация о свежести данных в UI

---

## 📊 Маппинг данных: Backend → Frontend

### **STS Widget**

**Backend:**
```python
"sts_today": {
    "amount": 12500.0,
    "spent": 0.0,  # TODO: отслеживать через транзакции
    "tomorrow": {
        "amount": 12500.0,
        "impact": "Стабильный прогноз"
    }
}
```

**Frontend (HomeScreen.tsx):**
```typescript
const effectiveSTS = {
    today: {
        amount: dashboardData.sts_today.amount,      // 12500.0
        spent: dashboardData.sts_today.spent,        // 0.0
    },
    tomorrow: {
        impact: dashboardData.sts_today.tomorrow.impact  // "Стабильный прогноз"
    },
};
```

**STS Widget:**
- Отображает `effectiveSTS.today.amount` как основной индикатор
- Показывает прогресс-бар: `spent / amount * 100`
- Отображает `tomorrow.impact` внизу виджета

---

### **Loans Widget**

**Backend:**
```python
"loan_summary": {
    "total_outstanding": 450000.0,
    "mandatory_daily_payment": 850.0,
    "additional_daily_payment": 1200.0,
    "total_monthly_payment": 25500.0
}
```

**Frontend:**
```typescript
const effectiveLoans = {
    summary: dashboardData.loan_summary,
    items: appState.loans.items  // Детали кредитов (пока из mock)
};
```

**Loans Widget:**
- Отображает `total_outstanding` как основной долг
- Показывает `mandatory_daily_payment` с кнопкой "Оплатить"
- Показывает `additional_daily_payment` с кнопкой "Оплатить"

---

### **Health Widget**

**Backend:**
```python
"health_score": {
    "value": 72.0,
    "status": "good",
    "reasons": ["STS выше 40%", "Долг снизился на 5%"]
}
```

**Frontend:**
```typescript
const effectiveHealth = {
    score: dashboardData.health_score.value,  // 72.0
    status: dashboardData.health_score.status === 'good' ? 'спокойно' : ...,
    reasons: dashboardData.health_score.reasons || [],
    next_action: appState.health.next_action  // Пока из mock
};
```

**Health Widget:**
- Отображает `score` в круговом индикаторе
- Показывает `status` как цветной бейдж
- Выводит `reasons` как список причин
- Показывает `next_action` как рекомендацию

---

### **Upcoming Events Widget**

**Backend:**
```python
"events_next_30d": [
    {
        "date": "2025-11-10",
        "type": "loan_payment",
        "amount": 8500.0,
        "description": "Платеж по кредиту"
    }
]
```

**Frontend:**
```typescript
{dashboardData?.events_next_30d && dashboardData.events_next_30d.length > 0 && (
    <UpcomingEventsWidget
        events={dashboardData.events_next_30d}
        onTap={() => onNavigate('timeline')}
        onQuickPay={(event) => {
            if (event.type === 'loan_payment') {
                onPayment('mdp');
            }
        }}
    />
)}
```

**Upcoming Events Widget:**
- Показывает топ-3 события
- Цветовое кодирование по типу
- Индикация срочности (<3 дней)
- Быстрое действие "Оплатить" для платежей

---

## 🔍 Отслеживание потраченных средств (STS.spent)

**Текущее состояние:** `sts_today.spent` всегда `0.0` (TODO)

**Планируемая реализация:**
1. Фильтровать транзакции за сегодня (debit)
2. Суммировать суммы транзакций
3. Обновлять при каждом запросе dashboard

**Файл:** `hktn/backend/services/analytics.py` (строка 371)
```python
"spent": 0.0,  # TODO: отслеживать через транзакции за сегодня
```

---

## 📝 Итоговая схема данных

```
┌─────────────────────────────────────────────────────────┐
│                    OpenBanking API                       │
│  (VBank, ABank, SBank через OBR Client)                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ accounts, balances, transactions, credits
                     ▼
┌─────────────────────────────────────────────────────────┐
│              analytics.py                                │
│  _calculate_dashboard_metrics()                          │
│                                                           │
│  1. transactions_categorization_salary_and_loans()       │
│  2. total_debit_balance_calculation()                    │
│  3. total_debt_calculation()                            │
│  4. mdp_calculation()                                    │
│  5. adp_calculation()                                    │
│  6. sts_calculation()                                    │
│  7. _calculate_health_score()                           │
│  8. _get_upcoming_events()                               │
│  9. _calculate_savings_summary()                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ DashboardResponse JSON
                     ▼
┌─────────────────────────────────────────────────────────┐
│              HomeScreen.tsx                              │
│                                                           │
│  - getDashboard() → API call                             │
│  - Преобразование данных для виджетов                    │
│  - Передача через props                                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Props
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Widgets                                     │
│                                                           │
│  - STSWidget (sts_today)                                 │
│  - HealthWidget (health_score)                           │
│  - LoansDepositsWidget (loan_summary)                    │
│  - UpcomingEventsWidget (events_next_30d)                │
│  - QuickActionsWidget (mdp/adp/sdp)                      │
│  - DebitCardsWidget (total_debit_cards_balance)          │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ Ключевые моменты

1. **Все расчеты на Backend** - Frontend только отображает данные
2. **Единый источник данных** - один endpoint `/api/dashboard`
3. **Кеширование** - данные кешируются на 15-30 минут
4. **Параллельные запросы** - данные из банков загружаются параллельно
5. **Fallback на mock** - если API недоступен, используются mock данные
6. **Типизация** - TypeScript интерфейсы для всех данных

---

## 🚀 Улучшения в будущем

1. **Отслеживание потраченных средств** - реализовать `sts_today.spent`
2. **Расчет STS на завтра** - улучшить `sts_today.tomorrow.amount`
3. **Refinance Triggers** - добавить реальные триггеры из алгоритмов
4. **Детали кредитов** - загружать из API вместо mock данных
5. **Real-time обновления** - WebSocket для обновления данных в реальном времени

