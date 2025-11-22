import { useEffect, useState } from 'react';
import { OnboardingData } from './OnboardingScreen';
import type { AppState } from '../data/mockAppState';
import { staticBackend } from '../services/staticBackend';
import { getBankLabel } from '../domain/metricsEngine';
import { calculateHealthScore, getHealthStatus, generateHealthReasons, calculateSTSImpact } from '../utils/calculations';

interface LoadingCalcScreenProps {
  onboardingData: OnboardingData;
  onComplete: (appState: AppState) => void;
}

export function LoadingCalcScreen({ onboardingData, onComplete }: LoadingCalcScreenProps) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Подключение к банкам...');

  useEffect(() => {
    const loadData = async () => {
      try {
        // 1. Load user data via static backend (no server call needed)
        setStatus('Загрузка данных пользователя...');
        setProgress(20);
        // No action needed; staticBackend will provide data based on user_id

        // 2. Sync Data & Calculate Metrics (static backend does this internally)
        setStatus('Синхронизация данных...');
        setProgress(40);
        // No explicit sync needed; metrics will be computed on demand

        // 3. Get Calculated Metrics from Dashboard via static backend
        setStatus('Загрузка метрик...');
        setProgress(60);

        const appData = await staticBackend.getAppData(onboardingData.user_profile.user_id);
        const metrics = appData.metrics;

        setStatus('Формирование интерфейса...');
        setProgress(90);

        // 3. Map to AppState
        const mode = onboardingData.goal?.type === 'save_money' ? 'deposits' : 'loans';

        // Use real metrics from backend (already DAILY values!)
        console.log('🔍 Dashboard metrics:', metrics);
        const stsToday = typeof metrics.sts === 'string' ? parseFloat(metrics.sts) : (metrics.sts || 0);
        const mdpDaily = typeof metrics.mdp === 'string' ? parseFloat(metrics.mdp) : (metrics.mdp || 0);
        const adpDaily = typeof metrics.adp === 'string' ? parseFloat(metrics.adp) : (metrics.adp || 0);
        const totalDebt = typeof metrics.total_debt === 'string' ? parseFloat(metrics.total_debt) : (metrics.total_debt || 0);
        const totalDebit = typeof metrics.total_debit_balance === 'string' ? parseFloat(metrics.total_debit_balance) : (metrics.total_debit_balance || 0);
        console.log('📊 Parsed metrics:', { stsToday, mdpDaily, adpDaily, totalDebt, totalDebit });

        // 4. Map real loans to AppState format
        setStatus('Загрузка кредитов...');
        setProgress(70);
        const realLoans = appData.loans?.map((loan: any, index: number) => ({
          id: loan.id,
          bank: loan.bank,
          type: loan.type,
          balance: parseFloat(loan.balance) || 0,
          rate: loan.rate || 0,
          monthly_payment: loan.monthly_payment || 0,
          maturity_date: loan.maturity_date || '2025-12-31',
          priority: loan.priority || index + 1,
        })) || [];

        // 5. Use Cards from Dashboard Metrics (Consistent with backend filtering)
        setStatus('Обработка карт...');
        const realCards = metrics.cards?.map((c: any) => ({
          id: c.id,
          bank: c.bank,
          mask: c.name, // Use name as mask/description
          balance: c.balance,
          holds: 0,
          type: c.type as 'debit' | 'credit',
        })) || [];

        // Calculate dynamic values
        const partialAppStateForCalc = {
          loans: { summary: { mandatory_daily_payment: mdpDaily, total_outstanding: totalDebt } },
          sts: { today: { amount: stsToday, spent: metrics.spent_today || 0 } },
          balances: { total_debit: totalDebit }
        } as AppState;

        const healthScore = calculateHealthScore(partialAppStateForCalc);
        const healthStatus = getHealthStatus(healthScore);
        const healthReasons = generateHealthReasons(partialAppStateForCalc);
        const stsImpact = calculateSTSImpact(mdpDaily);

        const appState: AppState = {
          mode,
          user: {
            id: onboardingData.user_profile.user_id,
            name: onboardingData.user_profile.display_name,
            consents: onboardingData.consents.reduce((acc, consent) => {
              acc[consent.bank_id] = consent.consent_id;
              return acc;
            }, {} as Record<string, string>),
            banks_status: metrics.banks_status || {},
          },
          onboarding: {
            completed: true,
            strategy: onboardingData.goal?.risk_mode === 'fast' ? 'агрессивно' :
              onboardingData.goal?.risk_mode === 'balanced' ? 'сбалансировано' : 'консервативно',
          },
          health: {
            score: healthScore,
            status: healthStatus,
            reasons: healthReasons,
            next_action: mode === 'loans' ? {
              type: 'pay_mdp',
              label: 'Внести обязательный платёж',
            } : {
              type: 'pay_sdp',
              label: 'Пополнить накопления',
            },
          },
          sts: {
            today: {
              amount: stsToday,
              spent: metrics.spent_today || 0,
            },
            tomorrow: {
              impact: stsImpact,
            },
          },
          loans: {
            summary: {
              total_outstanding: totalDebt,
              mandatory_daily_payment: Math.round(mdpDaily), // Already daily from backend
              additional_daily_payment: Math.round(adpDaily), // Already daily from backend
            },
            items: realLoans,
          },
          goals: {
            summary: {
              total_saved: mode === 'deposits' ? 50000 : 0,
              daily_payment: mode === 'deposits' ? 500 : 0,
              target: onboardingData.goal?.save?.amount_target || 150000,
              target_date: '2025-12-31',
            },
          },
          deposits: {
            current: mode === 'deposits' ? {
              id: 'deposit-1',
              bank: onboardingData.linked_banks[0]?.name || 'Банк А',
              product: 'Накопительный счёт',
              rate: 8.5,
              balance: 50000,
              capitalization: true,
              withdrawable: true,
              maturity_date: '2025-12-31',
            } : null,
            goal: {
              target_amount: onboardingData.goal?.save?.amount_target || 150000,
              horizon_months: onboardingData.goal?.save?.horizon === 'long' ? 24 : 12,
              liquidity: 'full',
            },
          },
          balances: {
            total: totalDebit + (mode === 'deposits' ? 50000 : 0),
            total_debit: totalDebit,
          },
          cards: realCards,
          analytics: {
            debtsByBank: metrics.debts_by_bank?.map((item: any) => ({
              bank: getBankLabel(item.bank),
              total: item.total,
              products: item.products,
            })) || [],
            balancesByBank: metrics.balances_by_bank?.map((item: any) => ({
              bank: getBankLabel(item.bank),
              total: item.total,
              accounts: item.accounts,
            })) || [],
            refinance: metrics.refinance,
          },
          applications: {},
          timeline: [
            {
              date: '2024-11-15',
              type: 'loan_payment',
              title: 'Платёж по кредиту',
              amount: 15000,
              can_defer: 5,
            },
          ],
          offers: {
            refi: metrics.refinance
              ? [
                {
                  id: 'refi-auto',
                  bank: 'Оптимизация',
                  rate: metrics.refinance.proposedRate,
                  term_months: Math.round(metrics.refinance.termMonths),
                  monthly_payment: metrics.refinance.newMonthly,
                  commission: 0,
                  savings: metrics.refinance.savingsTotal,
                  breakeven_months: Math.max(
                    1,
                    Math.round(
                      metrics.refinance.currentMonthly > 0
                        ? metrics.refinance.currentMonthly / Math.max(1, metrics.refinance.currentMonthly - metrics.refinance.newMonthly)
                        : 3
                    )
                  ),
                },
              ]
              : [],
            deposits: [],
          },
        };

        setProgress(100);
        setStatus('Готово!');
        await new Promise(resolve => setTimeout(resolve, 500));
        onComplete(appState);

      } catch (error) {
        console.error('Error loading data:', error);
        setStatus('Ошибка загрузки данных');
      }
    };

    loadData();
  }, [onboardingData, onComplete]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-purple-100/50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-purple-200/50">
          {/* Icon */}
          <div className="w-20 h-20 mx-auto mb-6 bg-purple-100 rounded-2xl flex items-center justify-center">
            <svg className="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>

          {/* Title */}
          <h2 className="text-center text-xl font-semibold text-gray-900 mb-2">
            Настраиваем ваш профиль
          </h2>
          <p className="text-center text-sm text-gray-600 mb-8">
            {status}
          </p>

          {/* Progress bar */}
          <div className="relative w-full h-2 bg-purple-100 rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Progress text */}
          <div className="mt-4 text-center">
            <span className="text-sm font-medium text-purple-600">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
