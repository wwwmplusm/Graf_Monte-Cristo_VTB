# 🤖 Инструкции для AI агента: Реализация Payment Consent Flow

## 📋 Контекст

Ты работаешь над финансовым приложением FinPulse для хакатона Open Banking Russia. 

**Задача**: Реализовать Payment Consent Flow - третий тип согласия для работы с платежами.

**Текущее состояние**:
- ✅ Account consent реализован (`initiate_consent()`)
- ✅ Product consent реализован (`initiate_product_consent()`)
- ❌ **Payment consent НЕ РЕАЛИЗОВАН** - нужно добавить

**Цель**: Создать полный flow для payment consent, аналогичный существующим account и product consent.

---

## 🎯 Задачи (в порядке выполнения)

### Задача 1: Добавить метод в `obr_client.py`

**Файл**: `hktn/core/obr_client.py`

**Действие**: Добавить метод `initiate_payment_consent()` после строки 360 (после `initiate_product_consent()`)

**Требования**:
1. Сигнатура: `async def initiate_payment_consent(self, user_id: str, user_display_name: Optional[str] = None) -> Optional[ConsentInitResult]`
2. Использовать паттерн из `initiate_product_consent()` (строки 274-360)
3. Endpoint: `/payment-consents/request` (попробуй также `/payment-consent-requests` если первый не работает)
4. Permissions должны включать:
   - `InitiateSinglePayment`
   - `InitiateMultiplePayment`
   - `CreateVariableRecurringPayment`
5. Пробовать несколько вариантов payload (как в `initiate_product_consent`)
6. Логировать все попытки
7. Возвращать `ConsentInitResult` или `None`

**Референс**: Смотри на `initiate_product_consent()` строки 274-360

---

### Задача 2: Добавить функцию в `consents.py`

**Файл**: `hktn/backend/services/consents.py`

**Действие**: Добавить функцию `initiate_payment_consent()` после строки 132 (после `initiate_product_consent()`)

**Требования**:
1. Сигнатура: `async def initiate_payment_consent(req: ConsentInitiateRequest) -> Dict[str, Any]`
2. Использовать паттерн из `initiate_product_consent()` (строки 77-132)
3. Вызывать `client.initiate_payment_consent(req.user_id)`
4. Сохранять в БД с `consent_type="payments"` (⚠️ ВАЖНО!)
5. Обрабатывать ошибки gracefully (возвращать error state, не падать)
6. Логировать все действия
7. Возвращать структурированный ответ с полями:
   - `bank_id`, `bank_name`, `type: "payment"`
   - `state`, `status`, `consent_id`, `request_id`, `approval_url`, `auto_approved`

**Референс**: Смотри на `initiate_product_consent()` строки 77-132

---

### Задача 3: Обновить `initiate_full_consent_flow()`

**Файл**: `hktn/backend/services/consents.py`

**Действие**: Обновить функцию `initiate_full_consent_flow()` (строки 135-166)

**Требования**:
1. Создавать **ВСЕ ТРИ** типа consent: account + product + payment
2. Product consent создавать **ВСЕГДА** (не только при auto-approve account consent)
3. Payment consent создавать **ВСЕГДА**
4. Ошибки product/payment consent не должны блокировать процесс (graceful degradation)
5. Логировать все результаты

**Текущий код** (строки 135-166):
```python
async def initiate_full_consent_flow(req: ConsentInitiateRequest) -> Dict[str, Any]:
    account_result = await initiate_consent(req)
    
    if account_result.get("auto_approved"):  # ⚠️ ПРОБЛЕМА
        try:
            product_result = await initiate_product_consent(req)
            # ...
```

**Нужно изменить на**:
```python
async def initiate_full_consent_flow(req: ConsentInitiateRequest) -> Dict[str, Any]:
    """Create all three types of consents: account + product + payment."""
    user_id = req.user_id
    bank_id = req.bank_id
    
    # 1. Account consent (обязательный)
    account_result = await initiate_consent(req)
    
    # 2. Product consent (всегда, не критично если не получится)
    try:
        logger.info("Creating product consent for %s@%s", user_id, bank_id)
        product_result = await initiate_product_consent(req)
        if product_result.get("state") != "error":
            logger.info("Product consent created: %s", product_result.get("consent_id"))
    except Exception as exc:
        logger.warning("Product consent creation failed (non-critical): %s", exc)
    
    # 3. Payment consent (всегда, не критично если не получится)
    try:
        logger.info("Creating payment consent for %s@%s", user_id, bank_id)
        payment_result = await initiate_payment_consent(req)
        if payment_result.get("state") != "error":
            logger.info("Payment consent created: %s", payment_result.get("consent_id"))
    except Exception as exc:
        logger.warning("Payment consent creation failed (non-critical): %s", exc)
    
    return account_result
```

