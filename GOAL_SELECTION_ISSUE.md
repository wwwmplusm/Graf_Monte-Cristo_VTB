# 🐛 Проблема: Недоступна опция "Закрыть кредиты" при наличии кредитной карты

## Описание проблемы

**Ситуация:** 
- Пользователь `team260-10` имеет кредитную карту в личном кабинете банка
- При прохождении онбординга в приложении доступна только опция "Накопить деньги"
- Кнопка "Закрыть кредиты" не показывается

**Ожидаемое поведение:**
- Если у пользователя есть кредиты или кредитные карты → показывать обе опции
- Если долгов нет → показывать только "Накопить деньги"

---

## Анализ логов

### Ключевые строки из backend логов:

```
INFO:finpulse.backend.analytics:Fetched 1 credits from bank, sample product types: ['card']
INFO:finpulse.backend.analytics:Calculating debt from 1 credit agreements
INFO:finpulse.backend.algorithms:Processing 1 agreements for debt calculation
INFO:finpulse.backend.algorithms:Debt calculation complete: total=0.00 (loans=0.00, cards=0.00), active_loans=0
INFO:finpulse.backend.analytics:Debt calculation result: total_debt=0.00, loans=0.00, cards=0.00, active_loans=0
INFO:finpulse.backend.analytics:Dashboard payload for team260-10 generated (balance=1502425.29, sts=1497425.29, mode=deposits)
```

### API Response:

```json
{
  "loan_summary": {
    "total_outstanding": 0.0,
    "mandatory_daily_payment": 0.0,
    "additional_daily_payment": 0.0,
    "total_monthly_payment": 0.0
  },
  "user_mode": "deposits"
}
```

---

## Причина проблемы

Алгоритм расчета долга (`total_debt_calculation` в `algorithms.py`) получил 1 кредитное соглашение типа `'card'`, но рассчитал задолженность = 0.00 ₽.

Это может происходить по нескольким причинам:

### 1. Статус соглашения не "active"

**Код:** `algorithms.py` строки 311-313
```python
if status not in ["active", "in_arrears"]:
    logger.debug("Skipping agreement with status '%s'", status)
    continue
```

**Возможные проблемы:**
- Статус может быть "inactive", "closed", "pending" и т.д.
- Регистр может не совпадать (если не приводится к lowercase правильно)

### 2. product_type не распознается как кредитный продукт

**Код:** `algorithms.py` строки 315-324
```python
product_type_lower = product_type.lower()
is_credit_type = (
    product_type_lower in CREDIT_PRODUCT_TYPES or
    any(keyword in product_type_lower for keyword in ["credit", "loan", "кредит", "заем", "займ", "overdraft", "mortgage", "ипотека"])
)

if not is_credit_type:
    logger.debug("Skipping agreement with product_type '%s' (not recognized as credit)", product_type)
    continue
```

**CREDIT_PRODUCT_TYPES:**
```python
CREDIT_PRODUCT_TYPES = ["loan", "credit_card", "overdraft", "mortgage"]
```

**Возможные проблемы:**
- product_type = "card" (без "credit_")
- "card" не входит в список CREDIT_PRODUCT_TYPES
- Нужно добавить "card" в список keywords

### 3. Все поля задолженности пустые или равны нулю

**Код:** `algorithms.py` строки 357-364
```python
elif is_card:
    # Waterfall: outstanding_balance → used_amount → amount
    debt_amount = (
        float(agreement.get("outstandingBalance") or agreement.get("outstanding_balance") or 0) or
        float(agreement.get("usedAmount") or agreement.get("used_amount") or 0) or
        float(agreement.get("amount") or agreement.get("currentBalance") or agreement.get("current_balance") or 0) or
        0.0
    )
```

**Возможные проблемы:**
- Банк использует другие названия полей (например, "debtAmount", "balance", "usedCredit")
- Все эти поля возвращают 0 (карта не используется)
- Поля присутствуют, но в другом формате (nested dict, etc.)

---

## Решение

### Шаг 1: Добавить детальное логирование

Уже добавлено в `analytics.py`:
```python
logger.info("Full first credit agreement: %s", all_credits[0])
```

### Шаг 2: Проанализировать структуру данных

После запуска `curl http://localhost:8000/api/dashboard?user_id=team260-10&force_refresh=true` смотрим логи backend.

### Шаг 3: Исправить алгоритм в зависимости от найденной проблемы

#### Вариант A: Добавить "card" в keywords

**Файл:** `hktn/backend/services/algorithms.py` (строка 319)

```python
# БЫЛО:
any(keyword in product_type_lower for keyword in ["credit", "loan", "кредит", "заем", "займ", "overdraft", "mortgage", "ипотека"])

# СТАЛО:
any(keyword in product_type_lower for keyword in ["card", "credit", "loan", "кредит", "заем", "займ", "overdraft", "mortgage", "ипотека"])
```

