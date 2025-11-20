# Обзор API эндпоинтов онбординга и логики хранения данных

## Эндпоинты онбординга

### 1. POST /api/onboarding/start
**Файл:** `hktn/backend/routers/onboarding.py:16`
**Сервис:** `hktn/backend/services/onboarding.py:16`

**Функционал:**
- Создает новый onboarding_id (UUID)
- Принимает `user_id` и `user_name`
- Возвращает `onboarding_id`, `user_id`, `user_name`, `status: "started"`

**Проблемы:**
- ❌ Не сохраняет данные в БД (только возвращает в ответе)
- ❌ Нет маппинга `onboarding_id -> user_id` в БД
- ⚠️ В `get_onboarding_status` используется placeholder: `user_id = onboarding_id`

**Рекомендации:**
- Сохранять onboarding session в таблицу `onboarding_sessions`
- Создать маппинг `onboarding_id -> user_id`

---

### 2. GET /api/onboarding/status
**Файл:** `hktn/backend/routers/onboarding.py:22`
**Сервис:** `hktn/backend/services/onboarding.py:33`

**Функционал:**
- Возвращает текущий шаг онбординга
- Показывает завершенные шаги
- Показывает статус consents по банкам

**Проблемы:**
- ❌ Использует placeholder: `user_id = onboarding_id` (строка 40)
- ⚠️ Логика определения шагов упрощенная

**Рекомендации:**
- Исправить получение `user_id` из БД по `onboarding_id`
- Улучшить логику определения шагов

---

### 3. POST /api/onboarding/finalize
**Файл:** `hktn/backend/routers/onboarding.py:28`
**Сервис:** `hktn/backend/services/onboarding.py:86`

**Функционал:**
- Проверяет наличие approved consents
- Проверяет обязательный account consent
- Завершает онбординг

**Проблемы:**
- ⚠️ Не запускает автоматическую синхронизацию данных (только логирует)
- ⚠️ Не сохраняет финальный статус в БД

**Рекомендации:**
- Вызвать `bootstrap_bank` для каждого подключенного банка
- Сохранить статус завершения в `onboarding_sessions`

---

### 4. POST /api/onboarding/consents
**Файл:** `hktn/backend/routers/onboarding.py:34`
**Сервис:** `hktn/backend/services/consents.py:339`

**Функционал:**
- Создает все необходимые consents для выбранных банков
- Поддерживает account, product, payment consents
- Проверяет существующие consents перед созданием новых

**Работает правильно:**
- ✅ Сохраняет consents в БД через `save_consent`
- ✅ Проверяет существующие consents
- ✅ Обрабатывает ошибки

---

### 5. GET /api/onboarding/consents/status
**Файл:** `hktn/backend/routers/onboarding.py:40`
**Сервис:** `hktn/backend/services/consents.py:552`

**Функционал:**
- Возвращает статус всех согласий пользователя
- Группирует по банкам и типам

**Работает правильно:**
- ✅ Читает из БД через `get_user_consents`
- ✅ Правильно группирует данные

---

### 6. GET /api/banks
**Файл:** `hktn/backend/routers/banks.py:10`
**Сервис:** `hktn/backend/services/banking.py:153`

**Функционал:**
- Возвращает список доступных банков
- Показывает статус подключения для пользователя

**Работает правильно:**
- ✅ Читает конфигурацию банков из settings
- ✅ Проверяет подключенные банки через consents

---

### 7. GET /api/banks/{bank_id}/bootstrap
**Файл:** `hktn/backend/routers/banks.py:15`
**Сервис:** `hktn/backend/services/banking.py:321`

**Функционал:**
- Загружает все данные из банка: accounts, transactions, credits, balances
- Использует параллельные запросы (asyncio.gather)

**Работает правильно:**
- ✅ Использует правильные consent_id
- ✅ Параллельная загрузка данных
- ✅ Обработка ошибок

**Проблемы:**
- ⚠️ Данные не сохраняются в БД, только возвращаются в ответе
- ⚠️ Используется in-memory кеш (`api_cache`)

---

## Логика хранения данных

### 1. Consents (Согласия)
**Хранилище:** SQLite БД (`finpulse_consents.db`)
**Таблица:** `consents`

