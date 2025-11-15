import { useEffect, useState } from 'react';
import { OnboardingData } from './OnboardingScreen';
import type { AppState } from '../data/mockAppState';

interface LoadingCalcScreenProps {
  onboardingData: OnboardingData;
  onComplete: (appState: AppState) => void;
}

export function LoadingCalcScreen({ onboardingData, onComplete }: LoadingCalcScreenProps) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Подключение к банкам...');

  useEffect(() => {
    const loadData = async () => {
      // Simulate loading steps
      const steps = [
        { progress: 20, status: 'Подключение к банкам...', delay: 500 },
        { progress: 40, status: 'Загрузка счетов...', delay: 600 },
        { progress: 60, status: 'Анализ транзакций...', delay: 700 },
        { progress: 80, status: 'Расчёт метрик...', delay: 600 },
        { progress: 100, status: 'Готово!', delay: 400 },
      ];

      for (const step of steps) {
        await new Promise(resolve => setTimeout(resolve, step.delay));
        setProgress(step.progress);
        setStatus(step.status);
      }

      // Generate app_state from onboarding data
      const mode = onboardingData.goal?.type === 'save_money' ? 'deposits' : 'loans';
      
      // Mock data generation based on onboarding
      const mockLoans = [
        {
          id: 'loan-1',
          bank: onboardingData.linked_banks[0]?.name || 'Банк А',
          type: 'Потребительский кредит',
          balance: 350000,
          rate: 18.5,
          monthly_payment: 15000,
          maturity_date: '2026-03-15',
          priority: 1,
        },
        {
          id: 'loan-2',
          bank: onboardingData.linked_banks[1]?.name || 'Банк Б',
          type: 'Кредитная карта',
          balance: 125000,
          rate: 24.9,
          monthly_payment: 8000,
          maturity_date: '2025-09-20',
          priority: 2,
        },
      ];

      const mockCards = [
        {
          id: 'card-1',
          bank: onboardingData.linked_banks[0]?.name || 'Банк А',
          mask: '•• 4532',
          balance: 45000,
          holds: 0,
          type: 'debit' as const,
        },
        {
          id: 'card-2',
          bank: onboardingData.linked_banks[1]?.name || 'Банк Б',
          mask: '•• 8821',
          balance: 12000,
          holds: 0,
          type: 'debit' as const,
        },
      ];

      const totalDebit = mockCards.reduce((sum, card) => sum + card.balance, 0);
      const totalOutstanding = mockLoans.reduce((sum, loan) => sum + loan.balance, 0);
      const mandatoryPayment = mockLoans.reduce((sum, loan) => sum + loan.monthly_payment * 0.03, 0);
      
      const riskMultiplier = onboardingData.goal?.risk_mode === 'fast' ? 1.4 : 
                             onboardingData.goal?.risk_mode === 'balanced' ? 1.2 : 1.05;
      const additionalPayment = mandatoryPayment * (riskMultiplier - 1);

      const stsToday = totalDebit - mandatoryPayment - additionalPayment;

      const appState: AppState = {
        mode,
        user: {
          id: onboardingData.user_profile.user_id,
          name: onboardingData.user_profile.display_name,
          consents: onboardingData.consents.reduce((acc, consent) => {
            acc[consent.bank_id] = consent.consent_id;
            return acc;
          }, {} as Record<string, string>),
        },
        onboarding: {
          completed: true,
          strategy: onboardingData.goal?.risk_mode === 'fast' ? 'агрессивно' :
                   onboardingData.goal?.risk_mode === 'balanced' ? 'сбалансировано' : 'консервативно',
        },
        health: {
          score: 72,
          status: 'спокойно',
          reasons: [
            'Долговая нагрузка в норме',
            'Регулярные платежи',
            'Есть резервы на счетах',
          ],
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
            amount: Math.max(stsToday, 5000),
            spent: 0,
          },
          tomorrow: {
            impact: 'При оплате MDP: +500 ₽ к STS завтра',
          },
        },
        loans: {
          summary: {
            total_outstanding: totalOutstanding,
            mandatory_daily_payment: Math.round(mandatoryPayment),
            additional_daily_payment: Math.round(additionalPayment),
          },
          items: mockLoans,
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
        cards: mockCards,
        timeline: [
          {
            date: '2024-11-15',
            type: 'loan_payment',
            title: 'Платёж по кредиту',
            amount: 15000,
            can_defer: 5,
          },
          {
            date: '2024-11-20',
            type: 'loan_payment',
            title: 'Платёж по карте',
            amount: 8000,
            can_defer: 3,
          },
        ],
        offers: {
          refi: [
            {
              id: 'refi-1',
              bank: 'Банк Рефинансирования',
              rate: 14.9,
              term_months: 36,
              monthly_payment: 12500,
              commission: 2500,
              savings: 85000,
              breakeven_months: 3,
            },
          ],
          deposits: [],
        },
      };

      // Wait a bit to show "Готово!" message
      await new Promise(resolve => setTimeout(resolve, 500));
      
      onComplete(appState);
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
