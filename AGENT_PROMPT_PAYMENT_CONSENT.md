# 🤖 Промпт для агента: Реализация Payment Consent Flow

## 📋 Контекст задачи

Ты работаешь над финансовым приложением FinPulse для хакатона Open Banking Russia. Нужно реализовать **Payment Consent Flow** - третий тип согласия для работы с платежами.

**Текущее состояние**:
- ✅ Account consent реализован и работает
- ✅ Product consent реализован и работает  
- ❌ **Payment consent НЕ РЕАЛИЗОВАН** - это нужно добавить

**Цель**: Реализовать полный flow создания payment consent для всех типов платежей (Single, Multiple, VRP).

---

## 🎯 Задачи

### Задача 1: Добавить `initiate_payment_consent()` в `obr_client.py`

**Файл**: `hktn/core/obr_client.py`

**Требования**:
1. Метод должен быть аналогичен `initiate_product_consent()`, но для payment consent
2. Endpoint банка: `/payment-consents/request` или `/payment-consent-requests`
3. Permissions должны включать:
   - `InitiateSinglePayment` (для MDP - обязательных платежей)
   - `InitiateMultiplePayment` (для ADP - дополнительных платежей)
   - `CreateVariableRecurringPayment` (для SDP - регулярных накоплений)
4. Должен пробовать несколько вариантов payload (как `initiate_product_consent`)
5. Должен возвращать `ConsentInitResult` или `None`

**Пример структуры** (используй как референс `initiate_product_consent`):
```python
async def initiate_payment_consent(
    self, user_id: str, user_display_name: Optional[str] = None
) -> Optional[ConsentInitResult]:
    """Создает payment consent для всех типов платежей"""
    bank_token = await self._get_bank_token()
    headers = await self._get_common_headers(bank_token)
    url = "/payment-consents/request"  # или другой endpoint
    
    # Попробуй несколько вариантов payload
    payloads_to_try = [
        {
            "requesting_bank": self.team_id,
            "requesting_bank_name": f"{self.team_id} App",
            "client_id": user_id,
            "permissions": [
                "InitiateSinglePayment",
                "InitiateMultiplePayment",
                "CreateVariableRecurringPayment"
            ],
            "reason": "FinPulse: автоматические платежи по кредитам и накоплениям",
        },
        # Добавь fallback варианты если первый не работает
    ]
    
    # Логика аналогична initiate_product_consent
    # Обработка ответа, извлечение consent_id, request_id, status
```

**Важно**:
- Используй `@api_retry` декоратор для retry логики
- Логируй все попытки и результаты
- Обрабатывай разные форматы ответов от банков (как в `initiate_product_consent`)

---

### Задача 2: Добавить `initiate_payment_consent()` в `consents.py`

**Файл**: `hktn/backend/services/consents.py`

**Требования**:
1. Функция должна быть аналогична `initiate_product_consent()`
2. Должна вызывать `client.initiate_payment_consent()`
3. Должна сохранять consent в БД с `consent_type="payments"`
4. Должна возвращать структурированный ответ с полями:
   - `bank_id`, `bank_name`, `type: "payment"`
   - `state`, `status`, `consent_id`, `request_id`, `approval_url`, `auto_approved`
5. Должна обрабатывать ошибки gracefully (возвращать error state, не падать)

**Пример структуры**:
```python
async def initiate_payment_consent(req: ConsentInitiateRequest) -> Dict[str, Any]:
    """Initiate payment consent for the selected bank."""
    bank_config = get_bank_config(req.bank_id, require_url=True)
    async with bank_client(req.bank_id) as client:
        try:
            logger.info("Initiating PAYMENT consent for user '%s' with bank '%s'", req.user_id, req.bank_id)
            consent_meta = await client.initiate_payment_consent(req.user_id)
            
            if not consent_meta or not (consent_meta.consent_id or consent_meta.request_id):
                raise HTTPException(status_code=502, detail="Bank did not provide payment consent identifier.")
            
            consent_identifier = consent_meta.consent_id or consent_meta.request_id
            initial_status = "APPROVED" if consent_meta.auto_approved else "AWAITING_USER"
            
            save_consent(
                req.user_id,
                req.bank_id,
                consent_identifier,
                initial_status,
                request_id=consent_meta.request_id,
                approval_url=consent_meta.approval_url,
                consent_type="payments",  # ⚠️ ВАЖНО: тип "payments"
            )
            
            if consent_meta.consent_id and consent_meta.auto_approved:
                update_consent_status(consent_meta.consent_id, "APPROVED")
            
            return {
                "bank_id": req.bank_id,
                "bank_name": bank_config.display_name,
                "type": "payment",
                "state": "approved" if consent_meta.auto_approved else "pending",
                "status": consent_meta.status,
                "consent_id": consent_meta.consent_id,
                "request_id": consent_meta.request_id,
                "approval_url": consent_meta.approval_url,
                "auto_approved": consent_meta.auto_approved,
            }
        except HTTPException as exc:
            # Обработка ошибок аналогично initiate_product_consent
            return {
                "bank_id": req.bank_id,
                "bank_name": bank_config.display_name,
                "type": "payment",
                "state": "error",
                "status": "error",
                "error_message": str(exc.detail if hasattr(exc, "detail") else exc),
            }
        except Exception as exc:
            # Graceful degradation
            logger.error("Failed to initiate PAYMENT consent: %s", exc)
            return {
                "bank_id": req.bank_id,
                "bank_name": bank_config.display_name,
                "type": "payment",
                "state": "error",
                "status": "error",
                "error_message": str(exc),
            }
```

---

### Задача 3: Обновить `initiate_full_consent_flow()`

