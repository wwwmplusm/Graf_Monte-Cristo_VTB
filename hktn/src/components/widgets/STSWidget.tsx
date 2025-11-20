import { ArrowRight, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import type { AppState } from '../../data/mockAppState';

interface STSWidgetProps {
  sts: AppState['sts'];
  onTap: () => void;
}

export function STSWidget({ sts, onTap }: STSWidgetProps) {
  const remaining = sts.today.amount - sts.today.spent;
  const spentPercent = sts.today.amount > 0 ? (sts.today.spent / sts.today.amount) * 100 : 0;
  const isLow = remaining < sts.today.amount * 0.2;
  const isCritical = remaining < sts.today.amount * 0.1;

  const getStatusColor = () => {
    if (isCritical) return 'text-red-600';
    if (isLow) return 'text-orange-600';
    return 'text-purple-700';
  };

  const getProgressColor = () => {
    if (isCritical) return 'bg-red-500';
    if (isLow) return 'bg-orange-500';
    if (spentPercent < 50) return 'bg-green-500';
    return 'bg-purple-500';
  };

  return (
    <button
      onClick={onTap}
      className="w-full bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-2xl p-5 border border-purple-200/50 hover:shadow-lg transition-shadow text-left"
      data-api-binding="sts.today.amount, sts.today.spent, sts.tomorrow.impact"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`text-sm font-medium ${getStatusColor()}`}>Safe-to-Spend</div>
        <ArrowRight className="w-4 h-4 text-purple-400" />
      </div>

      <div className="mb-4">
        <div className="text-3xl font-semibold text-purple-900 mb-2">
          {formatCurrency(remaining)}
        </div>
        
        {/* Progress bar */}
        <div className="mb-2">
          <div className="h-2 bg-white/60 rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor()} transition-all duration-500 ease-out`}
              style={{ width: `${Math.min(100, spentPercent)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-purple-600">
            Потрачено {formatCurrency(sts.today.spent)}
          </span>
          <span className={`font-medium ${getStatusColor()}`}>
            {Math.round(spentPercent)}%
          </span>
        </div>
      </div>

      {/* Tomorrow impact */}
      {sts.tomorrow?.impact && (
        <div className={`flex items-center gap-1.5 text-xs ${getStatusColor()} bg-white/60 rounded-lg px-3 py-2`}>
          {sts.tomorrow.impact.includes('+') ? (
            <TrendingUp className="w-3.5 h-3.5" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5" />
          )}
          <span>{sts.tomorrow.impact}</span>
        </div>
      )}

      {/* Warning for low STS */}
      {isLow && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Осталось мало средств на сегодня</span>
        </div>
      )}
    </button>
  );
}
