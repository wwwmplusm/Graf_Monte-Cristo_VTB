<!-- ef4b90fa-e79d-40a6-8a14-5c9cf31c52f5 341fde11-9aba-4ca0-a823-c6bd4106f366 -->
# План устранения критических и важных ошибок

## Критические исправления (Приоритет 1)

### 1. Исправить сохранение onboarding_id в БД

**Проблема:** `onboarding_id` не сохраняется, используется placeholder в `get_onboarding_status`.

**Файлы:**

- `hktn/core/database.py` - добавить функции для работы с onboarding_sessions
- `hktn/backend/services/onboarding.py:16` - сохранять onboarding_id при старте
- `hktn/backend/services/onboarding.py:33` - получать user_id из БД

**Изменения:**

1. Обновить структуру таблицы `onboarding_sessions` в `init_db()`:
```python
CREATE TABLE IF NOT EXISTS onboarding_sessions (
    onboarding_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT,
    status TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);
```

2. Добавить функции в `database.py`:
```python
def save_onboarding_session(onboarding_id: str, user_id: str, user_name: Optional[str] = None, status: str = "started") -> None

def get_onboarding_session(onboarding_id: str) -> Optional[Dict[str, Any]]

def update_onboarding_session_status(onboarding_id: str, status: str) -> None
```

3. Обновить `start_onboarding()` для сохранения в БД
4. Обновить `get_onboarding_status()` для получения user_id из БД

---

### 2. Исправить finalize_onboarding - запустить bootstrap автоматически

**Проблема:** После финализации не запускается автоматическая загрузка данных из банков.

**Файл:** `hktn/backend/services/onboarding.py:86`

**Изменения:**

В `finalize_onboarding()` после проверки consents добавить:

```python
from .banking import bootstrap_bank

bootstrap_results = []
connected_banks = set()
for consent in approved_consents:
    bank_id = consent.get("bank_id")
    if bank_id and bank_id not in connected_banks:
        connected_banks.add(bank_id)
        try:
            result = await bootstrap_bank(bank_id, user_id)
            bootstrap_results.append({
                "bank_id": bank_id,
                "status": "ok",
                "accounts_count": len(result.get("accounts", [])),
                "transactions_count": len(result.get("transactions", [])),
            })
        except Exception as e:
            logger.error("Failed to bootstrap bank %s: %s", bank_id, e)
            bootstrap_results.append({
                "bank_id": bank_id,
                "status": "error",
                "error": str(e),
            })

# Обновить статус onboarding session
update_onboarding_session_status(req.onboarding_id, "completed")
```

Вернуть `bootstrap_results` в ответе.

---

### 3. Исправить Payment endpoints - использовать реальные account_id

**Проблема:** Используется placeholder `account-{user_id}-{bank_id}` вместо реального account_id.

**Файл:** `hktn/backend/services/payments.py:17-193`

**Изменения:**

Для каждого метода (pay_mdp, pay_adp, pay_sdp):

1. Получить реальные счета через `fetch_bank_accounts_with_consent`:
```python
from .banking import fetch_bank_accounts_with_consent

accounts = await fetch_bank_accounts_with_consent(
    bank_id, 
    account_consent.consent_id, 
    req.user_id
)

if not accounts:
    raise HTTPException(status_code=400, detail="No accounts found")

# Найти дебетовый счет для списания
debtor_account = None
for account in accounts:
    account_type = account.get("accountType") or account.get("account_type", "").lower()
    if account_type in ["checking", "current", "savings"]:
        debtor_account = account.get("accountId") or account.get("account_id")
        break

if not debtor_account:
    debtor_account = accounts[0].get("accountId") or accounts[0].get("account_id")
```

2. Для MDP/ADP: найти счет кредита через product agreements (если loan_id не указан)
3. Для SDP: использовать deposit_id или найти через product agreements
4. Использовать реальный `debtor_account` вместо placeholder

---

### 4. Реализовать расчет SDP (Savings Daily Payment)

**Проблема:** SDP использует placeholder `500.0` вместо реального расчета.

**Файл:** `hktn/backend/services/analytics.py:554`

**Изменения:**

Обновить `_calculate_savings_summary()`:

```python
def _calculate_savings_summary(
    deposits: List[Dict[str, Any]], 
    target: Optional[float] = None,
    monthly_income: Optional[float] = None,
    goal_date: Optional[date] = None
) -> Dict[str, Any]:
    total_saved = sum(...)
    
    # Расчет SDP на основе цели
    if target and goal_date:
        today = date.today()
        days_remaining = max(1, (goal_date - today).days)
        remaining_amount = max(0, target - total_saved)
        daily_payment = remaining_amount / days_remaining if days_remaining > 0 else 0.0
    elif monthly_income:
        # 10% от дохода в день (если цель не задана)
        daily_payment = (monthly_income * 0.1) / 30.0
    else:
        daily_payment = 500.0  # Fallback
    
    # ... остальной код
```