#### Вариант B: Добавить "card" в CREDIT_PRODUCT_TYPES

**Файл:** `hktn/backend/services/algorithms.py` (строка 20)

```python
# БЫЛО:
CREDIT_PRODUCT_TYPES = ["loan", "credit_card", "overdraft", "mortgage"]

# СТАЛО:
CREDIT_PRODUCT_TYPES = ["loan", "credit_card", "card", "overdraft", "mortgage"]
```

#### Вариант C: Добавить больше вариантов названий полей

**Файл:** `hktn/backend/services/algorithms.py` (строки 359-364)

```python
elif is_card:
    # Waterfall: outstanding_balance → used_amount → amount → debtAmount → balance
    debt_amount = (
        float(agreement.get("outstandingBalance") or agreement.get("outstanding_balance") or 0) or
        float(agreement.get("usedAmount") or agreement.get("used_amount") or 0) or
        float(agreement.get("amount") or agreement.get("currentBalance") or agreement.get("current_balance") or 0) or
        float(agreement.get("debtAmount") or agreement.get("debt_amount") or 0) or
        float(agreement.get("balance") or 0) or
        0.0
    )
```

#### Вариант D: Проверять creditLimit и вычислять используемую сумму

```python
elif is_card:
    # Try direct debt fields first
    debt_amount = (
        float(agreement.get("outstandingBalance") or agreement.get("outstanding_balance") or 0) or
        float(agreement.get("usedAmount") or agreement.get("used_amount") or 0) or
        float(agreement.get("amount") or agreement.get("currentBalance") or agreement.get("current_balance") or 0)
    )
    
    # If still 0, try to calculate from creditLimit - availableAmount
    if debt_amount == 0:
        credit_limit = float(agreement.get("creditLimit") or agreement.get("credit_limit") or 0)
        available = float(agreement.get("availableAmount") or agreement.get("available_amount") or 0)
        if credit_limit > 0:
            debt_amount = credit_limit - available
```

---

## Временное решение (workaround)

Пока не исправлен алгоритм, можно добавить тестовые данные в БД:

```sql
-- Добавить финансовые данные с кредитом для тестирования
INSERT INTO user_financial_inputs (
    user_id, 
    credit_payment_amount, 
    credit_payment_date
)
VALUES (
    'team260-10', 
    10000,  -- Сумма платежа по кредиту
    '2025-12-15'  -- Дата платежа
)
ON CONFLICT(user_id) DO UPDATE SET
    credit_payment_amount=excluded.credit_payment_amount,
    credit_payment_date=excluded.credit_payment_date;
```

**НО** это не решит проблему с определением режима, так как `user_mode` определяется на основе `total_debt_base`.

---

## Действия для исправления

1. **Проверить логи backend** - найти строку `"Full first credit agreement:"`
2. **Скопировать JSON структуру** кредитного соглашения
3. **Определить:**
   - Какой product_type возвращает банк
   - Какой status у соглашения
   - Какие поля содержат сумму задолженности
4. **Исправить алгоритм** в `algorithms.py` на основе найденных данных
5. **Протестировать:** 
   ```bash
   curl "http://localhost:8000/api/dashboard?user_id=team260-10&force_refresh=true"
   ```
6. **Проверить:** `user_mode` должен стать `"loans"`, а `total_outstanding` > 0

---

## Где смотреть код

1. **Алгоритм расчета долга:**
   - `hktn/backend/services/algorithms.py` → `total_debt_calculation()`
   - Строки 268-407

2. **Определение режима пользователя:**
   - `hktn/backend/services/analytics.py` → `_calculate_dashboard_metrics()`
   - Строка 345: `user_mode = "loans" if debt_result["total_debt_base"] > 0 else "deposits"`

3. **Логика отображения кнопки на frontend:**
   - `hktn/src/components/steps/Step5Questions.tsx`
   - Проверка: `checkUserHasLoans()` → вызывает `/api/dashboard` и смотрит на `loan_summary.total_outstanding`

---

## Чек-лист диагностики

- [ ] Добавлено детальное логирование (✅ готово)
- [ ] Запущен force_refresh для получения свежих данных
- [ ] Найдена строка "Full first credit agreement:" в логах backend
- [ ] Скопирована структура кредитного соглашения
- [ ] Определен product_type
- [ ] Определен status
- [ ] Найдены поля с суммой задолженности
- [ ] Исправлен алгоритм
- [ ] Протестировано

---

## Примечания

Согласно бизнес-логике из `back onboard.md` (строка 171):
```
КНОПКА ЗАКРЫТЬ КРЕДИТЫ ДОСТУПНА ТОЛЬКО ЕСЛИ У ЧЕЛОВЕКА ЕСТЬ КРЕДИТЫ / КРЕДИТНЫЕ КАРТЫ
```

Логика реализована правильно, проблема только в том, что алгоритм не распознает кредитную карту как долг.

