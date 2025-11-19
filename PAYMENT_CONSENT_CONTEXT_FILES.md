# 📎 Файлы для контекста: Payment Consent Implementation

## 🎯 Цель

Реализовать Payment Consent Flow - третий тип согласия для работы с платежами (MDP/ADP/SDP).

---

## 📁 Файлы для изучения и модификации

### 1. Основные файлы (ОБЯЗАТЕЛЬНО изучить)

#### `hktn/core/obr_client.py`
**Назначение**: Низкоуровневый клиент для работы с банковским API

**Ключевые секции**:
- **Строки 56-66**: `ConsentInitResult` dataclass - структура результата
- **Строки 188-273**: `initiate_consent()` - пример создания account consent
- **Строки 274-360**: `initiate_product_consent()` - **РЕФЕРЕНС ДЛЯ РЕАЛИЗАЦИИ**
- **Строки 159-187**: `_get_bank_token()` - получение токена банка
- **Строки 130-158**: `_get_common_headers()` - подготовка headers

**Что нужно сделать**: Добавить метод `initiate_payment_consent()` после строки 360

---

#### `hktn/backend/services/consents.py`
**Назначение**: Бизнес-логика создания consent

**Ключевые секции**:
- **Строки 22-74**: `initiate_consent()` - обертка для account consent
- **Строки 77-132**: `initiate_product_consent()` - **РЕФЕРЕНС ДЛЯ РЕАЛИЗАЦИИ**
- **Строки 135-166**: `initiate_full_consent_flow()` - **НУЖНО ОБНОВИТЬ**

**Что нужно сделать**:
1. Добавить функцию `initiate_payment_consent()` после строки 132
2. Обновить `initiate_full_consent_flow()` для создания всех трех типов

---

#### `hktn/backend/routers/consents.py`
**Назначение**: HTTP endpoints для consent

**Ключевые секции**:
- **Строки 13-15**: `POST /api/consent/initiate` - account consent
- **Строки 18-20**: `POST /api/consent/initiate/product` - product consent

**Что нужно сделать**: Добавить endpoint `POST /api/consent/initiate/payment` после строки 20

---

#### `hktn/core/database.py`
**Назначение**: Работа с базой данных

**Ключевые секции**:
- **Строки 36-70**: `init_db()` - создание таблицы `consents` с полем `consent_type`
- **Строки 110-140**: `save_consent()` - сохранение consent в БД
- **Строки 226-261**: `find_consent_by_type()` - поиск consent по типу

**Что нужно знать**: 
- Таблица `consents` уже поддерживает поле `consent_type`
- Используй `consent_type="payments"` при сохранении payment consent

---

### 2. Референсные файлы (для понимания паттернов)

#### `hktn/backend/schemas.py`
**Назначение**: Pydantic схемы для валидации

**Ключевые секции**:
- **Строки 31-34**: `ConsentInitiateRequest` - схема запроса
  ```python
  class ConsentInitiateRequest(BaseModel):
      user_id: str
      bank_id: str
  ```

---

#### `hktn/backend/services/banking.py`
**Назначение**: Использование consent для получения данных

**Ключевые секции**:
- **Строки 202-273**: `fetch_bank_credits()` - пример использования product consent
- **Строки 219**: `find_consent_by_type(user_id, bank_id, "products")` - поиск product consent

**Что нужно знать**: Аналогично можно будет искать payment consent через `find_consent_by_type(user_id, bank_id, "payments")`

---

### 3. Документация и требования

#### `HACKATHON_IMPROVEMENT_PLAN.md`
**Назначение**: План доработки для хакатона

**Ключевые секции**:
- **Строки 36-106**: Детальное описание задачи Payment Consent Flow
- **Строки 48-70**: Примеры кода для реализации

---

## 🔍 Паттерны и примеры

### Паттерн 1: Создание consent в `obr_client.py`

```python
async def initiate_product_consent(self, user_id: str) -> Optional[ConsentInitResult]:
    # 1. Получить токен
    bank_token = await self._get_bank_token()
    headers = await self._get_common_headers(bank_token)
    
    # 2. Подготовить payload варианты
    payloads_to_try = [
        { "permissions": [...], ... },
        { "read_product_agreements": True, ... },
    ]
    
    # 3. Попробовать каждый вариант
    for body in payloads_to_try:
        try:
            response = await self._client.post(url, headers=headers, json=body)
            # 4. Обработать ответ
            consent_id = data.get("consent_id") or data.get("data", {}).get("consentId")
            # 5. Вернуть результат
            return ConsentInitResult(...)
        except:
            continue
    
    return None
```

### Паттерн 2: Обертка в `consents.py`

```python
async def initiate_product_consent(req: ConsentInitiateRequest) -> Dict[str, Any]:
    bank_config = get_bank_config(req.bank_id, require_url=True)
    async with bank_client(req.bank_id) as client:
        try:
            # 1. Вызвать низкоуровневый метод
            consent_meta = await client.initiate_product_consent(req.user_id)
            
            # 2. Сохранить в БД
            save_consent(
                req.user_id,
                req.bank_id,
                consent_meta.consent_id,
                "APPROVED" if consent_meta.auto_approved else "AWAITING_USER",
                consent_type="products",  # ⚠️ Тип!
            )
            
            # 3. Вернуть структурированный ответ
            return {
                "bank_id": req.bank_id,
                "type": "product",
                "consent_id": consent_meta.consent_id,
                ...
            }
        except Exception:
            # 4. Graceful degradation
            return {"state": "error", ...}
```