Обновить вызов в `_calculate_dashboard_metrics()`:

```python
financial_inputs = _load_financial_inputs(user_id) or {}
savings_target = financial_inputs.get("savings_target")
savings_goal_date = _parse_iso_date(financial_inputs.get("savings_goal_date"))

savings_summary = _calculate_savings_summary(
    all_deposits,
    target=savings_target,
    monthly_income=categorization_result["estimated_monthly_income"],
    goal_date=savings_goal_date
)
```

---

### 5. Сохранять настройки онбординга для использования в расчетах

**Проблема:** Dashboard использует hardcoded `repayment_speed="balanced"` и `strategy="avalanche"`.

**Файлы:**

- `hktn/core/database.py:433` - расширить `upsert_user_financial_inputs`
- `hktn/backend/services/onboarding.py:86` - сохранять настройки при финализации
- `hktn/backend/services/analytics.py:264` - использовать настройки из БД

**Изменения:**

1. Расширить таблицу `user_financial_inputs`:
```sql
ALTER TABLE user_financial_inputs ADD COLUMN repayment_speed TEXT;
ALTER TABLE user_financial_inputs ADD COLUMN repayment_strategy TEXT;
ALTER TABLE user_financial_inputs ADD COLUMN savings_target REAL;
ALTER TABLE user_financial_inputs ADD COLUMN savings_goal_date TEXT;
```

2. Обновить `upsert_user_financial_inputs()` для принятия новых параметров
3. Обновить `get_user_financial_inputs()` для возврата новых полей
4. В `finalize_onboarding()` сохранять настройки из `req.goals` (если есть)
5. В `_calculate_dashboard_metrics()` использовать настройки из БД:
```python
financial_inputs = _load_financial_inputs(user_id) or {}
repayment_speed = financial_inputs.get("repayment_speed", "balanced")
strategy = financial_inputs.get("repayment_strategy", "avalanche")

adp_result = adp_calculation(
    ...,
    repayment_speed=repayment_speed,
    strategy=strategy,
)
```


---

## Важные исправления (Приоритет 2)

### 6. Добавить персистентное хранение данных (accounts, transactions, balances, credits)

**Проблема:** Данные хранятся только в памяти, теряются при перезапуске.

**Файл:** `hktn/core/database.py`

**Изменения:**

1. Создать таблицы в `init_db()`:
```sql
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    bank_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    account_data TEXT NOT NULL,  -- JSON
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, bank_id, account_id)
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    bank_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    transaction_data TEXT NOT NULL,  -- JSON
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, bank_id, transaction_id)
);

CREATE TABLE IF NOT EXISTS balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    bank_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    balance_data TEXT NOT NULL,  -- JSON
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    bank_id TEXT NOT NULL,
    credit_id TEXT NOT NULL,
    credit_data TEXT NOT NULL,  -- JSON
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, bank_id, credit_id)
);
```

2. Добавить функции сохранения:
```python
def save_accounts(user_id: str, bank_id: str, accounts: List[Dict[str, Any]]) -> None
def save_transactions(user_id: str, bank_id: str, account_id: str, transactions: List[Dict[str, Any]]) -> None
def save_balances(user_id: str, bank_id: str, account_id: str, balances: List[Dict[str, Any]]) -> None
def save_credits(user_id: str, bank_id: str, credits: List[Dict[str, Any]]) -> None
```

3. Обновить `bootstrap_bank()` для сохранения данных в БД после загрузки

---

### 7. Улучшить обработку ошибок в payment endpoints

**Проблема:** Нет детальной обработки ошибок, нет валидации данных.

**Файл:** `hktn/backend/services/payments.py`

**Изменения:**

1. Добавить валидацию суммы платежа (должна быть > 0)
2. Добавить проверку наличия достаточного баланса (опционально)
3. Улучшить сообщения об ошибках
4. Добавить логирование всех операций

---

### 8. Обновить dashboard cache после платежей

**Проблема:** После платежа dashboard cache не обновляется.

**Файл:** `hktn/backend/services/payments.py`

**Изменения:**

После успешного платежа добавить:

```python
from hktn.core.database import invalidate_dashboard_cache

# После успешного платежа
invalidate_dashboard_cache(req.user_id)
```

---

## Порядок выполнения

1. Исправить сохранение onboarding_id (задача 1)
2. Исправить finalize_onboarding (задача 2)
3. Исправить payment endpoints (задача 3)
4. Реализовать расчет SDP (задача 4)
5. Сохранять настройки онбординга (задача 5)
6. Добавить персистентное хранение данных (задача 6)
7. Улучшить обработку ошибок (задача 7)
8. Обновить dashboard cache после платежей (задача 8)