import type {
  DemoAccount,
  DemoAgreement,
  DemoTransaction,
  DemoUserRecord,
} from '../data/demoDatasetTypes';

// Bank labels to make raw ids human friendly
export const BANK_LABELS: Record<string, string> = {
  vbank: 'VBank',
  sbank: 'Sbank',
  abank: 'ABank',
};

export const getBankLabel = (bankId: string) => BANK_LABELS[bankId] ?? bankId;

type LoanProductType = 'loan' | 'credit_card' | 'mortgage' | 'overdraft';

export interface LoanForCalc {
  id: string;
  agreementId: string;
  productType: LoanProductType;
  bank: string;
  status: string;
  amount: number;
  interestRate: number;
  startDate?: string | null;
  endDate?: string | null;
  paymentSchedule?: Array<{ paymentDate?: string; date?: string; amount?: number }>;
  accountNumber?: string | null;
}

export interface IncomeInfo {
  estimated_monthly_income: number;
  income_frequency_type: 'regular_monthly' | 'regular_biweekly' | 'irregular';
  next_income_window: { start: string; end: string } | null;
  debt_obligations_status: Array<{
    agreement_id: string;
    planned_amount: number;
    paid_in_current_period: boolean;
    last_payment_date: string | null;
  }>;
}

export interface PerLoanMDP {
  agreement_id: string;
  daily_mdp: number;
  monthly_payment: number;
  due_date: string;
  days_left: number;
}

export interface RefinanceInsight {
  currentDebt: number;
  loansCount: number;
  weightedRate: number;
  proposedRate: number;
  currentMonthly: number;
  newMonthly: number;
  savingsTotal: number;
  termMonths: number;
  banks: string[];
}

const toNumber = (val: number | string | null | undefined) => {
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  if (typeof val === 'string') {
    const num = parseFloat(val);
    return isFinite(num) ? num : 0;
  }
  return 0;
};

const isCreditCard = (agreement: DemoAgreement) => {
  if (agreement.product_type !== 'card') return false;
  const amount = agreement.amount ?? 0;
  return (
    amount > 0 ||
    (agreement.product_name || '').toLowerCase().includes('кредит') ||
    (agreement.product_name || '').toLowerCase().includes('credit')
  );
};

export const normalizeLoan = (agr: DemoAgreement): LoanForCalc => {
  let productType: LoanProductType = 'loan';
  if (agr.product_type === 'mortgage') productType = 'mortgage';
  else if (agr.product_type === 'overdraft') productType = 'overdraft';
  else if (agr.product_type === 'card' && isCreditCard(agr)) productType = 'credit_card';

  return {
    id: agr.agreement_id,
    agreementId: agr.agreement_id,
    productType,
    bank: agr.bank,
    status: agr.status,
    amount: toNumber(agr.amount),
    interestRate: toNumber(agr.interest_rate),
    startDate: agr.start_date,
    endDate: agr.end_date,
    paymentSchedule: undefined,
    accountNumber: null,
  };
};

export const calculateTotalDebitBalance = (accounts: DemoAccount[]): number => {
  const debitSubtypes = ['Checking', 'CurrentAccount', 'Savings', 'Personal', 'CardAccount', 'Wallet', 'General'];

  return accounts.reduce((total, account) => {
    if (!['Enabled', 'Active'].includes(account.status)) return total;
    if (!debitSubtypes.includes(account.accountSubType)) return total;

    const rawAmount = toNumber(account.balance.amount);
    const adjusted = account.balance.creditDebitIndicator === 'Debit' ? -rawAmount : rawAmount;
    const safe = Math.max(0, adjusted);
    return total + safe;
  }, 0);
};

export const aggregateBalancesByBank = (accounts: DemoAccount[]) => {
  const byBank: Record<string, { total: number; accounts: number }> = {};
  accounts.forEach(acc => {
    if (!['Enabled', 'Active'].includes(acc.status)) return;
    const amount = toNumber(acc.balance.amount);
    const adj = acc.balance.creditDebitIndicator === 'Debit' ? -amount : amount;
    if (adj <= 0) return;
    if (!byBank[acc.bank]) byBank[acc.bank] = { total: 0, accounts: 0 };
    byBank[acc.bank].total += adj;
    byBank[acc.bank].accounts += 1;
  });
  return Object.entries(byBank).map(([bank, data]) => ({
    bank,
    total: data.total,
    accounts: data.accounts,
  }));
};

