import { ArrowLeft, TrendingDown, Check, AlertCircle, Phone } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency } from '../utils/formatters';
import type { AppState } from '../data/mockAppState';

interface RefinanceScreenProps {
  appState: AppState;
  onBack: () => void;
}

export function RefinanceScreen({ appState, onBack }: RefinanceScreenProps) {
  const [step, setStep] = useState<'list' | 'best-offer' | 'application' | 'result'>('list');
  const [applicationStatus, setApplicationStatus] = useState<'pending' | 'approved' | 'declined' | null>(null);
  const [phone, setPhone] = useState('');

  const isLoansMode = appState.mode === 'loans';
  const offers = isLoansMode ? appState.offers.refi : appState.offers.deposits;
  const refiInsight = appState.analytics?.refinance;
  const bestOffer = offers && offers.length > 0 ? offers[0] : refiInsight ? {
    id: 'refi-auto',
    bank: 'Оптимизация',
    rate: refiInsight.proposedRate,
    term_months: Math.round(refiInsight.termMonths),
    monthly_payment: refiInsight.newMonthly,
    commission: 0,
    savings: refiInsight.savingsTotal,
    breakeven_months: Math.max(
      1,
      Math.round(
        refiInsight.currentMonthly > 0
          ? refiInsight.currentMonthly / Math.max(1, refiInsight.currentMonthly - refiInsight.newMonthly)
          : 3
      )
    ),
  } as any : null;

  const handleOptimize = () => {
    setStep('best-offer');
  };

  const handleSelectOffer = () => {
    setStep('application');
  };

  const handleSubmitApplication = () => {
    if (!phone) return;
    setApplicationStatus('pending');
    setStep('result');
    
    // Simulate API call
    setTimeout(() => {
      setApplicationStatus(Math.random() > 0.3 ? 'approved' : 'declined');
    }, 1500);
  };

  const handleBackToList = () => {
    setStep('list');
    setApplicationStatus(null);
    setPhone('');
  };

  // Result screen
  if (step === 'result') {
    if (applicationStatus === 'pending') {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center border border-gray-200">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Отправка заявки</h2>
            <p className="text-sm text-gray-600">
              Ожидаем ответ от банка...
            </p>
          </div>
        </div>
      );
    }

    if (applicationStatus === 'approved') {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center border border-gray-200">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Банк одобрил!</h2>
            <p className="text-sm text-gray-600 mb-6">
              {isLoansMode 
                ? 'Мы перевели ваши долги на новый продукт.'
                : 'Мы перевели ваши сбережения на новый продукт.'
              }
            </p>
            <button
              onClick={onBack}
              className="w-full py-3 px-6 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
            >
              Вернуться на главную
            </button>
          </div>
        </div>
      );
    }

    if (applicationStatus === 'declined') {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center border border-gray-200">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Банк не одобрил заявку</h2>
            <p className="text-sm text-gray-600 mb-6">
              Попробуйте позже
            </p>
            <button
              onClick={handleBackToList}
              className="w-full py-3 px-6 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
            >
              Вернуться к офферам
            </button>
          </div>
        </div>
      );
    }
  }

  // Application form
  if (step === 'application' && bestOffer) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="max-w-lg mx-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-4 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep('best-offer')}
                className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-semibold text-gray-900">Заявка</h1>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className="bg-white rounded-2xl p-6 border border-gray-200">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Телефон для связи банка
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 (___) ___-__-__"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              <button
                onClick={handleSubmitApplication}
                disabled={!phone}
                className="w-full py-3 px-6 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Отправить заявку
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Best offer screen
  if (step === 'best-offer' && bestOffer) {
    const isLoan = 'savings' in bestOffer;
    
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="max-w-lg mx-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-4 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBackToList}
                className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-semibold text-gray-900">Лучший вариант</h1>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {refiInsight && (
              <div className="bg-gradient-to-br from-purple-50 to-purple-100/60 rounded-2xl p-5 border border-purple-200/60">
                <div className="text-sm text-purple-700 mb-1">Ваши кредиты</div>
                <div className="text-2xl font-semibold text-purple-900">
                  {formatCurrency(refiInsight.currentDebt)}
                </div>
                <div className="text-xs text-purple-700">
                  {refiInsight.loansCount} кредит(а) · ср. ставка {refiInsight.weightedRate.toFixed(1)}%
                </div>
                {refiInsight.banks.length > 0 && (
                  <div className="text-xs text-gray-500 mt-1">
                    {refiInsight.banks.join(' • ')}
                  </div>
                )}
                <div className="mt-3 text-sm text-gray-700">
                  Новый кредит на {formatCurrency(refiInsight.currentDebt)} под {refiInsight.proposedRate.toFixed(1)}%,
                  платёж {formatCurrency(refiInsight.newMonthly)} в мес.
                </div>
                <div className="mt-2 text-sm font-semibold text-green-700">
                  Экономия {formatCurrency(refiInsight.savingsTotal)} за {Math.round(refiInsight.termMonths)} мес.
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl p-6 border border-gray-200">
              <div className="text-sm text-gray-500 mb-2">Текущие условия</div>
              <div className="mb-4 pb-4 border-b border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Ставка</span>
                  <span className="font-semibold text-gray-900">
                    {isLoansMode ? '12.9%' : '8.0%'}
                  </span>
                </div>
                {isLoansMode && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Платёж в месяц</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(15000)}</span>
                  </div>
                )}
              </div>

              <div className="text-sm text-purple-600 mb-2">Новые условия</div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Ставка</span>
                  <span className="text-2xl font-semibold text-purple-600">
                    {isLoansMode 
                      ? (bestOffer as any).rate + '%'
                      : (bestOffer as any).rate + '%'
                    }
                  </span>
                </div>
                {isLoansMode && (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Платёж в месяц</span>
                      <span className="font-semibold text-gray-900">
                        {formatCurrency((bestOffer as any).monthly_payment)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-green-600 mt-3">
                      <TrendingDown className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        Экономия {formatCurrency((bestOffer as any).savings)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={handleSelectOffer}
              className="w-full py-4 px-6 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-lg"
            >
              Выбрать этот вариант
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main list screen with optimize button
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-lg mx-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-semibold text-gray-900">
              {isLoansMode ? 'Рефинансирование' : 'Вклады'}
            </h1>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Optimize button */}
          <button
            onClick={handleOptimize}
            className="w-full py-4 px-6 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-lg"
          >
            {isLoansMode ? 'Оптимизировать кредиты' : 'Оптимизировать сбережения'}
          </button>

          {/* Current products list */}
          <div className="space-y-3">
            {isLoansMode ? (
              appState.loans.items.map((loan) => (
                <div
                  key={loan.id}
                  className="bg-white rounded-2xl p-5 border border-gray-200"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-gray-900 mb-1">{loan.bank}</div>
                      <div className="text-xs text-gray-500">{loan.type}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-gray-900">
                        {loan.rate}%
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Остаток</div>
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(loan.balance)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Ежемесячно</div>
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(loan.monthly_payment)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              // Deposits list - show current deposit if it exists
              appState.deposits.current ? (
                <div
                  key={appState.deposits.current.id}
                  className="bg-white rounded-2xl p-5 border border-gray-200"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-gray-900 mb-1">{appState.deposits.current.bank}</div>
                      <div className="text-xs text-gray-500">{appState.deposits.current.product}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-green-600">
                        {appState.deposits.current.rate}%
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Баланс</div>
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(appState.deposits.current.balance)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Вывод</div>
                      <div className="font-semibold text-gray-900">
                        {appState.deposits.current.withdrawable ? 'Да' : 'Нет'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-6 border border-gray-200 text-center">
                  <p className="text-gray-500">Нет активных вкладов</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
