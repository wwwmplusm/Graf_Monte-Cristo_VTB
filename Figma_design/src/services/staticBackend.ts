// StaticBackend simulates the backend API using local demo data and the same
// calculation rules that live in the Python service. All metrics are derived
// from the dataset – no hardcoded numbers.

import type { DemoUserRecord, DemoAgreement, DemoAccount } from '../data/demoDatasetTypes';
import { findDemoUserById } from '../data/demoUsers';
import {
  aggregateBalancesByBank,
  aggregateDebtsByBank,
  buildRefinanceInsight,
  calculateADP,
  calculateMDP,
  calculateSTS,
  calculateTotalDebt,
  calculateTotalDebitBalance,
  categorizeTransactions,
  cloneUser,
  getBankLabel,
  normalizeLoan,
  weightedAverageRate,
  type IncomeInfo,
  type LoanForCalc,
  type PerLoanMDP,
  type RefinanceInsight,
} from '../domain/metricsEngine';

export interface DebtByBank {
  bank: string;
  total: number;
  products: number;
}

export interface BalanceByBank {
  bank: string;
  total: number;
  accounts: number;
}

export interface LoanView {
  id: string;
  bank: string;
  type: string;
  balance: number;
  rate: number;
  monthly_payment: number;
  maturity_date: string;
  priority: number;
  due_in_days?: number;
}

export interface DashboardResponse {
  sts: number;
  mdp: number;
  adp: number;
  total_debt: number;
  total_debit_balance: number;
  data_as_of: string;
  cards?: any[];
  banks_status?: Record<string, { status: string; enabled: boolean }>;
  debts_by_bank?: DebtByBank[];
  balances_by_bank?: BalanceByBank[];
  refinance?: RefinanceInsight;
  per_loan_mdp?: PerLoanMDP[];
  spent_today?: number;
}

export interface LoansResponse {
  loans: LoanView[];
}

export interface AccountsResponse {
  accounts: Array<{
    accountId: string;
    balance: number;
    currency: string;
    bank: string;
  }>;
}

interface SessionState {
  baseUser: DemoUserRecord;
  banksStatus: Record<string, { status: string; enabled: boolean }>;
  loanAdjustments: Record<string, number>;
  accountAdjustments: Record<string, number>;
  spentToday: number;
}

interface AppData {
  metrics: DashboardResponse;
  loans: LoanView[];
  accounts: AccountsResponse['accounts'];
  cards: DashboardResponse['cards'];
}

const toNumber = (val: string | number | null | undefined) => {
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  if (typeof val === 'string') {
    const num = parseFloat(val);
    return isFinite(num) ? num : 0;
  }
  return 0;
};

const loanKey = (agreementId: string) => agreementId;
const accountKey = (acc: DemoAccount) => `${acc.bank}:${acc.accountId}`;

const isCreditCardAgreement = (agr: DemoAgreement) => {
  if (agr.product_type !== 'card') return false;
  const name = (agr.product_name || '').toLowerCase();
  return name.includes('кредит') || name.includes('credit') || toNumber(agr.amount) > 0;
};

export class StaticBackend {
  private sessions: Record<string, SessionState> = {};

  private getSession(userId: string): SessionState {
    const existing = this.sessions[userId];
    if (existing) return existing;

    const user = findDemoUserById(userId) as DemoUserRecord | undefined;
    if (!user) throw new Error('User not found');

    const banksStatus: SessionState['banksStatus'] = {};
    user.accounts.forEach(acc => {
      banksStatus[acc.bank] = { status: 'connected', enabled: true };
    });

    const session: SessionState = {
      baseUser: cloneUser(user),
      banksStatus,
      loanAdjustments: {},
      accountAdjustments: {},
      spentToday: 0,
    };
    this.sessions[userId] = session;
    return session;
  }

  private applyAdjustments(user: DemoUserRecord, session: SessionState): DemoUserRecord {
    const adjusted = cloneUser(user);

    adjusted.accounts = adjusted.accounts.map(acc => {
      const key = accountKey(acc);
      const delta = session.accountAdjustments[key] || 0;
      const updatedAmount = Math.max(0, toNumber(acc.balance.amount) + delta);
      return {
        ...acc,
        balance: {
          ...acc.balance,
          amount: updatedAmount.toFixed(2),
        },
      };
    });

    adjusted.agreements = adjusted.agreements.map(agr => {
      const key = loanKey(agr.agreement_id);
      const delta = session.loanAdjustments[key] || 0;
      return {
        ...agr,
        amount: Math.max(0, toNumber(agr.amount) + delta),
      };
    });

    return adjusted;
  }

