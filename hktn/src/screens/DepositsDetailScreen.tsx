import { ArrowLeft, TrendingUp, Target, Sparkles } from 'lucide-react';
import { formatCurrency, formatDateFull } from '../utils/formatters';
import type { AppState } from '../data/mockAppState';

interface DepositsDetailScreenProps {
  appState: AppState;
  onBack: () => void;
  onPayment: (type: 'sdp') => void;
  onNavigate: (screen: string) => void;
}

export function DepositsDetailScreen({ appState, onBack, onPayment, onNavigate }: DepositsDetailScreenProps) {
  const { goals, deposits } = appState;
  const progress = (goals.summary.total_saved / goals.summary.target) * 100;

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
            <h1 className="text-xl font-semibold text-gray-900">Мои накопления</h1>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {/* Summary */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200/50">
            <div className="text-sm text-green-700 mb-2">Накоплено</div>
            <div className="text-3xl font-semibold text-green-900 mb-1">
              {formatCurrency(goals.summary.total_saved)}
            </div>
            <div className="text-xs text-green-600 mb-4">
              Цель: {formatCurrency(goals.summary.target)}
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="h-3 bg-white/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
              <div className="text-xs text-green-700 mt-2 text-right">
                {Math.round(progress)}% к цели
              </div>
            </div>

            <button
              onClick={() => onPayment('sdp')}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
            >
              Пополнить {formatCurrency(goals.summary.daily_payment)}
            </button>
          </div>

          {/* Current deposit */}
          {deposits.current && (
            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-yellow-500" />
                <h2 className="font-semibold text-gray-900">Текущий вклад</h2>
              </div>

              <div className="mb-4">
                <div className="font-semibold text-gray-900 mb-1">{deposits.current.bank}</div>
                <div className="text-sm text-gray-600">{deposits.current.product}</div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Баланс</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {formatCurrency(deposits.current.balance)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Ставка</div>
                  <div className="text-lg font-semibold text-green-600">
                    {deposits.current.rate}%
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-600 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1">
                  {deposits.current.capitalization && (
                    <>
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      <span>Капитализация</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {deposits.current.withdrawable && (
                    <>
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                      <span>Можно снимать</span>
                    </>
                  )}
                </div>
              </div>

              <div className="text-xs text-gray-500 mt-3">
                Дата окончания: {formatDateFull(deposits.current.maturity_date)}
              </div>
            </div>
          )}

          {/* Goal info */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-purple-500" />
              <h2 className="font-semibold text-gray-900">Ваша цель</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Целевая сумма</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(deposits.goal.target_amount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Горизонт</span>
                <span className="font-semibold text-gray-900">
                  {deposits.goal.horizon_months} месяцев
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Осталось накопить</span>
                <span className="font-semibold text-purple-600">
                  {formatCurrency(deposits.goal.target_amount - goals.summary.total_saved)}
                </span>
              </div>
            </div>
          </div>

          {/* Better offers */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Лучшие предложения</h2>
              <button
                onClick={() => onNavigate('refinance')}
                className="text-sm text-purple-600 font-medium hover:text-purple-700"
              >
                Все офферы →
              </button>
            </div>

            <div className="space-y-3">
              {appState.offers.deposits.slice(0, 2).map((offer) => (
                <div
                  key={offer.id}
                  className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200/50"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold text-gray-900">{offer.bank}</div>
                      <div className="text-xs text-gray-600">{offer.product}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-green-600">
                        {offer.rate}%
                      </div>
                      <div className="text-xs text-gray-500">
                        EAR {offer.ear}%
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <div>{offer.term_months} мес.</div>
                    <div>•</div>
                    <div>{offer.capitalization}</div>
                    <div>•</div>
                    <div>от {formatCurrency(offer.min_amount)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Projection */}
          <div className="bg-gradient-to-r from-purple-50 to-purple-100/50 rounded-2xl p-5 border border-purple-200/50">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-gray-900 mb-1">
                  Прогноз накоплений
                </div>
                <div className="text-xs text-gray-600 mb-2">
                  При текущем темпе ({formatCurrency(goals.summary.daily_payment)}/день)
                </div>
                <div className="text-sm font-semibold text-purple-900">
                  Цель будет достигнута через ~{Math.ceil((deposits.goal.target_amount - goals.summary.total_saved) / (goals.summary.daily_payment * 30))} месяцев
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