**Структура:**
```sql
CREATE TABLE consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    bank_id TEXT NOT NULL,
    consent_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    request_id TEXT,
    approval_url TEXT,
    consent_type TEXT,  -- 'accounts', 'products', 'payments'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Операции:**
- `save_consent()` - сохранение/обновление consent
- `update_consent_status()` - обновление статуса
- `find_approved_consents()` - поиск approved consents
- `find_consent_by_type()` - поиск по типу

**Статусы:**
- `APPROVED` - согласие одобрено
- `AWAITING_USER` - ожидает одобрения пользователя
- `PENDING` - в процессе создания

---

### 2. API данные (Транзакции, Счета, Балансы, Кредиты)
**Хранилище:** 
- **In-memory кеш:** `TTLCache` (в `hktn/backend/state.py`)
- **Dashboard кеш:** SQLite БД (`dashboard_cache` таблица)

**In-memory кеш:**
```python
api_cache: TTLCache[str, dict] = TTLCache(
    maxsize=settings.api_cache_size,  # по умолчанию 100
    ttl=settings.api_cache_ttl        # по умолчанию 300 секунд (5 минут)
)
```

**Ключ кеша:** `f"{user_id}:{bank_id}:{consent_id}"`

**Использование:**
- `fetch_bank_data_with_consent()` - кеширует транзакции
- `fetch_bank_accounts_with_consent()` - НЕ кеширует (возвращает напрямую)
- `fetch_bank_balances_with_consent()` - НЕ кеширует (возвращает напрямую)
- `fetch_bank_credits()` - НЕ кеширует (возвращает напрямую)

**Проблемы:**
- ❌ Данные не сохраняются в БД постоянно
- ❌ При перезапуске сервера кеш теряется
- ⚠️ Только транзакции кешируются в памяти

---

### 3. Dashboard Cache (Кеш дашборда)
**Хранилище:** SQLite БД (`finpulse_consents.db`)
**Таблица:** `dashboard_cache`

**Структура:**
```sql
CREATE TABLE dashboard_cache (
    user_id TEXT PRIMARY KEY,
    dashboard_data TEXT NOT NULL,  -- JSON
    synced_at TEXT NOT NULL,
    calculated_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    version INTEGER DEFAULT 1
);
```

**Операции:**
- `save_dashboard_cache()` - сохранение dashboard данных
- `get_cached_dashboard()` - получение из кеша
- `invalidate_dashboard_cache()` - инвалидация кеша

**TTL:** По умолчанию 30 минут

**Использование:**
- `GET /api/dashboard` - использует кеш если данные свежие (< 15 минут)
- `GET /api/dashboard?force_refresh=true` - принудительно обновляет

**Содержимое dashboard_data:**
- STS (Safe to Spend)
- Балансы
- Кредиты
- Транзакции (снимок)
- Health score
- И другие метрики

---

### 4. User Profiles (Профили пользователей)
**Хранилище:** SQLite БД (`finpulse_consents.db`)
**Таблица:** `user_profiles`

**Структура:**
```sql
CREATE TABLE user_profiles (
    user_id TEXT PRIMARY KEY,
    goal_type TEXT,
    goal_details TEXT
);
```

**Использование:**
- Хранение целей пользователя
- Настройки онбординга

---

### 5. Financial Inputs (Финансовые данные пользователя)
**Хранилище:** SQLite БД (`finpulse_consents.db`)
**Таблица:** `user_financial_inputs`

**Структура:**
```sql
CREATE TABLE user_financial_inputs (
    user_id TEXT PRIMARY KEY,
    salary_amount REAL,
    next_salary_date TEXT,
    credit_payment_amount REAL,
    credit_payment_date TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Использование:**
- Хранение зарплаты и даты следующей зарплаты
- Хранение суммы и даты платежа по кредиту
- Используется для расчета STS

---

### 6. Bank Status Log (Логи операций с банками)
**Хранилище:** SQLite БД (`finpulse_consents.db`)
**Таблица:** `bank_status_log`

**Структура:**
```sql
CREATE TABLE bank_status_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    bank_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Использование:**
- Логирование всех операций с банками
- Отслеживание успешных/неуспешных запросов

---

## Поток данных при онбординге

```
1. POST /api/onboarding/start
   └─> Создает onboarding_id (НЕ сохраняется в БД)

2. GET /api/banks
   └─> Возвращает список банков из конфигурации

3. POST /api/onboarding/consents
   └─> Создает consents для выбранных банков
       └─> Сохраняет в БД (таблица consents)

4. GET /api/onboarding/consents/status
   └─> Читает из БД (таблица consents)

5. POST /api/onboarding/finalize
   └─> Проверяет consents в БД
       └─> НЕ запускает автоматическую загрузку данных

6. GET /api/banks/{bank_id}/bootstrap
   └─> Загружает данные из API банка
       └─> Кеширует транзакции в памяти (api_cache)
       └─> НЕ сохраняет в БД

7. GET /api/dashboard
   └─> Проверяет dashboard_cache в БД
       └─> Если устарел - пересчитывает
       └─> Сохраняет в dashboard_cache (БД)
```

---

## Проверка соответствия OpenAPI спецификации

### ✅ Правильно реализованные методы:

1. **GET /accounts**
   - ✅ Использует правильные заголовки: `X-Consent-Id`, `X-Requesting-Bank`
   - ✅ Query параметр: `client_id`
   - ✅ Метод: `fetch_accounts_with_consent()`

2. **GET /accounts/{account_id}/balances**
   - ✅ Использует правильные заголовки: `X-Consent-Id`, `X-Requesting-Bank`
   - ✅ Метод: `fetch_balances_with_consent()` (внутри вызывает `/accounts/{account_id}/balances`)

3. **GET /accounts/{account_id}/transactions**
   - ✅ Использует правильные заголовки: `X-Consent-Id`, `X-Requesting-Bank`, `X-Fapi-Interaction-Id`
   - ✅ Query параметры: `client_id`, `page`, `limit`, `from_booking_date_time`, `to_booking_date_time`
   - ✅ Метод: `fetch_transactions_with_consent()` (исправлен на page/limit пагинацию)

4. **GET /product-agreements**
   - ✅ Использует правильные заголовки: `X-Product-Agreement-Consent-Id`, `X-Requesting-Bank`
   - ✅ Query параметр: `client_id`
   - ✅ Метод: `fetch_credits_with_consent()`

5. **POST /account-consents/request**
   - ✅ Использует правильные заголовки: `X-Requesting-Bank`
   - ✅ Body: `ConsentRequestBody` (client_id в body, не в query)
   - ✅ Метод: `initiate_consent()`

6. **POST /product-agreement-consents/request**
   - ✅ Использует правильные заголовки: `X-Requesting-Bank`
   - ✅ Query параметр: `client_id` (обязателен для bank_token)
   - ✅ Body: `ProductAgreementConsentRequestData`
   - ✅ Метод: `initiate_product_consent()`

7. **POST /payment-consents/request**
   - ✅ Использует правильные заголовки: `X-Requesting-Bank`
   - ✅ Body: `PaymentConsentRequestData` (client_id в body)
   - ✅ Метод: `initiate_payment_consent()` (исправлен)

8. **POST /payments**
   - ✅ Использует правильные заголовки: `X-Payment-Consent-Id`, `X-Requesting-Bank`, `X-Fapi-Interaction-Id`
   - ✅ Query параметр: `client_id` (обязателен для bank_token)
   - ✅ Body: `PaymentRequest` (data.initiation структура)
   - ✅ Метод: `initiate_single_payment()`

9. **GET /account-consents/{consent_id}**
   - ✅ Использует правильные заголовки: `Authorization`, `X-Fapi-Interaction-Id`
   - ✅ Метод: `get_consent_details()` (исправлен)

---

## Проблемы и рекомендации

### Критические проблемы:

1. **Данные не сохраняются в БД постоянно**
   - Транзакции, счета, балансы, кредиты хранятся только в памяти
   - При перезапуске сервера данные теряются
   - **Решение:** Создать таблицы для хранения этих данных

2. **Onboarding ID не сохраняется**
   - `onboarding_id` не маппится к `user_id` в БД
   - Используется placeholder в `get_onboarding_status`
   - **Решение:** Использовать таблицу `onboarding_sessions`

3. **Нет автоматической синхронизации после финализации**
   - `finalize_onboarding` не запускает загрузку данных
   - **Решение:** Вызвать `bootstrap_bank` для каждого банка

### Рекомендации по улучшению:

1. **Создать таблицы для хранения данных:**
   ```sql
   CREATE TABLE accounts (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL,
       bank_id TEXT NOT NULL,
       account_id TEXT NOT NULL,
       account_data TEXT NOT NULL,  -- JSON
       synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   
   CREATE TABLE transactions (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL,
       bank_id TEXT NOT NULL,
       account_id TEXT NOT NULL,
       transaction_id TEXT NOT NULL,
       transaction_data TEXT NOT NULL,  -- JSON
       synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   
   CREATE TABLE balances (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL,
       bank_id TEXT NOT NULL,
       account_id TEXT NOT NULL,
       balance_data TEXT NOT NULL,  -- JSON
       synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   
   CREATE TABLE credits (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL,
       bank_id TEXT NOT NULL,
       credit_id TEXT NOT NULL,
       credit_data TEXT NOT NULL,  -- JSON
       synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

2. **Исправить onboarding flow:**
   - Сохранять `onboarding_id -> user_id` в `onboarding_sessions`
   - Автоматически запускать `bootstrap_bank` после финализации
   - Сохранять данные в БД при загрузке

3. **Улучшить кеширование:**
   - Использовать БД как основной источник данных
   - In-memory кеш только для временного хранения
   - Реализовать инвалидацию кеша при обновлении данных