  private filterByEnabled<T extends { bank: string }>(items: T[], session: SessionState): T[] {
    return items.filter(item => session.banksStatus[item.bank]?.enabled !== false);
  }

  private filterTransactions(transactions: DemoUserRecord['transactions'], enabledBanks: string[]) {
    // Best effort: detect bank by cardId prefix or keep if bank cannot be inferred
    return transactions.filter(tx => {
      if (!enabledBanks.length) return true;
      const cardId = tx.card?.cardId || '';
      const matchedBank = enabledBanks.find(bank => cardId.includes(bank));
      return matchedBank ? enabledBanks.includes(matchedBank) : true;
    });
  }

  private deductFromBalances(session: SessionState, accounts: DemoAccount[], amount: number, preferredBank?: string) {
    if (amount <= 0) return;
    let remaining = amount;

    const sorted = [...accounts]
      .filter(acc => ['Enabled', 'Active'].includes(acc.status))
      .sort((a, b) => {
        const aScore = preferredBank && a.bank === preferredBank ? 0 : 1;
        const bScore = preferredBank && b.bank === preferredBank ? 0 : 1;
        if (aScore !== bScore) return aScore - bScore;
        return toNumber(b.balance.amount) - toNumber(a.balance.amount);
      });

    for (const acc of sorted) {
      if (remaining <= 0) break;
      const key = accountKey(acc);
      const current = Math.max(0, toNumber(acc.balance.amount) + (session.accountAdjustments[key] || 0));
      if (current <= 0) continue;
      const deduction = Math.min(current, remaining);
      session.accountAdjustments[key] = (session.accountAdjustments[key] || 0) - deduction;
      remaining -= deduction;
    }
  }

  private applyPaymentToLoan(session: SessionState, agreements: DemoAgreement[], loanId: string, amount: number) {
    const target = agreements.find(agr => agr.agreement_id === loanId);
    if (!target || amount <= 0) return;
    const key = loanKey(target.agreement_id);
    const current = Math.max(0, toNumber(target.amount) + (session.loanAdjustments[key] || 0));
    const deduction = Math.min(current, amount);
    session.loanAdjustments[key] = (session.loanAdjustments[key] || 0) - deduction;
  }

  private mapLoansForUi(loans: LoanForCalc[], perLoanMdp: PerLoanMDP[]): LoanView[] {
    const mdpMap = perLoanMdp.reduce<Record<string, PerLoanMDP>>((acc, item) => {
      acc[item.agreement_id] = item;
      return acc;
    }, {});

    return loans
      .filter(loan => ['loan', 'credit_card', 'mortgage', 'overdraft'].includes(loan.productType))
      .map((loan, index) => {
        const mdp = mdpMap[loan.id];
        return {
          id: loan.id,
          bank: getBankLabel(loan.bank),
          type:
            loan.productType === 'credit_card'
              ? 'Кредитная карта'
              : loan.productType === 'mortgage'
                ? 'Ипотека'
                : 'Кредит',
          balance: loan.amount,
          rate: loan.interestRate || weightedAverageRate(loans),
          monthly_payment: mdp?.monthly_payment ?? 0,
          maturity_date: loan.endDate || loan.startDate || new Date().toISOString(),
          priority: index + 1,
          due_in_days: mdp?.days_left,
        };
      });
  }

  private buildCards(agreements: DemoAgreement[]) {
    return agreements
      .filter(agr => agr.product_type === 'card')
      .map(agr => ({
        id: agr.agreement_id,
        bank: getBankLabel(agr.bank),
        name: agr.product_name,
        balance: toNumber(agr.amount),
        type: isCreditCardAgreement(agr) ? ('credit' as const) : ('debit' as const),
      }));
  }