**Файл**: `hktn/backend/services/consents.py`

**Требования**:
1. Функция должна создавать **ВСЕ ТРИ** типа consent: account + product + payment
2. Product consent должен создаваться **ВСЕГДА** (не только при auto-approve account consent)
3. Payment consent должен создаваться **ВСЕГДА**
4. Ошибки product/payment consent не должны блокировать процесс (graceful degradation)
5. Логировать все результаты

**Текущий код** (строка 135-166):
```python
async def initiate_full_consent_flow(req: ConsentInitiateRequest) -> Dict[str, Any]:
    account_result = await initiate_consent(req)
    
    if account_result.get("auto_approved"):  # ⚠️ ПРОБЛЕМА: только при auto-approve
        try:
            product_result = await initiate_product_consent(req)
            # ...
        except Exception:
            logger.warning("Product consent failed")
    
    return account_result
```

**Нужно изменить на**:
```python
async def initiate_full_consent_flow(req: ConsentInitiateRequest) -> Dict[str, Any]:
    """
    Create all three types of consents: account + product + payment.
    Product and payment consents are created regardless of account consent auto-approval status.
    """
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
        else:
            logger.warning("Product consent error: %s", product_result.get("error_message"))
    except Exception as exc:
        logger.warning("Product consent creation failed (non-critical): %s", exc)
    
    # 3. Payment consent (всегда, не критично если не получится)
    try:
        logger.info("Creating payment consent for %s@%s", user_id, bank_id)
        payment_result = await initiate_payment_consent(req)
        if payment_result.get("state") != "error":
            logger.info("Payment consent created: %s", payment_result.get("consent_id"))
        else:
            logger.warning("Payment consent error: %s", payment_result.get("error_message"))
    except Exception as exc:
        logger.warning("Payment consent creation failed (non-critical): %s", exc)
    
    return account_result
```

---

### Задача 4: Добавить endpoint в роутер

**Файл**: `hktn/backend/routers/consents.py`

**Требования**:
1. Добавить endpoint `POST /api/consent/initiate/payment`
2. Должен принимать `ConsentInitiateRequest`
3. Должен вызывать `consents.initiate_payment_consent()`

**Добавить после строки 20**:
```python
@router.post("/consent/initiate/payment")
async def initiate_payment_consent_endpoint(req: ConsentInitiateRequest):
    """Initiate payment consent for a bank."""
    return await consents.initiate_payment_consent(req)
```

---

## 📁 Файлы для контекста

### 1. Структура проекта

```
hktn/
├── core/
│   ├── obr_client.py          # Низкоуровневый клиент для банковского API
│   └── database.py            # Работа с БД (save_consent, find_consent_by_type)
├── backend/
│   ├── services/
│   │   └── consents.py        # Бизнес-логика создания consent
│   └── routers/
│       └── consents.py        # HTTP endpoints
```

### 2. Ключевые паттерны

**Паттерн создания consent** (используй для payment consent):
1. Получить bank token через `_get_bank_token()`
2. Подготовить headers через `_get_common_headers()`
3. Попробовать несколько вариантов payload
4. Обработать ответ, извлечь `consent_id`, `request_id`, `status`
5. Вернуть `ConsentInitResult`

**Паттерн сохранения в БД**:
```python
save_consent(
    user_id=req.user_id,
    bank_id=req.bank_id,
    consent_id=consent_identifier,
    status=initial_status,
    request_id=consent_meta.request_id,
    approval_url=consent_meta.approval_url,
    consent_type="payments",  # ⚠️ Тип для payment consent
)
```

---

## 🧪 Тестирование

После реализации проверь:

1. **Создание payment consent**:
```bash
curl -X POST http://localhost:8000/api/consent/initiate/payment \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "team260-3",
    "bank_id": "abank"
  }'
```

**Ожидаемый результат**:
```json
{
  "bank_id": "abank",
  "bank_name": "ABank",
  "type": "payment",
  "state": "approved",
  "status": "approved",
  "consent_id": "payc-xxxxx",
  "auto_approved": true
}
```

2. **Проверка в БД**:
```bash
sqlite3 finpulse_consents.db "SELECT * FROM consents WHERE consent_type='payments';"
```

3. **Проверка full flow**:
```bash
curl -X POST http://localhost:8000/api/consent/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "team260-3",
    "bank_id": "abank"
  }'
```

**Ожидаемое поведение**: Создаются все три типа consent (account, product, payment)

---

## ⚠️ Важные замечания

1. **Endpoint может отличаться**: Банки могут использовать разные endpoints:
   - `/payment-consents/request`
   - `/payment-consent-requests`
   - `/payments/consents/request`
   
   Попробуй несколько вариантов или проверь документацию банка.

2. **Permissions могут отличаться**: Некоторые банки могут требовать другие названия permissions. Используй fallback варианты.

3. **Graceful degradation**: Если payment consent не создается - это не критично. Логируй ошибку, но не падай.

4. **Логирование**: Логируй все шаги для дебага:
   ```python
   logger.info("Initiating PAYMENT consent for user '%s' with bank '%s'", user_id, bank_id)
   logger.warning("Payment consent failed: %s", error)
   ```

5. **Тип consent**: Обязательно используй `consent_type="payments"` при сохранении в БД.

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

## 📚 Референсные файлы

Смотри на реализацию `initiate_product_consent()` как на пример:
- `hktn/core/obr_client.py` строки 274-360
- `hktn/backend/services/consents.py` строки 77-132

Используй тот же паттерн, но адаптируй для payment consent.

---

**Готов приступить? Начни с задачи 1 - добавь метод в `obr_client.py`!**

