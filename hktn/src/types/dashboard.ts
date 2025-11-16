export type BankStatus = {
  bank_id: string;
  bank_name: string;
  status: string;
  fetched_at: string | null;
};

export type CreditPaymentMetadata = {
  amount: number;
  next_payment_date: string;
};

export type DashboardResponse = {
  total_balance: number;
  bank_statuses: BankStatus[];
  safe_to_spend_daily: number;
  salary_amount: number;
  next_salary_date: string;
  days_until_next_salary: number;
  upcoming_credit_payment: CreditPaymentMetadata;
};
