import { X, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency } from '../utils/formatters';

interface PaymentSheetProps {
  type: 'mdp' | 'adp' | 'sdp';
  defaultAmount: number;
  currentSTS: number;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}

export function PaymentSheet({
  type,
  defaultAmount,
  currentSTS,
  onClose,
  onConfirm,
}: PaymentSheetProps) {
  const [amount, setAmount] = useState(defaultAmount);
  const newSTS = type === 'sdp' ? currentSTS - amount : currentSTS + amount * 0.1; // Simplified calculation

  const getTitle = () => {
    if (type === 'mdp') return 'Обязательный платёж';
    if (type === 'adp') return 'Дополнительный платёж';
    return 'Пополнение накоплений';
  };

  const getDescription = () => {
    if (type === 'mdp') return 'Минимальная сумма для избежания штрафов и комиссий';
    if (type === 'adp') return 'Ускорит закрытие кредитов согласно вашей стратегии';
    return 'Пополнение вашего накопительного счёта';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 animate-in slide-in-from-bottom duration-300">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">{getTitle()}</h2>
            <p className="text-sm text-gray-600">{getDescription()}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Amount input */}
        <div className="mb-6">
          <label className="block text-sm text-gray-600 mb-2">Сумма платежа</label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full text-3xl font-semibold text-gray-900 bg-gray-50 rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-purple-500 transition-shadow"
              min={type === 'mdp' ? defaultAmount : 0}
            />
            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-2xl text-gray-400">₽</div>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Рекомендуемая сумма: {formatCurrency(defaultAmount)}
          </div>
        </div>

        {/* Impact preview */}
        <div className="bg-purple-50 rounded-2xl p-4 mb-6">
          <div className="text-sm text-gray-700 mb-3 font-medium">Влияние на финансы:</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">STS сегодня</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">{formatCurrency(currentSTS)}</span>
                {type === 'sdp' ? (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                )}
                <span className="text-sm font-semibold text-gray-900">
                  {formatCurrency(Math.round(newSTS))}
                </span>
              </div>
            </div>
            {type !== 'sdp' && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Экономия процентов</span>
                <span className="text-sm font-semibold text-green-600">
                  +{formatCurrency(Math.round(amount * 0.002))}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-6 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
          >
            Отменить
          </button>
          <button
            onClick={() => onConfirm(amount)}
            className="flex-1 py-3 px-6 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
            data-action={`pay_${type}()`}
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}
