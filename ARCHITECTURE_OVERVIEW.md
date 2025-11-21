# FinPulse Architecture Overview

This file is the single point of truth for how the hackathon app is wired to hit the scoring criteria: multi-bank support, full consent/token lifecycle, Accounts + Products + Payments APIs, analytics, and resilience.

## High-level map
- **Frontend**: `hktn/src` (React/Vite), consumes `/api` endpoints exposed by FastAPI. Entry: `hktn/backend/app.py`.
- **Backend routers**: `hktn/backend/routers/*.py` for `auth`, `banks`, `consents`, `sync`, `analytics`, `payments`, `onboarding`, `loans`, `refinance`.
- **Service layer**: `hktn/backend/services/*.py` encapsulates business logic per domain.
- **Core**: `hktn/core/obr_client.py` (Open Banking REST client with JWT/JWKS validation), `hktn/core/database.py` (SQLite schema, caching, locks).

## Consent + token lifecycle (Accounts / Products / Payments)
- API surface:
  - `POST /api/consents/init` → creates account/product/payment consents across banks.
  - `GET /api/consents/status` → aggregated statuses per bank/type (auto-refresh on pending).
  - `POST /api/consents/refresh` → manual polling of pending consents.
  - `GET /api/consent/status?request_id=...&bank_id=...` → spec-friendly polling by request_id.
- Flow:
  1) `backend/services/consents.py` calls `core/obr_client.py` to create consents; results persisted in `consents` table.
  2) Tokens are requested via `/auth/bank-token`, validated against JWKS, cached in-memory and in `bank_tokens` table with `expires_at`.
  3) Pending consents are polled via `/account-consents/{id}`, `/product-agreement-consents/{id}`, `/payment-consents/{id}`; statuses normalized to `APPROVED / AWAITING_USER / REJECTED`.
  4) Approval URLs/request_ids are returned to the client; callbacks re-mark consents as approved.
  5) `bank_status_log` records attempts/errors for the resiliency story.

## Data pipeline (Accounts → Products → Payments)
- **Bootstrap & persistence**: `banks.bootstrap_bank` fetches `/accounts`, `/balances`, `/accounts/{id}/transactions`, `/product-agreements` in parallel, then writes to DB tables `accounts`, `balances`, `transactions`, `credits`, and caches raw payloads in `bank_data_cache`.
- **Full refresh**: `POST /api/sync/full-refresh` (router `sync.py`) runs `_sync_single_bank` for every approved consent, saves data, and optionally recalculates analytics in one call.
- **Analytics**: `services/analytics.py` reads cached data + DB, computes safe-to-spend, debt and savings projections, health score, and writes `dashboard_cache`.
- **Recommendations**: `loans.py` / `refinance.py` leverage `credits` + product catalogs to propose refinancing; `payments.py` uses payment consents to send MDP/ADP/SDP payments.
- **Payments demo**: `services/payments.py` builds single payments against `/payments` using stored payment-consent ids and live accounts from `/accounts`.

## Modules mapped to scoring criteria
- **Multi-bank & scalability**: `backend/config.py` defines VBank/ABank/SBank; `core/obr_client.py` is bank-agnostic; adding a bank is adding env vars and letting `bank_client()` wire tokens/logging.
- **Resilience & caching**: `bank_tokens`, `bank_data_cache`, `dashboard_cache`, `sync_locks`, `bank_status_log` tables; retry/backoff via `api_retry` in `obr_client`; graceful fallbacks return cached data.
- **Security**: JWT + JWKS validation on bank-token, DB token cache with expiry, secrets pulled from env, experimental scripts moved to `hktn/experiments/`.
- **End-user flow**: onboarding → consents → `/sync/full-refresh` → analytics dashboard (safe-to-spend, debt metrics) → optional payments/refinance.

## Database tables involved
- Core: `consents`, `bank_tokens`, `bank_status_log`, `bank_data_cache`, `dashboard_cache`, `sync_locks`.
- Domain data: `accounts`, `balances`, `transactions`, `credits`, `user_financial_inputs`, `user_profiles`.

## Demo checklist
1) Call `POST /api/consents/init` with banks `[\"vbank\",\"abank\",\"sbank\"]`.
2) `POST /api/sync/full-refresh?user_id=...&force=true&include_dashboard=true` to pull Accounts/Product agreements and compute analytics.
3) Hit `/api/dashboard` (analytics router) to show safe-to-spend and loan/savings recommendations.
4) Trigger `/api/payments/mdp` or `/api/payments/adp` with a payment-consent to showcase Payments API.
