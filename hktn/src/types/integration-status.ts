export type StepStatus = 'ok' | 'no_data' | 'no_access' | 'error';
export type PipelineStatus = 'ok' | 'partial' | 'error';

export type PipelineStep = {
  name: string;
  status: StepStatus;
  details: string;
  error_code?: string | null;
};

export type BankRawMetrics = {
  sum_account_balances: number;
  sum_credit_debts: number;
  used_in_base_score: boolean;
};

export type BankPipelineStatus = {
  bank_id: string;
  bank_name: string;
  pipeline_status: PipelineStatus;
  steps: PipelineStep[];
  raw_metrics: BankRawMetrics;
};

export type BaseScorePayload = {
  status: 'ok' | 'no_data' | 'error';
  value?: number | null;
  currency: string;
  reason: string;
};

export type IntegrationStatusResponse = {
  user_id: string;
  base_score: BaseScorePayload;
  banks: BankPipelineStatus[];
};
