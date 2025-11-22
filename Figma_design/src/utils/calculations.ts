import type { AppState } from '../data/mockAppState';

export interface StrategyConfig {
    coefficient: number;
    description: string;
    color: string;
}

export const STRATEGY_CONFIGS: Record<string, StrategyConfig> = {
    'консервативно': {
        coefficient: 0.1,
        description: '+10% к обязательным платежам',
        color: 'text-blue-600 bg-blue-50'
    },
    'сбалансировано': {
        coefficient: 0.3,
        description: '+30% к обязательным платежам',
        color: 'text-purple-600 bg-purple-50'
    },
    'агрессивно': {
        coefficient: 0.5,
        description: '+50% к обязательным платежам',
        color: 'text-orange-600 bg-orange-50'
    }
};

export function getStrategyConfig(strategy: string): StrategyConfig {
    return STRATEGY_CONFIGS[strategy] || STRATEGY_CONFIGS['сбалансировано'];
}

export function calculateHealthScore(appState: AppState): number {
    const { loans, balances, sts } = appState;

    // Factor 1: DTI Score (0-100)
    // Assuming estimated_monthly_income is available in user profile or calculated
    // For now, we'll estimate income based on MDP (assuming MDP is ~30-50% of income for average user)
    // or use a default if not available.
    // In a real app, this would come from the backend analysis.
    const estimatedIncome = 100000; // Fallback if not in AppState yet

    const monthlyPayments = loans.summary.mandatory_daily_payment * 30;
    const dti = estimatedIncome > 0 ? monthlyPayments / estimatedIncome : 1.0;

    let dtiScore = 0;
    if (dti <= 0.3) {
        dtiScore = 100;
    } else if (dti >= 0.5) {
        dtiScore = 0;
    } else {
        dtiScore = ((0.5 - dti) / 0.2) * 100;
    }

    // Factor 2: STS Score (0-100)
    const stsDaily = sts.today.amount - sts.today.spent;
    const stsTotalRecommended = sts.today.amount;

    let stsScore = 0;
    if (stsDaily <= 0) {
        stsScore = 0;
    } else if (stsTotalRecommended > 0) {
        stsScore = Math.min(100, (stsDaily / stsTotalRecommended) * 100);
    } else {
        stsScore = 100; // No STS limit implies OK
    }

    // Factor 3: Overdue Score (0-100)
    // Assuming we might have overdue info in items in the future, currently not in interface
    // We'll check if any loan has a very high priority or specific status if available
    const hasOverdue = false; // Placeholder until overdue field is added to AppState
    const overdueScore = hasOverdue ? 0 : 100;

    // Factor 4: Liquidity Score (0-100)
    const liquidRatio = loans.summary.total_outstanding > 0
        ? (balances.total_debit / loans.summary.total_outstanding)
        : 1.0;

    let liquidityScore = 0;
    if (liquidRatio >= 0.3) {
        liquidityScore = 100;
    } else if (liquidRatio <= 0) {
        liquidityScore = 0;
    } else {
        liquidityScore = (liquidRatio / 0.3) * 100;
    }

    // Weighted average
    const healthScore = Math.round(
        dtiScore * 0.4 +
        stsScore * 0.3 +
        overdueScore * 0.2 +
        liquidityScore * 0.1
    );

    return Math.max(0, Math.min(100, healthScore));
}

export function getHealthStatus(score: number): 'спокойно' | 'внимание' | 'нужен план' {
    if (score >= 70) return 'спокойно';
    if (score >= 40) return 'внимание';
    return 'нужен план';
}

export function generateHealthReasons(appState: AppState): string[] {
    const reasons: string[] = [];
    const { loans, balances, sts } = appState;

    const estimatedIncome = 100000; // Fallback
    const monthlyPayments = loans.summary.mandatory_daily_payment * 30;
    const dti = estimatedIncome > 0 ? monthlyPayments / estimatedIncome : 1.0;

    // Reason 1: DTI
    if (dti < 0.3) {
        reasons.push('Долговая нагрузка в норме');
    } else if (dti >= 0.5) {
        reasons.push('⚠️ Высокая долговая нагрузка');
    } else {
        reasons.push('Долговая нагрузка умеренная');
    }

    // Reason 2: Reserves
    if (balances.total_debit > loans.summary.mandatory_daily_payment * 7) {
        reasons.push('Есть резервы на счетах');
    } else if (balances.total_debit > 0) {
        reasons.push('Ограниченные резервы');
    } else {
        reasons.push('⚠️ Резервы отсутствуют');
    }

    // Reason 3: STS status
    const stsDaily = sts.today.amount - sts.today.spent;
    if (stsDaily > 0) {
        reasons.push(`Можно тратить ${Math.round(stsDaily)}₽/день`);
    } else {
        reasons.push('⚠️ Лимит трат исчерпан');
    }

    return reasons.slice(0, 3);
}

export function calculateWeightedAverageRate(loans: AppState['loans']['items']): number {
    const totalDebt = loans.reduce((sum, l) => sum + l.balance, 0);

    if (totalDebt === 0) return 0;

    const weightedSum = loans.reduce((sum, l) => {
        return sum + (l.balance * l.rate);
    }, 0);

    return weightedSum / totalDebt;
}

export function calculatePayoffTime(
    totalDebt: number,
    dailyPayment: number,
    averageRate: number
): number {
    const monthlyPayment = dailyPayment * 30;
    const monthlyRate = averageRate / 100 / 12;

    if (monthlyPayment <= 0) return 999; // Infinite if no payment

    if (monthlyRate === 0) {
        return Math.ceil(totalDebt / monthlyPayment);
    }

    // Check if payment covers interest
    const monthlyInterest = totalDebt * monthlyRate;
    if (monthlyPayment <= monthlyInterest) {
        return 999; // Debt will never be paid off
    }

    const numerator = Math.log(1 - (totalDebt * monthlyRate) / monthlyPayment);
    const denominator = Math.log(1 + monthlyRate);

    const months = -numerator / denominator;

    return Math.ceil(months);
}

export function calculateSTSImpact(
    mdpToday: number
): string {
    const daysInMonth = 30;
    const dailyReduction = mdpToday / daysInMonth;
    const impact = Math.round(dailyReduction);

    if (impact > 0) {
        return `При оплате MDP: +${impact} ₽ к STS завтра`;
    }

    return 'Завтра STS пересчитается';
}
