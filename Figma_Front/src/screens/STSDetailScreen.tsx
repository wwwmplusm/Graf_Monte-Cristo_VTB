import { ArrowLeft } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import type { AppState } from '../data/mockAppState';

interface STSDetailScreenProps {
  appState: AppState;
  onBack: () => void;
  onPayment: (type: 'mdp' | 'adp' | 'sdp') => void;
}

export function STSDetailScreen({ appState, onBack, onPayment }: STSDetailScreenProps) {
  const { sts } = appState;
  const remaining = 1700;

  // Mock chart data for 30 days
  const chartData = Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    amount: 8000 + Math.random() * 8000,
  }));

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
            <h1 className="text-xl font-semibold text-gray-900">Safe to Spend</h1>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {/* Current STS */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-2xl p-6 border border-purple-200/50">
            <div className="text-sm text-purple-700 mb-2">Доступно сегодня</div>
            <div className="text-4xl font-semibold text-purple-900 mb-3">
              {formatCurrency(remaining)}
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-purple-600">Потрачено: </span>
                <span className="font-medium text-purple-900">{formatCurrency(sts.today.spent)}</span>
              </div>
              <div>
                <span className="text-purple-600">Лимит: </span>
                <span className="font-medium text-purple-900">{formatCurrency(sts.today.amount)}</span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-4">Быстрые действия</h2>
            <div className="space-y-3">
              {appState.mode === 'loans' && (
                <>
                  <button
                    onClick={() => onPayment('mdp')}
                    className="w-full flex items-center justify-between p-4 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                  >
                    <div className="text-left">
                      <div className="text-sm font-medium text-gray-900">Обязательный платёж</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {formatCurrency(1200)}
                      </div>
                    </div>
                    <div className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg font-medium">
                      Оплатить
                    </div>
                  </button>
                  <button
                    onClick={() => onPayment('adp')}
                    className="w-full flex items-center justify-between p-4 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors"
                  >
                    <div className="text-left">
                      <div className="text-sm font-medium text-gray-900">Дополнительный платёж</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {formatCurrency(540)}
                      </div>
                    </div>
                    <div className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg font-medium">
                      Оплатить
                    </div>
                  </button>
                </>
              )}
              {appState.mode === 'deposits' && (
                <button
                  onClick={() => onPayment('sdp')}
                  className="w-full flex items-center justify-between p-4 bg-green-50 rounded-xl hover:bg-green-100 transition-colors"
                >
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-900">Пополнить накопления</div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {formatCurrency(appState.goals.summary.daily_payment)}
                    </div>
                  </div>
                  <div className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg font-medium">
                    SDP
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