### Паттерн 3: Endpoint в роутере

```python
@router.post("/consent/initiate/product")
async def initiate_product_consent_endpoint(req: ConsentInitiateRequest):
    return await consents.initiate_product_consent(req)
```

---

## 🧪 Тестовые сценарии

### Тест 1: Создание payment consent напрямую

```bash
curl -X POST http://localhost:8000/api/consent/initiate/payment \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "team260-3",
    "bank_id": "abank"
  }'
```

**Ожидаемый результат**: JSON с полями `consent_id`, `state: "approved"`, `type: "payment"`

### Тест 2: Проверка в БД

```bash
sqlite3 finpulse_consents.db \
  "SELECT user_id, bank_id, consent_id, consent_type, status 
   FROM consents 
   WHERE consent_type='payments' AND user_id='team260-3';"
```

**Ожидаемый результат**: Запись с `consent_type='payments'` и `status='APPROVED'`

### Тест 3: Full consent flow

```bash
curl -X POST http://localhost:8000/api/consent/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "team260-3",
    "bank_id": "abank"
  }'
```

**Ожидаемое поведение**: 
- Создается account consent
- Создается product consent (всегда)
- Создается payment consent (всегда)
- В логах видны все три попытки создания

---

## ⚠️ Важные детали

### 1. Endpoint банка может отличаться

Банки могут использовать разные endpoints для payment consent:
- `/payment-consents/request` (наиболее вероятно)
- `/payment-consent-requests`
- `/payments/consents/request`

**Решение**: Попробуй несколько вариантов или проверь документацию конкретного банка.

### 2. Permissions могут отличаться

Некоторые банки могут требовать другие названия:
- `InitiateSinglePayment` vs `CreateSinglePayment`
- `InitiateMultiplePayment` vs `CreateMultiplePayment`
- `CreateVariableRecurringPayment` vs `InitiateVRP`

**Решение**: Используй несколько вариантов payload с разными permissions.

### 3. Graceful degradation

Если payment consent не создается - это **НЕ критично**. Приложение должно продолжать работать.

**Решение**: Логируй ошибку, но не падай. Возвращай error state в ответе.

### 4. Тип consent в БД

**ОБЯЗАТЕЛЬНО** используй `consent_type="payments"` при сохранении:
```python
save_consent(
    ...,
    consent_type="payments",  # ⚠️ ВАЖНО!
)
```

Это позволит потом находить payment consent через `find_consent_by_type(user_id, bank_id, "payments")`.

---

## 📊 Структура данных

### ConsentInitResult (из `obr_client.py`)

```python
@dataclass
class ConsentInitResult:
    consent_id: Optional[str]
    request_id: Optional[str]
    status: str
    approval_url: Optional[str]
    auto_approved: bool
```

### Ответ endpoint (из `consents.py`)

```python
{
    "bank_id": "abank",
    "bank_name": "ABank",
    "type": "payment",
    "state": "approved" | "pending" | "error",
    "status": "approved" | "pending" | "error",
    "consent_id": "payc-xxxxx",
    "request_id": "req-xxxxx",
    "approval_url": null | "https://...",
    "auto_approved": true | false,
    "error_message": null | "..."  # только если state="error"
}
```

---

## ✅ Чек-лист реализации

- [ ] Метод `initiate_payment_consent()` добавлен в `obr_client.py`
  - [ ] Использует `_get_bank_token()` и `_get_common_headers()`
  - [ ] Пробует несколько вариантов payload
  - [ ] Обрабатывает разные форматы ответов
  - [ ] Возвращает `ConsentInitResult` или `None`
  - [ ] Логирует все попытки

- [ ] Функция `initiate_payment_consent()` добавлена в `consents.py`
  - [ ] Вызывает `client.initiate_payment_consent()`
  - [ ] Сохраняет в БД с `consent_type="payments"`
  - [ ] Обрабатывает ошибки gracefully
  - [ ] Возвращает структурированный ответ
  - [ ] Логирует результаты

- [ ] `initiate_full_consent_flow()` обновлена
  - [ ] Создает product consent всегда (не только при auto-approve)
  - [ ] Создает payment consent всегда
  - [ ] Ошибки product/payment не блокируют процесс
  - [ ] Логирует все результаты

- [ ] Endpoint добавлен в `consents.py` роутер
  - [ ] `POST /api/consent/initiate/payment`
  - [ ] Принимает `ConsentInitiateRequest`
  - [ ] Вызывает `consents.initiate_payment_consent()`

- [ ] Тестирование пройдено
  - [ ] Payment consent создается успешно
  - [ ] Сохраняется в БД с правильным типом
  - [ ] Full flow создает все три типа
  - [ ] Ошибки обрабатываются gracefully

---

## 🚀 Готов к реализации!

Используй этот документ как руководство. Все паттерны и примеры уже есть в коде - просто адаптируй их для payment consent.

**Удачи! 🎯**

