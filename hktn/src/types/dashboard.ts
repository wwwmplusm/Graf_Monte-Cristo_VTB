// Файл: src/types/dashboard.ts

// --- Секция 1: Вспомогательные типы (оставьте как есть) ---
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

export type RecurringEvent = MetadataMixin & {
  name: string;
  amount: number;
  is_income: boolean;
  next_date: string;
};

export type SafeToSpendNarrative = {
  cycle_start?: string;
  cycle_end?: string;
  days_in_cycle?: number;
  current_balance?: number; // Убедитесь, что это поле здесь есть
  obligations_total?: number;
  free_cash?: number;
  goal_reserve?: number;
  spendable_total?: number;
  next_income_event?: { // Убедитесь, что этот объект определен
    label?: string;
    next_occurrence?: string;
    mu_amount?: number;
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


// --- Секция 2: Новые типы для дашборда (УБЕДИТЕСЬ, ЧТО ОНИ ЕСТЬ ТОЛЬКО ОДИН РАЗ) ---

// Тип для элемента в блоке "Бортовой журнал"
export type UpcomingEvent = {
  name: string;
  amount: number;
  date?: string; // ISO date string
  is_income?: boolean;
  source?: string | null;
  due_date?: string;
};

// Тип для элемента в блоке "Ваш бюджет"
export type BudgetBreakdownItem = {
  category: string;
  amount: number;
};


// --- Секция 3: Главный тип ответа (УБЕДИТЕСЬ, ЧТО ОН ЕСТЬ ТОЛЬКО ОДИН РАЗ) ---

// Это единственное и правильное определение для DashboardResponse
export type DashboardResponse = {
  current_balance: number;
  safe_to_spend_daily: number | null;
  goal_probability: number;
  upcoming_events?: UpcomingEvent[];
  budget_breakdown?: BudgetBreakdownItem[];
  upcoming_payments?: UpcomingEvent[];
  
  total_debt?: number;
  debt_freedom_date?: string | null;

  recurring_events: RecurringEvent[];

  health_score?: number;
  bank_statuses?: Record<string, { bank_name: string; status: string; message?: string }>;
  safe_to_spend_narrative?: SafeToSpendNarrative;
  safe_to_spend_context?: SafeToSpendContext;
  balance_context?: BalanceContext;
};
