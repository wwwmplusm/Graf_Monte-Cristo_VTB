
  # Main screens

  This is a code bundle for Main screens. The original project is available at https://www.figma.com/design/g2lq6y3UolIAHaAuvnYRaz/Main-screens.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Analytics flow updates

  - Bank transactions now retain merchant, MCC, bank transaction code, and card metadata so the clustering engine can reason about actual merchants instead of generic descriptions.
  - The analytics engine derives deterministic obligations from both credit agreements and highly coherent recurring debit clusters (tagged with their MCC/category/source), which flow into `/api/dashboard` and `/api/financial-portrait`.
  - Safe-to-spend calculations now use real-time balances summed from linked accounts, so probability estimates and explanations reflect actual cash instead of placeholder values.
  
