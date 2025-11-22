import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import type { AppState } from '../../data/mockAppState';

interface LoansDepositsWidgetProps {
  mode: 'loans' | 'deposits';
  loans: AppState['loans'];
  goals: AppState['goals'];
  onTap: () => void;
  onPayMDP?: () => void;
  onPayADP?: () => void;
  onPaySDP?: () => void;
}

export function LoansDepositsWidget({
  mode,
  loans,
  goals,
  onTap,
  onPayMDP,
  onPayADP,
  onPaySDP,
}: LoansDepositsWidgetProps) {
  if (mode === 'loans') {
    return (
      <div
        className="w-full bg-white rounded-2xl p-5 border border-gray-200 hover:shadow-lg transition-shadow"
        data-api-binding="loans.summary.total_outstanding, loans.summary.mandatory_daily_payment, loans.summary.additional_daily_payment"
      >
        <button onClick={onTap} className="w-full text-left mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm text-gray-500 mb-1">Общий долг</div>
              <div className="text-2xl font-semibold text-gray-900">
                {formatCurrency(loans.summary.total_outstanding)}
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 mt-1" />
          </div>
        </button>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl">
            <div>
              <div className="text-xs text-gray-600 mb-0.5">Обязательный платёж</div>
              <div className="font-semibold text-gray-900">
                {formatCurrency(loans.summary.mandatory_daily_payment)}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPayMDP?.();
              }}
              className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
              data-action="pay_mdp()"
            >
              Оплатить
            </button>
          </div>

          <div className="flex items-center justify-between p-3 bg-purple-50 rounded-xl">
            <div>
              <div className="text-xs text-gray-600 mb-0.5">Дополнительный платёж</div>
              <div className="font-semibold text-gray-900">
                {formatCurrency(loans.summary.additional_daily_payment)}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPayADP?.();
              }}
              className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
              data-action="pay_adp()"
            >
              Оплатить
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Deposits mode
  return (
    <div
      className="w-full bg-white rounded-2xl p-5 border border-gray-200 hover:shadow-lg transition-shadow"
      data-api-binding="goals.summary.total_saved, goals.summary.daily_payment, goals.summary.target"
    >
      <button onClick={onTap} className="w-full text-left mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-sm text-gray-500 mb-1">Накоплено</div>
            <div className="text-2xl font-semibold text-gray-900">
              {formatCurrency(goals.summary.total_saved)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Цель: {formatCurrency(goals.summary.target)}
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400 mt-1" />
        </div>
      </button>

      <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl">
        <div>
          <div className="text-xs text-gray-600 mb-0.5">Пополнить сегодня</div>
          <div className="font-semibold text-gray-900">
            {formatCurrency(goals.summary.daily_payment)}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPaySDP?.();
          }}
          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
          data-action="pay_sdp()"
        >
          SDP
        </button>
      </div>

      {goals.summary.total_saved > 0 && (
        <div className="mt-3">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
              style={{
                width: `${Math.min(100, (goals.summary.total_saved / goals.summary.target) * 100)}%`,
              }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-2 text-right">
            {Math.round((goals.summary.total_saved / goals.summary.target) * 100)}% к цели
          </div>
        </div>
      )}
    </div>
  );
}
