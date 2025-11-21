# FinPulse: мультибанк с Accounts / Products / Payments

## Что это
Полноценное демо OpenBanking: в одном сервисе собраны создание согласий (account / product / payment), получение токенов с валидацией через JWKS, загрузка данных по счетам/балансам/транзакциям/договорам, аналитика (safe-to-spend, долги, накопления) и пример платежей. Бэкенд на FastAPI (`hktn/backend`), фронт на React/Vite (`hktn/src`), все соседние файлы — только код и данные, без лишней документации.

## Как запустить
1. Экспортируйте переменные окружения:
   - `CLIENT_ID`, `CLIENT_SECRET`
   - `VBANK_API_URL`, `ABANK_API_URL`, `SBANK_API_URL`
   - опционально: `FRONTEND_URL`, `DEFAULT_SALARY_AMOUNT`, `DEFAULT_NEXT_SALARY_DAYS`, `DEFAULT_CREDIT_PAYMENT_AMOUNT`, `DEFAULT_CREDIT_PAYMENT_DAYS`
2. Бэкенд: `pip install -r hktn/requirements.txt && uvicorn hktn.backend_app:app --reload`
3. Фронт: `cd hktn && npm install && npm run dev` → открыть `http://localhost:5173`

## Архитектура
- **core**: `hktn/core/obr_client.py` — клиент OpenBanking с retry, JWKS-проверкой токенов и кэшем токенов в БД; `hktn/core/database.py` — SQLite, схемы, кэши, локи.
- **backend**: FastAPI `hktn/backend/app.py`; роутеры `banks`, `consents`, `sync`, `analytics`, `payments`, `onboarding`, `loans`, `refinance`. Логика в `hktn/backend/services/*.py`.
- **frontend**: `hktn/src` — SPA, ходит на `/api`.
- **данные/кэш**: таблицы `consents`, `bank_tokens`, `accounts`, `balances`, `transactions`, `credits`, `bank_data_cache`, `dashboard_cache`, `sync_locks`, `bank_status_log`.

## Основные сценарии
### Consents + tokens
- `POST /api/consents/init` — создаёт account/product/payment consents сразу по нескольким банкам, сохраняет в БД; возвращает request/consent id и ссылки на одобрение.
- `GET /api/consents/status` — агрегированный статус по банкам и типам, умеет опрашивать pending.
- `POST /api/consents/refresh` — ручное обновление pending согласий.
- Токены: `obr_client` берёт `/auth/bank-token`, валидирует JWT через `.well-known/jwks.json`, кэширует в памяти и таблице `bank_tokens` с `expires_at`, обновляет при 401.

### Сбор данных (Accounts / Products)
- `GET /api/banks/{bank_id}/bootstrap` — для указанного банка вытягивает `/accounts`, `/accounts/{id}/balances`, `/accounts/{id}/transactions`, `/product-agreements`; сохраняет в `accounts/balances/transactions/credits` и в `bank_data_cache`.
- `POST /api/sync/full-refresh` — полный рефреш по всем одобренным банкам + опциональный пересчёт аналитики. Использует `sync_locks`, пишет статусы в `bank_status_log`.

### Аналитика
- `GET /api/dashboard?user_id=...` — safe-to-spend, долг/накопления, здоровье кредитов, события на 30 дней, персональные рекомендации. Источники: транзакции/балансы/кредиты из БД + пользовательские метаданные `user_financial_inputs` (зарплата/платёж по кредиту/цель накоплений). Кэширует результат в `dashboard_cache`.

### Payments
- `POST /api/payments/mdp|adp|sdp` — примеры платежей (обязательный, дополнительный кредит, накопления). Берёт payment-consent из БД, находит счёт дебета через `/accounts`, отправляет `/payments` с `X-Payment-Consent-Id`, инвалидирует кэш аналитики.

### Рефинанс / рекомендации
- `services/loans.py` и `services/refinance.py` читают `credits` и каталог продуктов (кэш в `bank_data_cache`), чтобы предложить альтернативы и экономию по переплате.

## API-карта (главное)
- Consents: `POST /api/consents/init`, `GET /api/consents/status`, `POST /api/consents/refresh`, `GET /api/consent/status?request_id=...`
- Бэнки/сбор: `GET /api/banks`, `GET /api/banks/{bank_id}/bootstrap`, `POST /api/sync/full-refresh`
- Аналитика: `GET /api/dashboard`
- Платежи: `POST /api/payments/mdp`, `/adp`, `/sdp`
- Онбординг/кредиты/рефинанс: роутеры `onboarding`, `loans`, `refinance` (все в `hktn/backend/routers`).

## База данных (схематично)
- `consents(user_id, bank_id, consent_id, status, consent_type, request_id, approval_url, expires_at)`
- `bank_tokens(bank_id, access_token, expires_at, refreshed_at)`
- `accounts / balances / transactions / credits` — сырые данные из банков.
- `bank_data_cache` — последние payload'ы по типам (`accounts`, `balances`, `transactions`, `products`, `credits`).
- `dashboard_cache` — результаты аналитики.
- `sync_locks` — защита от параллельного синка.
- `bank_status_log` — история вызовов к банкам.

## Поток "из коробки" (демо)
1. `POST /api/consents/init` с `banks=["vbank","abank","sbank"]` для пользователя.
2. Дождаться `approved` (статус можно посмотреть через `/api/consents/status`).
3. `POST /api/sync/full-refresh?user_id=...&include_dashboard=true&force=true` — загрузит Accounts/Products, сохранит в БД, посчитает аналитику.
4. `GET /api/dashboard?user_id=...` — показать метрики и рекомендации.
5. (Опционально) `POST /api/payments/mdp` с суммой и `bank_id` — демонстрация Payments API.

## Устойчивость и логи
- Повторы `api_retry` на сетевых/5xx, единый формат логов через `bank_status_log`.
- При ошибках банка отдаём кэш из `bank_data_cache`/`dashboard_cache`.
- Токены и согласия храним с явными `expires_at`, при 401 сбрасываем токен и берём новый.

## Вспомогательные скрипты
- `hktn/experiments/data_export_playground.py` — локальный playground без хардкодов: создаёт consents, запускает `full-refresh`, сохраняет ответы в папку (использует API сервиса).

На этом всё: для чтения и оценки нужен только этот README, остальное — код и данные приложения.
