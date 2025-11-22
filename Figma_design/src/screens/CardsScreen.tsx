import { ArrowLeft, CreditCard, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency } from '../utils/formatters';
import type { AppState } from '../data/mockAppState';

interface CardsScreenProps {
  appState: AppState;
  onBack: () => void;
}

export function CardsScreen({ appState, onBack }: CardsScreenProps) {
  const [showBalance, setShowBalance] = useState(true);

  const getBankColor = (bank: string) => {
    const colors: Record<string, string> = {
      'Сбербанк': 'from-green-600 to-green-700',
      'Тинькофф': 'from-yellow-500 to-yellow-600',
      'ABank': 'from-red-600 to-red-700',
      'ВТБ': 'from-blue-600 to-blue-700',
    };
    return colors[bank] || 'from-gray-700 to-gray-900';
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
            <h1 className="text-xl font-semibold text-gray-900">Мои карты</h1>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {/* Total balance */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-500">Общий баланс</div>
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label={showBalance ? 'Скрыть баланс' : 'Показать баланс'}
              >
                {showBalance ? (
                  <Eye className="w-4 h-4 text-gray-500" />
                ) : (
                  <EyeOff className="w-4 h-4 text-gray-500" />
                )}
              </button>
            </div>
            <div className="text-3xl font-semibold text-gray-900">
              {showBalance ? formatCurrency(appState.balances.total_debit) : '••• •••'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              На {appState.cards.filter(c => c.type === 'debit').length} картах
            </div>
          </div>

          {appState.analytics?.balancesByBank?.length ? (
            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <div className="text-sm text-gray-500 mb-2">Сводный баланс по банкам</div>
              <div className="space-y-2">
                {appState.analytics.balancesByBank.map(item => (
                  <div key={item.bank} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{item.bank}</span>
                    <span className="font-semibold text-gray-900">
                      {showBalance ? formatCurrency(item.total) : '••• •••'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Cards list */}
          <div>
            <h2 className="font-semibold text-gray-900 mb-3">Дебетовые карты</h2>
            <div className="space-y-4">
              {appState.cards.filter(c => c.type === 'debit').map((card) => (
                <div
                  key={card.id}
                  className={`rounded-2xl p-6 bg-gradient-to-br ${getBankColor(card.bank)} text-white shadow-lg`}
                  data-api-binding="cards[]"
                >
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <div className="text-sm opacity-90 mb-1">{card.bank}</div>
                      <div className="text-xs opacity-75">Дебетовая карта</div>
                    </div>
                    <CreditCard className="w-8 h-8 opacity-80" />
                  </div>

                  <div className="mb-6">
                    <div className="text-xs opacity-75 mb-1">Номер карты</div>
                    <div className="text-xl tracking-wider font-mono">
                      {card.mask}
                    </div>
                  </div>

                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs opacity-75 mb-1">Доступно</div>
                      <div className="text-2xl font-semibold">
                        {showBalance ? formatCurrency(card.balance) : '••• •••'}
                      </div>
                    </div>
                    {card.holds > 0 && (
                      <div className="text-right">
                        <div className="text-xs opacity-75 mb-1">В холде</div>
                        <div className="text-sm font-medium">
                          {showBalance ? formatCurrency(card.holds) : '••• •••'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add card hint */}
          <button className="w-full p-5 bg-white border-2 border-dashed border-gray-300 rounded-2xl hover:border-purple-400 hover:bg-purple-50/50 transition-colors">
            <div className="flex items-center justify-center gap-2 text-gray-600">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-xl">+</span>
              </div>
              <span className="font-medium">Добавить карту</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