---

### Задача 4: Добавить endpoint в роутер

**Файл**: `hktn/backend/routers/consents.py`

**Действие**: Добавить endpoint после строки 20

**Требования**:
1. Endpoint: `POST /api/consent/initiate/payment`
2. Принимает `ConsentInitiateRequest`
3. Вызывает `consents.initiate_payment_consent(req)`

**Код для добавления**:
```python
@router.post("/consent/initiate/payment")
async def initiate_payment_consent_endpoint(req: ConsentInitiateRequest):
    """Initiate payment consent for a bank."""
    return await consents.initiate_payment_consent(req)
```

---

## 📁 Файлы для изучения

### Обязательные файлы:

1. **`hktn/core/obr_client.py`**
   - Строки 274-360: `initiate_product_consent()` - **РЕФЕРЕНС ДЛЯ ЗАДАЧИ 1**
   - Строки 188-273: `initiate_consent()` - пример account consent
   - Строки 56-66: `ConsentInitResult` dataclass

2. **`hktn/backend/services/consents.py`**
   - Строки 77-132: `initiate_product_consent()` - **РЕФЕРЕНС ДЛЯ ЗАДАЧИ 2**
   - Строки 135-166: `initiate_full_consent_flow()` - **ЗАДАЧА 3**
   - Строки 22-74: `initiate_consent()` - пример account consent

3. **`hktn/backend/routers/consents.py`**
   - Строки 18-20: endpoint для product consent - **РЕФЕРЕНС ДЛЯ ЗАДАЧИ 4**

4. **`hktn/core/database.py`**
   - Строки 110-140: `save_consent()` - сохранение в БД
   - Важно: использовать `consent_type="payments"`

---

## 🧪 Тестирование

После реализации проверь:

### Тест 1: Создание payment consent
```bash
curl -X POST http://localhost:8000/api/consent/initiate/payment \
  -H "Content-Type: application/json" \
  -d '{"user_id": "team260-3", "bank_id": "abank"}'
```

**Ожидаемый результат**:
```json
{
  "bank_id": "abank",
  "bank_name": "ABank",
  "type": "payment",
  "state": "approved",
  "consent_id": "payc-xxxxx",
  "auto_approved": true
}
```

### Тест 2: Проверка в БД
```bash
sqlite3 finpulse_consents.db \
  "SELECT * FROM consents WHERE consent_type='payments' AND user_id='team260-3';"
```

**Ожидаемый результат**: Запись с `consent_type='payments'`

### Тест 3: Full flow
```bash
curl -X POST http://localhost:8000/api/consent/initiate \
  -H "Content-Type: application/json" \
  -d '{"user_id": "team260-3", "bank_id": "abank"}'
```

**Ожидаемое поведение**: Создаются все три типа consent (account, product, payment)

---

## ⚠️ Важные замечания

1. **Endpoint может отличаться**: Банки могут использовать `/payment-consents/request` или `/payment-consent-requests`. Попробуй оба.

2. **Permissions могут отличаться**: Используй несколько вариантов payload с разными названиями permissions.

3. **Graceful degradation**: Если payment consent не создается - это НЕ критично. Логируй ошибку, но не падай.

4. **Тип consent**: ОБЯЗАТЕЛЬНО используй `consent_type="payments"` при сохранении в БД.

5. **Логирование**: Логируй все шаги для дебага:
   ```python
   logger.info("Initiating PAYMENT consent for user '%s' with bank '%s'", user_id, bank_id)
   logger.warning("Payment consent failed: %s", error)
   ```

---

## ✅ Критерии успеха

- [ ] Метод `initiate_payment_consent()` добавлен в `obr_client.py`
- [ ] Функция `initiate_payment_consent()` добавлена в `consents.py`
- [ ] `initiate_full_consent_flow()` обновлена для создания всех трех типов
- [ ] Endpoint `/api/consent/initiate/payment` добавлен в роутер
- [ ] Payment consent сохраняется в БД с типом "payments"
- [ ] Обработка ошибок реализована (graceful degradation)
- [ ] Логирование добавлено
- [ ] Тесты проходят

---

## 🚀 Начни с Задачи 1!

Изучи `initiate_product_consent()` в `obr_client.py` (строки 274-360) и адаптируй его для payment consent.

**Удачи! 🎯**

