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

export type CreditRanking = {
  name: string;
  balance: number;
  rate?: number;
  min_payment: number;
  days_past_due?: number;
  stress_score?: number;
};

export type DashboardAnalysis = {
  recommendation?: string;
  color_zone?: string;
  payment_amount?: number;
  payment_date?: string;
  [key: string]: unknown;
};

export type DashboardResponse = {
  analysis?: DashboardAnalysis;
  safe_to_spend?: number;
  safe_to_spend_daily?: number;
  goal_probability?: number;
  bank_statuses?: Record<string, { status: string; message?: string }>;
  recurring_events?: RecurringEvent[];
  total_debt?: number;
  monthly_income?: number;
  monthly_payments?: number;
  health_score?: number;
  upcoming_payments?: UpcomingPayment[];
  current_balance?: number;
  credit_rankings?: CreditRanking[];
};
