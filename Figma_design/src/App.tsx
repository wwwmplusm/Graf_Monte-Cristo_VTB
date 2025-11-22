import { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { SplashScreen } from './screens/SplashScreen';
import { OnboardingData } from './screens/OnboardingScreen';
import { DemoUserSelectionScreen } from './screens/DemoUserSelectionScreen';
import { LoadingCalcScreen } from './screens/LoadingCalcScreen';
import { HomeScreen } from './screens/HomeScreen';
import { STSDetailScreen } from './screens/STSDetailScreen';
import { LoansDetailScreen } from './screens/LoansDetailScreen';
import { DepositsDetailScreen } from './screens/DepositsDetailScreen';
import { RefinanceScreen } from './screens/RefinanceScreen';
import { CardsScreen } from './screens/CardsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { BottomNav } from './components/BottomNav';
import { PaymentSheet, PaymentType } from './components/PaymentSheet';
import { type AppState } from './data/mockAppState';
import { staticBackend } from './services/staticBackend';
import { calculateSTSImpact } from './utils/calculations';
import { getBankLabel } from './domain/metricsEngine';

type AppFlow = 'splash' | 'onboarding' | 'loading' | 'app';
type Screen = 'home' | 'sts' | 'loans' | 'deposits' | 'refinance' | 'cards' | 'profile';

export default function App() {
  const [flow, setFlow] = useState<AppFlow>('splash');
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [paymentType, setPaymentType] = useState<PaymentType>(null);

  // Flow handlers
  const handleSplashComplete = () => {
    setFlow('onboarding');
  };

  const handleOnboardingComplete = (data: OnboardingData) => {
    setOnboardingData(data);
    setFlow('loading');
  };

  const handleLoadingComplete = (state: AppState) => {
    setAppState(state);
    setFlow('app');
  };

  // Navigation handlers
  const handleNavigate = (screen: string) => {
    setCurrentScreen(screen as Screen);
  };

  const handlePayment = (type: 'mdp' | 'adp' | 'sdp') => {
    setPaymentType(type);
  };

  const handlePaymentConfirm = async (amount: number) => {
    if (!appState || !paymentType) return;

    try {
      const response = await staticBackend.executePayment(appState.user.id, {
        payment_type: paymentType,
        amount,
        target_loan_id: appState.loans.items[0]?.id,
      });

      setAppState(prev => {
        if (!prev) return prev;
        const metrics = response.metrics;
        const updatedLoans = response.loans?.map((loan: any, index: number) => ({
          id: loan.id,
          bank: loan.bank,
          type: loan.type,
          balance: loan.balance,
          rate: loan.rate,
          monthly_payment: loan.monthly_payment,
          maturity_date: loan.maturity_date,
          priority: loan.priority || index + 1,
        })) || prev.loans.items;

        const analytics = {
          debtsByBank: metrics.debts_by_bank
            ? metrics.debts_by_bank.map(item => ({
              bank: getBankLabel(item.bank),
              total: item.total,
              products: item.products,
            }))
            : prev.analytics?.debtsByBank || [],
          balancesByBank: metrics.balances_by_bank
            ? metrics.balances_by_bank.map(item => ({
              bank: getBankLabel(item.bank),
              total: item.total,
              accounts: item.accounts,
            }))
            : prev.analytics?.balancesByBank || [],
          refinance: metrics.refinance || prev.analytics?.refinance,
        };

        return {
          ...prev,
          sts: {
            ...prev.sts,
            today: {
              amount: metrics.sts,
              spent: metrics.spent_today || prev.sts.today.spent,
            },
            tomorrow: {
              impact: calculateSTSImpact(metrics.mdp),
            },
          },
          loans: {
            summary: {
              total_outstanding: metrics.total_debt,
              mandatory_daily_payment: Math.round(metrics.mdp),
              additional_daily_payment: Math.round(metrics.adp),
            },
            items: updatedLoans,
          },
          balances: {
            total: metrics.total_debit_balance,
            total_debit: metrics.total_debit_balance,
          },
          cards:
            response.cards?.map(c => ({
              id: c.id,
              bank: c.bank,
              mask: c.name,
              balance: c.balance,
              holds: 0,
              type: c.type as 'debit' | 'credit',
            })) || prev.cards,
          analytics,
          offers: {
            ...prev.offers,
            refi:
              metrics.refinance
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
                          ? metrics.refinance.currentMonthly /
                          Math.max(1, metrics.refinance.currentMonthly - metrics.refinance.newMonthly)
                          : 3
                      )
                    ),
                  },
                ]
                : prev.offers.refi,
          },
        };
      });

      setPaymentType(null);
      toast.success('Платёж успешно выполнен', {
        description: `STS пересчитан с учётомного платежа`,
      });
    } catch (error) {
      console.error('Payment failed:', error);
      toast.error('Ошибка выполнения платежа', {
        description: error instanceof Error ? error.message : 'Попробуйте снова',
      });
    }
  };

  const getDefaultPaymentAmount = () => {
    if (!appState) return 0;
    if (paymentType === 'mdp') return appState.loans.summary.mandatory_daily_payment;
    if (paymentType === 'adp') return appState.loans.summary.additional_daily_payment;
    if (paymentType === 'sdp') return appState.goals.summary.daily_payment;
    return 0;
  };

  // Render splash screen
  if (flow === 'splash') {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  // Render onboarding (Replaced by Demo User Selection)
  if (flow === 'onboarding') {
    return <DemoUserSelectionScreen onComplete={handleOnboardingComplete} />;
  }

  // Render loading/calculation screen
  if (flow === 'loading' && onboardingData) {
    return (
      <LoadingCalcScreen
        onboardingData={onboardingData}
        onComplete={handleLoadingComplete}
      />
    );
  }

  // Main app - require appState
  if (!appState) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    );
  }

  const handleBankToggle = async (bankId: string, enabled: boolean) => {
    if (!appState) return;

    try {
      const response = await staticBackend.toggleBank(appState.user.id, bankId, enabled);

      // Update appState with new metrics and bank status
      setAppState(prev => {
        if (!prev) return prev;
        const data = response.data;
        const metrics = data.metrics;
        return {
          ...prev,
          user: {
            ...prev.user,
            banks_status: {
              ...prev.user.banks_status,
              [bankId]: {
                ...prev.user.banks_status[bankId],
                enabled: enabled,
              },
            },
          },
          sts: {
            ...prev.sts,
            today: {
              amount: metrics.sts,
              spent: metrics.spent_today || prev.sts.today.spent,
            },
            tomorrow: {
              impact: calculateSTSImpact(metrics.mdp),
            },
          },
          balances: {
            total: metrics.total_debit_balance,
            total_debit: metrics.total_debit_balance,
          },
          loans: {
            summary: {
              total_outstanding: metrics.total_debt,
              mandatory_daily_payment: Math.round(metrics.mdp),
              additional_daily_payment: Math.round(metrics.adp),
            },
            items:
              data.loans?.map((loan: any, index: number) => ({
                id: loan.id,
                bank: loan.bank,
                type: loan.type,
                balance: loan.balance,
                rate: loan.rate,
                monthly_payment: loan.monthly_payment,
                maturity_date: loan.maturity_date,
                priority: loan.priority || index + 1,
              })) || prev.loans.items,
          },
          analytics: {
            debtsByBank: metrics.debts_by_bank
              ? metrics.debts_by_bank.map(item => ({
                bank: getBankLabel(item.bank),
                total: item.total,
                products: item.products,
              }))
              : prev.analytics?.debtsByBank || [],
            balancesByBank: metrics.balances_by_bank
              ? metrics.balances_by_bank.map(item => ({
                bank: getBankLabel(item.bank),
                total: item.total,
                accounts: item.accounts,
              }))
              : prev.analytics?.balancesByBank || [],
            refinance: metrics.refinance || prev.analytics?.refinance,
          },
          offers: {
            ...prev.offers,
            refi:
              metrics.refinance
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
                          ? metrics.refinance.currentMonthly /
                          Math.max(1, metrics.refinance.currentMonthly - metrics.refinance.newMonthly)
                          : 3
                      )
                    ),
                  },
                ]
                : prev.offers.refi,
          },
        };
      });

      toast.success(`Банк ${enabled ? 'включен' : 'выключен'}`, {
        description: 'Метрики пересчитаны',
      });
    } catch (error) {
      console.error('Failed to toggle bank:', error);
      toast.error('Ошибка переключения банка');
    }
  };

  // Profile screen
  if (currentScreen === 'profile') {
    return (
      <ProfileScreen
        appState={appState}
        onBack={() => handleNavigate('home')}
        onToggleBank={handleBankToggle}
      />
    );
  }

  // Main app screens
  return (
    <>
      {currentScreen === 'home' && (
        <HomeScreen
          appState={appState}
          onNavigate={handleNavigate}
          onPayment={handlePayment}
        />
      )}

      {currentScreen === 'sts' && (
        <STSDetailScreen
          appState={appState}
          onBack={() => handleNavigate('home')}
          onPayment={handlePayment}
        />
      )}

      {currentScreen === 'loans' && (
        <LoansDetailScreen
          appState={appState}
          onBack={() => handleNavigate('home')}
          onPayment={handlePayment}
        />
      )}

      {currentScreen === 'deposits' && (
        <DepositsDetailScreen
          appState={appState}
          onBack={() => handleNavigate('home')}
          onPayment={handlePayment}
          onNavigate={handleNavigate}
        />
      )}

      {currentScreen === 'refinance' && (
        <RefinanceScreen
          appState={appState}
          onBack={() => handleNavigate('home')}
        />
      )}

      {currentScreen === 'cards' && (
        <CardsScreen
          appState={appState}
          onBack={() => handleNavigate('home')}
        />
      )}

      {/* Bottom Navigation */}
      {['home', 'sts', 'loans', 'deposits', 'refinance', 'profile'].includes(currentScreen) && (
        <BottomNav
          currentScreen={currentScreen}
          onNavigate={handleNavigate}
          mode={appState.mode}
        />
      )}

      {/* Payment Sheet Modal */}
      {paymentType && (
        <PaymentSheet
          type={paymentType}
          defaultAmount={getDefaultPaymentAmount()}
          currentSTS={appState.sts.today.amount - appState.sts.today.spent}
          onClose={() => setPaymentType(null)}
          onConfirm={handlePaymentConfirm}
        />
      )}

      {/* Toast notifications */}
      <Toaster position="top-center" richColors />
    </>
  );
}
