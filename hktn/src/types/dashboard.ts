export type BankStatus = {
  bank_name: string;
  status: string;
  fetched_at: string | null;
};

export type Account = {
  accountId: string;
  nickname?: string;
  balance?: number;
  [key: string]: unknown;
};

export type DashboardResponse = {
  total_balance: number;
  accounts: Account[];
  bank_statuses: Record<string, BankStatus>;
  safe_to_spend_daily: number;
  next_income_date: string | null;
  days_until_next_income: number;
};
