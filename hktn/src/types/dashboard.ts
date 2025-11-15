export type ObligationSource =
  | 'credit_agreement'
  | 'recurring_debit'
  | 'recurring_income'
  | 'income_event'
  | 'expense_event'
  | (string & Record<never, never>);

export type MetadataMixin = {
  mcc_code?: string | null;
  category?: string | null;
  merchant_name?: string | null;
  bank_transaction_code?: string | null;
  source?: ObligationSource | null;
  frequency_days?: number | null;
};

export type UpcomingPayment = MetadataMixin & {
  name: string;
  amount: number | null;
  due_date: string;
};

export type RecurringEvent = MetadataMixin & {
  name: string;
  amount: number;
  is_income: boolean;
  next_date: string;
};

export type UpcomingEvent = MetadataMixin & {
  name: string;
  amount: number;
  date: string;
  is_income?: boolean;
};

export type BudgetBreakdownItem = {
  category: string;
  amount: number;
};

export type SafeToSpendNarrative = {
  cycle_start?: string;
  cycle_end?: string;
  days_in_cycle?: number;
  current_balance?: number;
  obligations_total?: number;
  free_cash?: number;
  goal_reserve?: number;
  spendable_total?: number;
  next_income_event?: {
    label?: string | null;
    next_occurrence?: string;
    amount?: number;
  } | null;
};

export type SafeToSpendContext = {
  state: string;
  message?: string | null;
};

export type BalanceContext = {
  state: string;
  message?: string | null;
  account_count?: number;
};

export type DashboardResponse = {
  current_balance: number;
  safe_to_spend_daily: number | null;
  goal_probability: number;
  upcoming_payments: UpcomingPayment[];
  recurring_events: RecurringEvent[];
  upcoming_events?: UpcomingEvent[];
  budget_breakdown?: BudgetBreakdownItem[];
  total_debt?: number;
  health_score?: number;
  bank_statuses?: Record<string, { bank_name: string; status: string; message?: string }>;
  safe_to_spend_narrative?: SafeToSpendNarrative;
  safe_to_spend_context?: SafeToSpendContext;
  balance_context?: BalanceContext;
};
