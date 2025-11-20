import { useState } from 'react';
import { SplashScreen } from './screens/SplashScreen';
import { OnboardingScreen, OnboardingData } from './screens/OnboardingScreen';
import { LoadingCalcScreen } from './screens/LoadingCalcScreen';
import { HomeScreen } from './screens/HomeScreen';
import { STSDetailScreen } from './screens/STSDetailScreen';
import { LoansDetailScreen } from './screens/LoansDetailScreen';
import { DepositsDetailScreen } from './screens/DepositsDetailScreen';
import { RefinanceScreen } from './screens/RefinanceScreen';
import { CardsScreen } from './screens/CardsScreen';
import { BottomNav } from './components/BottomNav';
import { PaymentSheet } from './components/PaymentSheet';
import { type AppState } from './data/mockAppState';
import { Toaster, toast } from 'sonner@2.0.3';

type AppFlow = 'splash' | 'onboarding' | 'loading' | 'app';
type Screen = 'home' | 'sts' | 'loans' | 'deposits' | 'refinance' | 'cards' | 'profile' | 'health';
type PaymentType = 'mdp' | 'adp' | 'sdp' | null;

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

  const handlePaymentConfirm = (amount: number) => {
    if (!appState) return;

    // Simulate payment processing
    setPaymentType(null);
    
    // Recalculate STS and balances
    setAppState((prev) => {
      if (!prev) return prev;
      const newState = { ...prev };
      
      if (paymentType === 'mdp' || paymentType === 'adp') {
        // Update loans
        newState.loans.summary.total_outstanding -= amount;
        // Increase STS
        newState.sts.today.amount += amount * 0.1;
      } else if (paymentType === 'sdp') {
        // Update deposits
        newState.goals.summary.total_saved += amount;
        if (newState.deposits.current) {
          newState.deposits.current.balance += amount;
        }
        // Decrease STS
        newState.sts.today.amount -= amount;
      }
      
      return newState;
    });
    
    toast.success('Платёж успешно выполнен', {
      description: `STS пересчитан с учётом нового платежа`,
    });
  };

  const getDefaultPaymentAmount = () => {
    if (!appState) return 0;
    if (paymentType === 'mdp') return 1200;
    if (paymentType === 'adp') return 540;
    if (paymentType === 'sdp') return appState.goals.summary.daily_payment;
    return 0;
  };

  // Render splash screen
  if (flow === 'splash') {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  // Render onboarding
  if (flow === 'onboarding') {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
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

  // Profile screen
  if (currentScreen === 'profile') {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="max-w-lg mx-auto">
          <div className="bg-white border-b border-gray-200 px-4 py-4">
            <h1 className="text-xl font-semibold text-gray-900">Профиль</h1>
          </div>
          <div className="p-4">
            <div className="bg-white rounded-2xl p-8 text-center border border-gray-200">
              <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{appState.user.name}</h2>
              <p className="text-sm text-gray-600 mb-6">{appState.user.id}</p>
              
              <div className="space-y-3 text-left">
                <button className="w-full p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-left">
                  <div className="font-medium text-gray-900">Настройки</div>
                  <div className="text-xs text-gray-500 mt-1">Управление аккаунтом</div>
                </button>
                <button className="w-full p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-left">
                  <div className="font-medium text-gray-900">Подключенные банки</div>
                  <div className="text-xs text-gray-500 mt-1">{Object.keys(appState.user.consents).length} банков</div>
                </button>
                <button className="w-full p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-left">
                  <div className="font-medium text-gray-900">Стратегия</div>
                  <div className="text-xs text-gray-500 mt-1">{appState.onboarding.strategy}</div>
                </button>
              </div>
            </div>
          </div>
        </div>
        <BottomNav currentScreen={currentScreen} onNavigate={handleNavigate} mode={appState.mode} />
      </div>
    );
  }

  // Health detail screen
  if (currentScreen === 'health') {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="max-w-lg mx-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-4 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleNavigate('home')}
                className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-gray-900">Финансовое здоровье</h1>
            </div>
          </div>
          <div className="p-4 space-y-6">
            <div className="bg-white rounded-2xl p-6 text-center border border-gray-200">
              <div className="text-sm text-gray-500 mb-3">Ваш показатель</div>
              <div className="text-5xl font-semibold text-purple-600 mb-4">
                {appState.health.score}
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-50">
                <span className="text-sm font-medium text-purple-700">{appState.health.status}</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <h2 className="font-semibold text-gray-900 mb-3">Причины изменения</h2>
              <div className="space-y-2">
                {appState.health.reasons.map((reason, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                    <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-2" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>

            {appState.health.next_action && (
              <div className="bg-purple-50 rounded-2xl p-5 border border-purple-200/50">
                <div className="font-semibold text-gray-900 mb-2">Рекомендуемое действие</div>
                <div className="text-sm text-gray-700 mb-4">{appState.health.next_action.label}</div>
                <button
                  onClick={() => {
                    if (appState.health.next_action?.type === 'refinance') {
                      handleNavigate('refinance');
                    } else if (appState.health.next_action?.type.startsWith('pay_')) {
                      const type = appState.health.next_action.type.replace('pay_', '') as 'mdp' | 'adp' | 'sdp';
                      handlePayment(type);
                    }
                  }}
                  className="w-full py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
                >
                  Выполнить
                </button>
              </div>
            )}
          </div>
        </div>
        <BottomNav currentScreen={currentScreen} onNavigate={handleNavigate} mode={appState.mode} />
      </div>
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
      {/* Home is NOT in BottomNav - it's the first screen, not a tab */}
      {/* STS is accessible from Home, not a separate tab */}
      {['loans', 'deposits', 'refinance', 'profile'].includes(currentScreen) && (
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
          currentSTS={1700}
          onClose={() => setPaymentType(null)}
          onConfirm={handlePaymentConfirm}
        />
      )}

      {/* Toast notifications */}
      <Toaster position="top-center" richColors />
    </>
  );
}
