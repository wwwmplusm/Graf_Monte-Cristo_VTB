import { ArrowLeft } from 'lucide-react';
import { formatCurrency } from '../utils/formatters'; // Keep formatCurrency as it's still used
import { calculatePayoffTime, calculateWeightedAverageRate } from '../utils/calculations'; // Add new imports
import type { AppState } from '../data/mockAppState';

interface LoansDetailScreenProps {
  appState: AppState;
  onBack: () => void;
  onPayment: (type: 'mdp' | 'adp') => void;
}

export function LoansDetailScreen({ appState, onBack, onPayment }: LoansDetailScreenProps) {
  const { loans } = appState; // Remove 'onboarding' as it's no longer used
  const debtsByBank = appState.analytics?.debtsByBank || [];

  // Calculate weighted average rate and payoff time for the new widgets
  const weightedAverageRate = calculateWeightedAverageRate(loans.items);
  const payoffTime = calculatePayoffTime(
    loans.summary.total_outstanding,
    loans.summary.mandatory_daily_payment + loans.summary.additional_daily_payment,
    weightedAverageRate
  );

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

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onPayment('mdp')}
                className="p-4 bg-red-50 rounded-xl hover:bg-red-100 transition-colors text-left"
              >
                <div className="text-xs text-gray-600 mb-1">Обязательный</div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatCurrency(loans.summary.mandatory_daily_payment)}
                </div>
                <div className="text-xs text-red-600 mt-1 font-medium">Оплатить</div>
              </button>

              <button
                onClick={() => onPayment('adp')}
                className="p-4 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors text-left"
              >
                <div className="text-xs text-gray-600 mb-1">Дополнительный</div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatCurrency(loans.summary.additional_daily_payment)}
                </div>
                <div className="text-xs text-purple-600 mt-1 font-medium">Оплатить</div>
              </button>
            </div>
          </div>

          {debtsByBank.length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <h2 className="font-semibold text-gray-900 mb-3">Долг по банкам</h2>
              <div className="space-y-3">
                {debtsByBank.map(item => (
                  <div key={item.bank} className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">{item.bank}</div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(item.total)}
                      </div>
                      <div className="text-xs text-gray-500">{item.products} кредит(а)</div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="text-sm font-medium text-gray-700">Итого</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {formatCurrency(loans.summary.total_outstanding)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loans list */}
          <div>
            <h2 className="font-semibold text-gray-900 mb-3">Все кредиты</h2>
            <div className="space-y-3">
              {loans.items.map((loan) => {
                // const monthsLeft = getMonthsUntil(loan.maturity_date); // Removed
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
                      {/* Removed priority badge */}
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
                        {/* Removed monthsLeft */}
                        <span className="font-medium">
                          {new Date(loan.maturity_date).toLocaleDateString('ru-RU', {
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
