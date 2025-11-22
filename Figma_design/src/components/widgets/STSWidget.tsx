import { ArrowRight, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import type { AppState } from '../../data/mockAppState';

interface STSWidgetProps {
  sts: AppState['sts'];
  onTap: () => void;
}

export function STSWidget({ sts, onTap }: STSWidgetProps) {
  const remaining = sts.today.amount - sts.today.spent;

  return (
    <button
      onClick={onTap}
      className="w-full bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-2xl p-5 border border-purple-200/50 hover:shadow-lg transition-shadow text-left"
      data-api-binding="sts.today.amount, sts.today.spent, sts.tomorrow.impact"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="text-sm text-purple-700 font-medium">Сегодня можно</div>
        <ArrowRight className="w-4 h-4 text-purple-400" />
      </div>

      <div className="mb-3">
        <div className="text-3xl font-semibold text-purple-900 mb-1">
          {formatCurrency(remaining)}
        </div>
        <div className="text-xs text-purple-600">
          Потрачено {formatCurrency(sts.today.spent)} из {formatCurrency(sts.today.amount)}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-purple-700 bg-white/60 rounded-lg px-3 py-2">
        <TrendingUp className="w-3.5 h-3.5" />
        <span>{sts.tomorrow.impact}</span>
      </div>
    </button>
  );
}
