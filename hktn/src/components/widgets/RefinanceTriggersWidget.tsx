import { TrendingDown, AlertTriangle, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface RefinanceTrigger {
  type: 'refi_opportunity' | 'high_dti' | 'gap_risk' | 'overdue';
  urgency: 'high' | 'medium' | 'watch';
  title: string;
  description: string;
  savings?: number;
  action_label: string;
  loan_ids?: string[];
}

interface RefinanceTriggersWidgetProps {
  triggers: RefinanceTrigger[];
  onTap: () => void;
  onQuickAction?: (trigger: RefinanceTrigger) => void;
}

export function RefinanceTriggersWidget({ triggers, onTap, onQuickAction }: RefinanceTriggersWidgetProps) {
  if (triggers.length === 0) {
    return null;
  }

  // Показываем только самые важные триггеры (high и medium urgency)
  const importantTriggers = triggers
    .filter(t => t.urgency === 'high' || t.urgency === 'medium')
    .slice(0, 2);

  if (importantTriggers.length === 0) {
    return null;
  }

  const getUrgencyColor = (urgency: string) => {
    if (urgency === 'high') return 'bg-red-50 border-red-200 text-red-700';
    if (urgency === 'medium') return 'bg-orange-50 border-orange-200 text-orange-700';
    return 'bg-blue-50 border-blue-200 text-blue-700';
  };

  const getUrgencyIcon = (urgency: string) => {
    if (urgency === 'high') return <AlertTriangle className="w-4 h-4" />;
    return <TrendingDown className="w-4 h-4" />;
  };

  const getTypeIcon = (type: string) => {
    if (type === 'refi_opportunity') return <Sparkles className="w-5 h-5 text-purple-500" />;
    if (type === 'overdue' || type === 'gap_risk') return <AlertTriangle className="w-5 h-5 text-red-500" />;
    return <TrendingDown className="w-5 h-5 text-orange-500" />;
  };

  return (
    <div
      className="w-full bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-2xl p-5 border border-purple-200/50 hover:shadow-lg transition-shadow"
      data-api-binding="refinance_triggers[]"
    >
      <button onClick={onTap} className="w-full text-left mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <span className="font-medium text-gray-900">Возможности оптимизации</span>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400" />
        </div>
      </button>

      <div className="space-y-3">
        {importantTriggers.map((trigger, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-xl border ${getUrgencyColor(trigger.urgency)}`}
          >
            <div className="flex items-start gap-3">
              {getTypeIcon(trigger.type)}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold mb-1">{trigger.title}</div>
                    <div className="text-xs opacity-90 mb-2">{trigger.description}</div>
                    {trigger.savings && trigger.savings > 0 && (
                      <div className="text-xs font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Экономия: {formatCurrency(trigger.savings)}/мес
                      </div>
                    )}
                  </div>
                </div>
                {onQuickAction && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickAction(trigger);
                    }}
                    className={`mt-2 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      trigger.urgency === 'high'
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-white text-purple-600 hover:bg-purple-50'
                    }`}
                  >
                    {trigger.action_label}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {triggers.length > importantTriggers.length && (
        <button
          onClick={onTap}
          className="mt-3 w-full text-center text-sm text-purple-600 font-medium hover:text-purple-700 transition-colors"
        >
          Все возможности →
        </button>
      )}
    </div>
  );
}

