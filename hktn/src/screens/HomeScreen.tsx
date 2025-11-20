import { useEffect, useState, useRef } from 'react';
import { HealthWidget } from '../components/widgets/HealthWidget';
import { STSWidget } from '../components/widgets/STSWidget';
import { LoansDepositsWidget } from '../components/widgets/LoansDepositsWidget';
import { DebitCardsWidget } from '../components/widgets/DebitCardsWidget';
import { getDashboard, type DashboardResponse } from '../utils/api';
import type { AppState } from '../data/mockAppState';

interface HomeScreenProps {
  appState: AppState;
  onNavigate: (screen: string) => void;
  onPayment: (type: 'mdp' | 'adp' | 'sdp') => void;
  onDashboardUpdate?: (dashboard: DashboardResponse) => void;
}

export function HomeScreen({ appState, onNavigate, onPayment, onDashboardUpdate }: HomeScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  
  // Store callback in ref to avoid dependency issues
  const onDashboardUpdateRef = useRef(onDashboardUpdate);
  useEffect(() => {
    onDashboardUpdateRef.current = onDashboardUpdate;
  }, [onDashboardUpdate]);
  
  const hasConsents = Object.keys(appState.user.consents).length > 0;

  useEffect(() => {
    if (!hasConsents) {
      setLoading(false);
      return;
    }

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getDashboard(appState.user.id);
        setDashboardData(data);
        if (onDashboardUpdateRef.current) {
          onDashboardUpdateRef.current(data);
        }
      } catch (err) {
        console.error('Failed to load dashboard:', err);
        setError(err instanceof Error ? err.message : 'Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [appState.user.id, hasConsents]);

  if (!hasConsents) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center border border-gray-200">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Подключите банки</h2>
          <p className="text-sm text-gray-600 mb-6">
            Для начала работы подключите свои банковские счета через безопасное соединение
          </p>
          <button className="w-full py-3 px-6 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors">
            Подключить банки
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-[var(--color-text-secondary)]">Загрузка данных...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center border border-red-200">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Ошибка загрузки</h2>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full py-3 px-6 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
          >
            Обновить
          </button>
        </div>
      </div>
    );
  }

  // Use dashboard data if available, otherwise fallback to appState
  const effectiveMode = dashboardData?.user_mode || appState.mode;
  const effectiveSTS = dashboardData ? {
    today: {
      amount: dashboardData.sts_today.amount,
      spent: dashboardData.sts_today.spent,
    },
    tomorrow: {
      impact: dashboardData.sts_today.tomorrow.impact,
    },
  } : appState.sts;
  
  const effectiveLoans = dashboardData ? {
    summary: dashboardData.loan_summary,
    items: appState.loans.items, // Keep existing items for now
  } : appState.loans;
  
  const effectiveGoals = dashboardData ? {
    summary: dashboardData.savings_summary,
  } : appState.goals;
  
  const effectiveBalances = dashboardData ? {
    total: dashboardData.total_debit_cards_balance,
    total_debit: dashboardData.total_debit_cards_balance,
  } : appState.balances;
  
  const effectiveHealth = dashboardData ? {
    score: dashboardData.health_score.value,
    status: dashboardData.health_score.status === 'excellent' ? 'спокойно' : 
            dashboardData.health_score.status === 'good' ? 'спокойно' :
            dashboardData.health_score.status === 'fair' ? 'внимание' : 'нужен план',
    reasons: dashboardData.health_score.reasons || [],
    next_action: appState.health.next_action,
  } : appState.health;

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] pb-0">
      {/* Home doesn't have BottomNav - it's the first screen, not a tab */}
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-[var(--color-bg-primary)] border-b border-[var(--color-stroke-divider)] px-4 py-4">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Привет, {appState.user.name.split(' ')[0]}!</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Ваши финансы под контролем</p>
        </div>

        {/* Widgets */}
        <div className="p-4 space-y-4 pb-24">
          {/* Health Widget - navigates to health detail screen */}
          <HealthWidget
            health={effectiveHealth}
            onTap={() => onNavigate('health')}
          />

          {/* STS Widget - navigates to STS detail screen (not a tab) */}
          <STSWidget
            sts={effectiveSTS}
            onTap={() => onNavigate('sts')}
          />

          {/* Loans/Deposits Widget - navigates to Loans or Deposits tab */}
          <LoansDepositsWidget
            mode={effectiveMode}
            loans={effectiveLoans}
            goals={effectiveGoals}
            onTap={() => onNavigate(effectiveMode === 'loans' ? 'loans' : 'deposits')}
            onPayMDP={() => onPayment('mdp')}
            onPayADP={() => onPayment('adp')}
            onPaySDP={() => onPayment('sdp')}
          />

          {/* Debit Cards Widget - navigates to cards detail screen */}
          <DebitCardsWidget
            balances={effectiveBalances}
            cards={appState.cards}
            onTap={() => onNavigate('cards')}
          />
        </div>
      </div>
    </div>
  );
}
