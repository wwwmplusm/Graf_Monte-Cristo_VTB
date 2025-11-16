# Main screens

This bundle now exposes the streamlined screens and API needed to demo Safe-to-Spend without the historical onboarding and portrait flows.

## Running the code

Run `npm i` to install the frontend dependencies.

Start the dev server via `npm run dev` and open `http://localhost:5173`.

The FastAPI backend still boots through `uvicorn hktn.backend_app:app --reload` (requirements listed in `requirements.txt`).

## Simplified analytics flow

- `/api/dashboard` is the only analytics endpoint. It returns the summed bank balance, bank statuses, the scheduled salary (amount/date) and the next credit payment (amount/date). The safe-to-spend number is now computed with a single formula: `(balance + salary_amount - credit_payment_amount) / days_until_next_salary`.
- `/api/banks` and `/api/consents/*` stay intact for teams who still connect banks, but the SPA only shows the bank catalog, a basic dashboard and the user-id screen.
- All portrait, credit-ranking, onboarding and goal routes (and their React pages) were removed.
- The bulky analytics engine and numerical dependencies (`pandas`, `numpy`, etc.) are gone; the backend only fetches balances and looks up the salary / credit metadata.

## Configuring salary and credit metadata

Each user can override the salary and payment inputs through the new `user_financial_inputs` table. Example SQL:

```sql
INSERT INTO user_financial_inputs (user_id, salary_amount, next_salary_date, credit_payment_amount, credit_payment_date)
VALUES ('team260-1', 80000, '2025-12-25', 15000, '2025-12-18')
ON CONFLICT(user_id) DO UPDATE SET
  salary_amount=excluded.salary_amount,
  next_salary_date=excluded.next_salary_date,
  credit_payment_amount=excluded.credit_payment_amount,
  credit_payment_date=excluded.credit_payment_date;
```

If no row exists the backend falls back to the new environment variables:

- `DEFAULT_SALARY_AMOUNT` (float, default `0`)
- `DEFAULT_NEXT_SALARY_DAYS` (int, default `14`)
- `DEFAULT_CREDIT_PAYMENT_AMOUNT` (float, default `0`)
- `DEFAULT_CREDIT_PAYMENT_DAYS` (int, default `10`)

## Testing & QA

- Run `npm run test` for the Vitest suite.
- Run `pytest` for the backend tests.
- When salary / payment data is missing the dashboard still renders, but the safe-to-spend limit will degrade to zero; populate the DB row (or env defaults) for realistic demos.