export const calculateTotalDebt = (agreements: LoanForCalc[]) => {
  return agreements.reduce(
    (acc, agreement) => {
      if (agreement.status !== 'active') return acc;
      const amount = toNumber(agreement.amount);
      if (agreement.productType === 'loan' || agreement.productType === 'mortgage' || agreement.productType === 'overdraft') {
        acc.total_loans_debt_base += amount;
      } else if (agreement.productType === 'credit_card') {
        acc.total_cards_debt_base += amount;
      }
      acc.total_debt_base = acc.total_cards_debt_base + acc.total_loans_debt_base;
      return acc;
    },
    { total_debt_base: 0, total_loans_debt_base: 0, total_cards_debt_base: 0 }
  );
};

const daysBetween = (from: Date, to: Date) => Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));

export const categorizeTransactions = (
  transactions: DemoTransaction[],
  agreements: LoanForCalc[],
  now: Date = new Date()
): IncomeInfo => {
  const salaryKeywords = ['зарплата', 'salary', 'payroll', 'аванс', 'премия', 'доход'];

  const incomeTransactions = transactions
    .filter(tx => tx.creditDebitIndicator === 'Credit')
    .filter(tx => {
      const code = tx.bankTransactionCode?.code || tx.bankTransactionCode?.Code || '';
      const info = (tx.transactionInformation || '').toLowerCase();
      return code === '02' || salaryKeywords.some(k => info.includes(k));
    })
    .map(tx => ({
      date: new Date(tx.bookingDateTime),
      amount: toNumber(tx.amount.amount),
    }));

  const monthlySums: Record<string, number> = {};
  incomeTransactions.forEach(tx => {
    const key = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`;
    monthlySums[key] = (monthlySums[key] || 0) + tx.amount;
  });

  const monthlyValues = Object.values(monthlySums);
  const estimated_monthly_income = monthlyValues.length
    ? monthlyValues.sort((a, b) => a - b)[Math.floor(monthlyValues.length / 2)]
    : 0;

  let income_frequency_type: IncomeInfo['income_frequency_type'] = 'irregular';
  const sortedIncome = incomeTransactions.sort((a, b) => a.date.getTime() - b.date.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sortedIncome.length; i++) {
    gaps.push(daysBetween(sortedIncome[i - 1].date, sortedIncome[i].date));
  }
  if (gaps.length) {
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const variance = gaps.reduce((s, g) => s + Math.pow(g - avgGap, 2), 0) / gaps.length;
    const std = Math.sqrt(variance);
    if (std <= 5) {
      if (avgGap >= 25 && avgGap <= 35) income_frequency_type = 'regular_monthly';
      else if (avgGap >= 10 && avgGap <= 20) income_frequency_type = 'regular_biweekly';
    }
  }

  let next_income_window: IncomeInfo['next_income_window'] = null;
  if (sortedIncome.length) {
    const lastIncome = sortedIncome[sortedIncome.length - 1].date;
    const deltaDays =
      income_frequency_type === 'regular_monthly' ? 30 : income_frequency_type === 'regular_biweekly' ? 14 : 30;
    const nextIncome = new Date(lastIncome.getTime() + deltaDays * 24 * 60 * 60 * 1000);
    next_income_window = {
      start: new Date(nextIncome.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date(nextIncome.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const debt_obligations_status: IncomeInfo['debt_obligations_status'] = agreements
    .filter(agr => ['loan', 'credit_card', 'mortgage'].includes(agr.productType))
    .map(agreement => {
      const agreement_id = agreement.id;
      let planned_amount = 0;
      if (agreement.paymentSchedule?.length) {
        const upcoming = agreement.paymentSchedule.find(p => {
          const dateStr = p.paymentDate || p.date;
          if (!dateStr) return false;
          const d = new Date(dateStr);
          return d >= monthStart;
        });
        planned_amount = toNumber(upcoming?.amount);
      }

      const paid_in_current_period = transactions.some(tx => {
        if (tx.creditDebitIndicator !== 'Debit') return false;
        const txDate = new Date(tx.bookingDateTime);
        if (txDate < monthStart) return false;
        const info = (tx.transactionInformation || '').toLowerCase();
        const txAmount = toNumber(tx.amount.amount);
        return info.includes(agreement_id.toLowerCase()) && (planned_amount === 0 || txAmount >= planned_amount * 0.9);
      });

      return {
        agreement_id,
        planned_amount,
        paid_in_current_period,
        last_payment_date: null,
      };
    });

  return { estimated_monthly_income, income_frequency_type, next_income_window, debt_obligations_status };
};

export const calculateMDP = (loans: LoanForCalc[], obligations: IncomeInfo['debt_obligations_status'], now = new Date()) => {
  const total = { mdp_today_base: 0, per_loan_mdp: [] as PerLoanMDP[] };
  const obligationMap = obligations.reduce<Record<string, IncomeInfo['debt_obligations_status'][number]>>((acc, ob) => {
    acc[ob.agreement_id] = ob;
    return acc;
  }, {});

  loans.forEach(loan => {
    if (loan.status !== 'active') return;
    if (!['loan', 'credit_card', 'mortgage', 'overdraft'].includes(loan.productType)) return;

    const obligation = obligationMap[loan.id];
    let plannedAmount = toNumber(obligation?.planned_amount);
    if (!plannedAmount) {
      const amount = toNumber(loan.amount);
      const interestRate = toNumber(loan.interestRate);
      const interestPart = amount * (interestRate / 100 / 12);
      const principalPart = amount * 0.01;
      plannedAmount = interestPart + principalPart;
    }

    let dueDate: Date;
    const scheduleDate = loan.paymentSchedule?.find(p => p.paymentDate || p.date);
    if (scheduleDate && (scheduleDate.paymentDate || scheduleDate.date)) {
      dueDate = new Date(scheduleDate.paymentDate || scheduleDate.date || now);
    } else if (loan.startDate) {
      const start = new Date(loan.startDate);
      dueDate = new Date(now);
      dueDate.setDate(start.getDate());
      if (dueDate < now) {
        dueDate.setMonth(dueDate.getMonth() + 1);
      }
    } else {
      dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    const remaining = obligation?.paid_in_current_period ? 0 : plannedAmount;
    const daysLeft = daysBetween(now, dueDate);
    const daily = remaining / daysLeft;

    total.mdp_today_base += daily;
    total.per_loan_mdp.push({
      agreement_id: loan.id,
      daily_mdp: daily,
      monthly_payment: plannedAmount,
      due_date: dueDate.toISOString(),
      days_left: daysLeft,
    });
  });

  return total;
};

export const calculateADP = (
  mdpToday: number,
  loans: LoanForCalc[],
  estimatedMonthlyIncome: number,
  repaymentSpeed: 'conservative' | 'balanced' | 'fast' = 'balanced',
  strategy: 'avalanche' | 'snowball' = 'avalanche'
) => {
  const speedCoefficients: Record<string, number> = {
    conservative: 0.1,
    balanced: 0.3,
    fast: 0.5,
  };

  const k = speedCoefficients[repaymentSpeed] ?? 0.3;
  let adp_today_base = mdpToday * k;

  if (estimatedMonthlyIncome > 0) {
    const cap = (estimatedMonthlyIncome * 0.2) / 30;
    adp_today_base = Math.min(adp_today_base, cap);
  }

  const activeLoans = loans.filter(
    loan => loan.status === 'active' && ['loan', 'credit_card', 'mortgage'].includes(loan.productType)
  );

  if (!activeLoans.length) {
    return { adp_today_base: 0, target_loan_id: null, target_reason: 'No active loans' };
  }

  const sorted = activeLoans.sort((a, b) => {
    if (strategy === 'avalanche') return (b.interestRate || 0) - (a.interestRate || 0) || a.amount - b.amount;
    return a.amount - b.amount || (b.interestRate || 0) - (a.interestRate || 0);
  });

  const target = sorted[0];
  const target_loan_id = target.agreementId;
  const loanAmount = toNumber(target.amount);
  if (adp_today_base > loanAmount) adp_today_base = loanAmount;

  return {
    adp_today_base,
    target_loan_id,
    target_reason: strategy === 'avalanche' ? 'Highest Rate' : 'Smallest Balance',
  };
};

const annuityPayment = (principal: number, annualRate: number, termMonths: number) => {
  if (termMonths <= 0) return 0;
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return principal / termMonths;
  const coeff = (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
  return principal * coeff;
};

export const calculateSTS = (
  totalDebitBalance: number,
  loans: LoanForCalc[],
  transactions: DemoTransaction[],
  mdpToday: number,
  adpToday: number,
  incomeData: IncomeInfo,
  horizonDays = 30,
  safetyBuffer = 1000,
  now: Date = new Date()
) => {
  let minLowPoint = totalDebitBalance;

  const paymentSchedule: Array<{ date: Date; amount: number }> = [];
  loans.forEach(loan => {
    if (loan.status !== 'active') return;
    loan.paymentSchedule?.forEach(p => {
      const dateStr = p.paymentDate || p.date;
      if (!dateStr) return;
      const date = new Date(dateStr);
      if (date >= now) {
        paymentSchedule.push({ date, amount: toNumber(p.amount) });
      }
    });
  });
  paymentSchedule.sort((a, b) => a.date.getTime() - b.date.getTime());

  const incomeSchedule: Array<{ date: Date; amount: number }> = [];
  if (incomeData.income_frequency_type === 'regular_monthly' || incomeData.income_frequency_type === 'regular_biweekly') {
    const nextIncomeStart = incomeData.next_income_window?.start;
    if (nextIncomeStart) {
      let date = new Date(nextIncomeStart);
      while (date <= new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000)) {
        incomeSchedule.push({ date: new Date(date), amount: incomeData.estimated_monthly_income });
        const delta = incomeData.income_frequency_type === 'regular_monthly' ? 30 : 14;
        date = new Date(date.getTime() + delta * 24 * 60 * 60 * 1000);
      }
    }
  }

  let simBalance = totalDebitBalance;
  const fallbackDailyPayment = mdpToday || 0;

  for (let day = 1; day <= horizonDays; day++) {
    const simDate = new Date(now.getTime() + day * 24 * 60 * 60 * 1000);

    const paymentsToday = paymentSchedule.filter(p => p.date.toDateString() === simDate.toDateString());
    paymentsToday.forEach(p => {
      simBalance -= p.amount;
    });

    if (!paymentsToday.length && fallbackDailyPayment > 0) {
      simBalance -= fallbackDailyPayment;
    }

    incomeSchedule
      .filter(i => i.date.toDateString() === simDate.toDateString())
      .forEach(i => {
        simBalance += i.amount;
      });

    minLowPoint = Math.min(minLowPoint, simBalance);
  }

  const freeCash = minLowPoint - safetyBuffer - adpToday;
  if (freeCash <= 0) {
    return { sts_daily_recommended: 0, status: 'DANGER', min_low_point: simBalance, free_cash: freeCash };
  }

  let daysUntilIncome = horizonDays;
  if (incomeSchedule.length) {
    const next = incomeSchedule.find(i => i.date > now);
    if (next) daysUntilIncome = daysBetween(now, next.date);
  }
  const sts_daily_recommended = freeCash / Math.max(1, daysUntilIncome);
  return {
    sts_daily_recommended,
    status: 'OK',
    min_low_point: minLowPoint,
    free_cash: freeCash,
  };
};

export const aggregateDebtsByBank = (loans: LoanForCalc[]) => {
  const byBank: Record<string, { total: number; products: number }> = {};
  loans.forEach(loan => {
    if (loan.status !== 'active') return;
    if (!['loan', 'credit_card', 'mortgage', 'overdraft'].includes(loan.productType)) return;
    const amount = toNumber(loan.amount);
    if (amount <= 0) return;
    if (!byBank[loan.bank]) byBank[loan.bank] = { total: 0, products: 0 };
    byBank[loan.bank].total += amount;
    byBank[loan.bank].products += 1;
  });
  return Object.entries(byBank).map(([bank, data]) => ({
    bank,
    total: data.total,
    products: data.products,
  }));
};

export const weightedAverageRate = (loans: LoanForCalc[]) => {
  const active = loans.filter(l => l.status === 'active' && l.amount > 0);
  const total = active.reduce((s, l) => s + l.amount, 0);
  if (total === 0) return 0;
  const weighted = active.reduce((s, l) => s + l.amount * (l.interestRate || 0), 0);
  return weighted / total;
};

export const buildRefinanceInsight = (
  loans: LoanForCalc[],
  perLoanMdp: PerLoanMDP[],
  totalDebt: number
): RefinanceInsight => {
  const activeLoans = loans.filter(
    loan => loan.status === 'active' && ['loan', 'credit_card', 'mortgage', 'overdraft'].includes(loan.productType)
  );
  const weightedRate = weightedAverageRate(activeLoans);
  const currentMonthly =
    perLoanMdp.reduce((sum, item) => sum + item.monthly_payment, 0) ||
    annuityPayment(totalDebt, weightedRate || 10, 36);

  const monthCandidates = activeLoans
    .map(loan => {
      if (!loan.endDate) return 36;
      const end = new Date(loan.endDate);
      const now = new Date();
      const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
      return Math.max(6, months);
    })
    .filter(Boolean);
  const termMonths =
    monthCandidates.length > 0
      ? Math.round(monthCandidates.reduce((s, m) => s + m, 0) / monthCandidates.length)
      : 36;

  const proposedRate = Math.max(0, weightedRate * 0.9);
  const newMonthly = annuityPayment(totalDebt, proposedRate, termMonths);
  const savingsTotal = Math.max(0, (currentMonthly - newMonthly) * termMonths);

  return {
    currentDebt: totalDebt,
    loansCount: activeLoans.length,
    weightedRate,
    proposedRate,
    currentMonthly,
    newMonthly,
    savingsTotal,
    termMonths,
    banks: Array.from(new Set(activeLoans.map(loan => getBankLabel(loan.bank)))),
  };
};

export const cloneUser = (user: DemoUserRecord): DemoUserRecord => JSON.parse(JSON.stringify(user));