  private buildAppData(userId: string): AppData {
    const session = this.getSession(userId);
    const adjustedUser = this.applyAdjustments(session.baseUser, session);

    const enabledBanks = Object.entries(session.banksStatus)
      .filter(([, status]) => status.enabled)
      .map(([bank]) => bank);

    const accounts = this.filterByEnabled(adjustedUser.accounts, session);
    const agreements = this.filterByEnabled(adjustedUser.agreements, session);
    const transactions = this.filterTransactions(adjustedUser.transactions, enabledBanks);

    const normalizedLoans = agreements.map(normalizeLoan);
    const totals = calculateTotalDebt(normalizedLoans);
    const debitTotal = calculateTotalDebitBalance(accounts);
    const incomeData: IncomeInfo = categorizeTransactions(transactions, normalizedLoans);
    const mdpResult = calculateMDP(normalizedLoans, incomeData.debt_obligations_status);
    const adpResult = calculateADP(mdpResult.mdp_today_base, normalizedLoans, incomeData.estimated_monthly_income);
    const stsResult = calculateSTS(
      debitTotal,
      normalizedLoans,
      transactions,
      mdpResult.mdp_today_base,
      adpResult.adp_today_base,
      incomeData
    );

    const debtsByBank = aggregateDebtsByBank(normalizedLoans);
    const balancesByBank = aggregateBalancesByBank(accounts);
    const refinance = buildRefinanceInsight(normalizedLoans, mdpResult.per_loan_mdp, totals.total_debt_base);

    const loans = this.mapLoansForUi(normalizedLoans, mdpResult.per_loan_mdp);
    const cards = this.buildCards(agreements);

    const metrics: DashboardResponse = {
      sts: stsResult.sts_daily_recommended,
      mdp: mdpResult.mdp_today_base,
      adp: adpResult.adp_today_base,
      total_debt: totals.total_debt_base,
      total_debit_balance: debitTotal,
      data_as_of: new Date().toISOString(),
      cards,
      banks_status: session.banksStatus,
      debts_by_bank: debtsByBank,
      balances_by_bank: balancesByBank,
      refinance,
      per_loan_mdp: mdpResult.per_loan_mdp,
      spent_today: session.spentToday,
    };

    return {
      metrics,
      loans,
      accounts: accounts.map(acc => ({
        accountId: acc.accountId,
        balance: toNumber(acc.balance.amount),
        currency: acc.balance.currency,
        bank: getBankLabel(acc.bank),
      })),
      cards,
    };
  }

  async getAppData(userId: string): Promise<AppData> {
    return this.buildAppData(userId);
  }

  async getDashboard(userId: string): Promise<DashboardResponse> {
    const data = this.buildAppData(userId);
    return data.metrics;
  }

  async getLoans(userId: string): Promise<LoansResponse> {
    const data = this.buildAppData(userId);
    return { loans: data.loans };
  }

  async getAccounts(userId: string): Promise<AccountsResponse> {
    const data = this.buildAppData(userId);
    return { accounts: data.accounts };
  }

  async executePayment(
    userId: string,
    payment: { payment_type: 'mdp' | 'adp' | 'sdp'; amount: number; target_loan_id?: string }
  ): Promise<AppData> {
    const session = this.getSession(userId);
    const adjustedUser = this.applyAdjustments(session.baseUser, session);
    const accounts = this.filterByEnabled(adjustedUser.accounts, session);
    const agreements = this.filterByEnabled(adjustedUser.agreements, session);

    const normalizedLoans = agreements.map(normalizeLoan).filter(l => l.status === 'active');
    const targetLoanId =
      payment.target_loan_id ||
      normalizedLoans.sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0))[0]?.id;
    const targetLoanBank = normalizedLoans.find(l => l.id === targetLoanId)?.bank;

    if (payment.payment_type === 'mdp' || payment.payment_type === 'adp') {
      if (targetLoanId) {
        this.applyPaymentToLoan(session, agreements, targetLoanId, payment.amount);
      }
      this.deductFromBalances(session, accounts, payment.amount, targetLoanBank);
    } else if (payment.payment_type === 'sdp') {
      this.deductFromBalances(session, accounts, payment.amount);
    }

    session.spentToday += payment.amount;
    return this.buildAppData(userId);
  }

  async toggleBank(
    userId: string,
    bankId: string,
    enabled: boolean
  ): Promise<{ success: boolean; data: AppData }> {
    const session = this.getSession(userId);
    if (session.banksStatus[bankId]) {
      session.banksStatus[bankId].enabled = enabled;
    }
    const data = this.buildAppData(userId);
    return { success: true, data };
  }
}

export const staticBackend = new StaticBackend();
