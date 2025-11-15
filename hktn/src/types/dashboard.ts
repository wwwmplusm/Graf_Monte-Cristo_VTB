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

export type DashboardResponse = {
  current_balance: number;
  safe_to_spend_daily: number;
  goal_probability: number;
  upcoming_payments: UpcomingPayment[];
  recurring_events: RecurringEvent[];
  total_debt?: number;
  health_score?: number;
  bank_statuses?: Record<string, { bank_name: string; status: string; message?: string }>;
};
