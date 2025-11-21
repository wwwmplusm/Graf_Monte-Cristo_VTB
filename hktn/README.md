# FinPulse – multi-bank Accounts + Products + Payments

FastAPI backend + React frontend that demonstrates a full OpenBanking flow: consents and tokens, Accounts/Product Agreements/Payments APIs, analytics, and demo payments.

## What’s inside
- Multi-bank connectors for VBank / ABank / SBank (`backend/config.py`).
- Full consent lifecycle (`/api/consents/init|status|refresh`), JWKS-validated bank tokens cached in DB.
- End-to-end sync (`/api/sync/full-refresh`) storing accounts, balances, transactions, and product agreements to SQLite.
- Analytics (`/api/dashboard`) with safe-to-spend, debt/savings projections, and refinance recommendations.
- Payments demo (`/api/payments/mdp|adp|sdp`) using stored payment-consents.
- Docs: `ARCHITECTURE_OVERVIEW.md`, `DATA_FLOW_AND_CALCULATIONS.md`, playground script in `hktn/experiments/`.

## Quick start
1) Install deps  
   - Backend: `pip install -r requirements.txt`  
   - Frontend: `npm install`
2) Export env vars:  
   `CLIENT_ID`, `CLIENT_SECRET`, `VBANK_API_URL`, `ABANK_API_URL`, `SBANK_API_URL`, `FRONTEND_URL`  
   (optional defaults: `DEFAULT_SALARY_AMOUNT`, `DEFAULT_NEXT_SALARY_DAYS`, `DEFAULT_CREDIT_PAYMENT_AMOUNT`, `DEFAULT_CREDIT_PAYMENT_DAYS`)
3) Run backend: `uvicorn hktn.backend_app:app --reload`
4) Run frontend: `npm run dev` and open `http://localhost:5173`.

## API map for judges
- **Consents**: `POST /api/consents/init`, `GET /api/consents/status`, `POST /api/consents/refresh`, `GET /api/consent/status?request_id=...`
- **Banks / sync**: `GET /api/banks`, `GET /api/banks/{bank_id}/bootstrap`, `POST /api/sync/full-refresh?user_id=...`
- **Analytics**: `GET /api/dashboard?user_id=...` (safe-to-spend, debt, savings, refinance tips)
- **Payments**: `POST /api/payments/mdp|adp|sdp` (requires payment-consent)

## Extras
- Playground (no secrets in code): `python -m hktn.experiments.data_export_playground`
- DB file: `finpulse_consents.db` (tables: consents, bank_tokens, accounts, transactions, balances, credits, caches, locks)
- Architecture doc: `../ARCHITECTURE_OVERVIEW.md`
