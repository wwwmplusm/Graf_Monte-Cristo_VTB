
  # Main screens

  This is a code bundle for Main screens. The original project is available at https://www.figma.com/design/g2lq6y3UolIAHaAuvnYRaz/Main-screens.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Analytics flow updates

  - Bank transactions now retain merchant, MCC, bank transaction code, and card metadata so the clustering engine can reason about actual merchants instead of generic descriptions.
  - The analytics engine derives deterministic obligations from both credit agreements and highly coherent recurring debit clusters (tagged with their MCC/category/source), which flow into `/api/dashboard` and `/api/financial-portrait`.
  - Safe-to-spend calculations now use real-time balances summed from linked accounts, so probability estimates and explanations reflect actual cash instead of placeholder values.
  - Dashboard UI consumes the enriched payload and surfaces badges for MCC/category, merchant, transaction codes and obligation sources. Upcoming-payment filters allow PMs to slice by source or MCC to verify data quality quickly.
  - The “Financial Portrait” inspector lazy-loads the `/api/financial-portrait` response, links recurring events back to `transactions_sample`, and displays MCC coverage percentages so onboarding engineers can confirm clustering quality without leaving the UI.
  - Design tokens (`--color-chip-*`, `--space-*`, etc.) were added to `src/styles/global.css` to keep badges/chips responsive. Metadata stacks collapse vertically under 640px widths, so screenshots captured via `npm run dev` → `localhost:5173/dashboard` at 360px and 1440px widths remain legible.

  ## Testing & QA

  - Run `npm run test -- DashboardPage` to execute the new vitest suite at `src/pages/__tests__/DashboardPage.test.tsx`, which covers metadata rendering, filter behavior, and the lazy portrait fetch contract.
  - Accessibility: All metadata badges expose ARIA labels/tooltips (e.g., `SourceChip`, bank transaction code titles). When adding new badges, reuse the `.metadata-badge` classes to inherit focus contrast.
  - Localization: strings for badges/tooltips live inside `DashboardPage.tsx`. To localize, extract them into a shared dictionary and update the tests accordingly.
  - Screenshot/regression coverage: capture updated dashboard states after major API changes and drop PNGs into `docs/main_screens`. Mention which dataset (e.g., `data/260-1_account.json`) produced the snapshot so analysts can reproduce it.
  
