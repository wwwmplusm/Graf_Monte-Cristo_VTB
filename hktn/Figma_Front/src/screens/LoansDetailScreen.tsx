import { ArrowLeft, TrendingDown, Info, Zap } from 'lucide-react';
import { formatCurrency, formatDateFull, getMonthsUntil } from '../utils/formatters';
import type { AppState } from '../data/mockAppState';

interface LoansDetailScreenProps {
  appState: AppState;
  onBack: () => void;
  onPayment: (type: 'mdp' | 'adp') => void;
}

export function LoansDetailScreen({ appState, onBack, onPayment }: LoansDetailScreenProps) {
  const { loans, onboarding } = appState;

  const priorityLabels = ['Высокий приоритет', 'Средний приоритет', 'Низкий приоритет'];

  const getStrategyLabel = () => {
    if (onboarding.strategy === 'консервативно') return '+5% к обязательным платежам';
    if (onboarding.strategy === 'сбалансировано') return '+20% к обязательным платежам';
    return '+40% к обязательным платежам';
  };

  const getStrategyColor = () => {
    if (onboarding.strategy === 'консервативно') return 'text-blue-600 bg-blue-50';
    if (onboarding.strategy === 'сбалансировано') return 'text-purple-600 bg-purple-50';
    return 'text-orange-600 bg-orange-50';
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Назад"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-semibold text-gray-900">Мои кредиты</h1>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {/* Summary */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <div className="text-sm text-gray-500 mb-2">Общий долг</div>
            <div className="text-3xl font-semibold text-gray-900 mb-4">
              {formatCurrency(loans.summary.total_outstanding)}
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${getStrategyColor()}`}>
                <Zap className="w-3.5 h-3.5" />
                <span>{onboarding.strategy}</span>
              </div>
              <div className="text-xs text-gray-500">{getStrategyLabel()}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onPayment('mdp')}
                className="p-4 bg-red-50 rounded-xl hover:bg-red-100 transition-colors text-left"
              >
                <div className="text-xs text-gray-600 mb-1">Обязательный</div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatCurrency(1200)}
                </div>
                <div className="text-xs text-red-600 mt-1 font-medium">Оплатить</div>
              </button>

              <button
                onClick={() => onPayment('adp')}
                className="p-4 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors text-left"
              >
                <div className="text-xs text-gray-600 mb-1">Дополнительный</div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatCurrency(540)}
                </div>
                <div className="text-xs text-purple-600 mt-1 font-medium">Оплатить</div>
              </button>
            </div>
          </div>

          {/* Strategy info */}
          <div className="bg-blue-50 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-gray-900 mb-1">
                  Приоритезация: лавина долгов
                </div>
                <div className="text-xs text-gray-600">
                  Сначала закрываем кредиты с наибольшей процентной ставкой, чтобы минимизировать переплату
                </div>
              </div>
            </div>
          </div>

          {/* Loans list */}
          <div>
            <h2 className="font-semibold text-gray-900 mb-3">Все кредиты</h2>
            <div className="space-y-3">
              {loans.items.map((loan) => {
                const monthsLeft = getMonthsUntil(loan.maturity_date);
                return (
                  <div
                    key={loan.id}
                    className="bg-white rounded-2xl p-5 border border-gray-200"
                    data-api-binding="loans[]"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-semibold text-gray-900 mb-1">{loan.bank}</div>
                        <div className="text-xs text-gray-500">{loan.type}</div>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-xs ${
                        loan.priority === 1
                          ? 'bg-red-50 text-red-700'
                          : loan.priority === 2
                          ? 'bg-orange-50 text-orange-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {priorityLabels[loan.priority - 1]}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Остаток</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {formatCurrency(loan.balance)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Ежемесячно</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {formatCurrency(loan.monthly_payment)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-600 pt-3 border-t border-gray-100">
                      <div>
                        <span className="text-gray-500">Ставка: </span>
                        <span className="font-medium">{loan.rate}%</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Осталось: </span>
                        <span className="font-medium">{monthsLeft} мес.</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Simulator hint */}
          <div className="bg-gradient-to-r from-purple-50 to-purple-100/50 rounded-2xl p-5 border border-purple-200/50">
            <div className="flex items-start gap-3">
              <TrendingDown className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-gray-900 mb-1">
                  Симулятор закрытия
                </div>
                <div className="text-xs text-gray-600 mb-3">
                  При текущем темпе все кредиты будут закрыты через{' '}
                  <span className="font-semibold text-purple-900">18 месяцев</span>
                </div>
                <div className="text-xs text-purple-700 font-medium">
                  Увеличьте дополнительный платёж на 50% → закрытие за 14 месяцев
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
