import { CreditCard, TrendingDown, TrendingUp, Zap, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  amount?: number;
  badge?: string;
}

interface QuickActionsWidgetProps {
  mode: 'loans' | 'deposits';
  mdp?: number;
  adp?: number;
  sdp?: number;
  onPayMDP?: () => void;
  onPayADP?: () => void;
  onPaySDP?: () => void;
  onRefinance?: () => void;
}

export function QuickActionsWidget({
  mode,
  mdp,
  adp,
  sdp,
  onPayMDP,
  onPayADP,
  onPaySDP,
  onRefinance,
}: QuickActionsWidgetProps) {
  const actions: QuickAction[] = [];

  if (mode === 'loans') {
    if (mdp && mdp > 0) {
      actions.push({
        id: 'mdp',
        label: 'Обязательный платёж',
        icon: <CreditCard className="w-5 h-5" />,
        color: 'text-red-600',
        bgColor: 'bg-red-50 hover:bg-red-100',
        amount: mdp,
      });
    }
    if (adp && adp > 0) {
      actions.push({
        id: 'adp',
        label: 'Дополнительный платёж',
        icon: <TrendingDown className="w-5 h-5" />,
        color: 'text-purple-600',
        bgColor: 'bg-purple-50 hover:bg-purple-100',
        amount: adp,
        badge: 'Ускорить',
      });
    }
    if (onRefinance) {
      actions.push({
        id: 'refinance',
        label: 'Оптимизировать кредиты',
        icon: <Zap className="w-5 h-5" />,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50 hover:bg-blue-100',
        badge: 'Экономия',
      });
    }
  } else {
    if (sdp && sdp > 0) {
      actions.push({
        id: 'sdp',
        label: 'Пополнить по плану',
        icon: <TrendingUp className="w-5 h-5" />,
        color: 'text-green-600',
        bgColor: 'bg-green-50 hover:bg-green-100',
        amount: sdp,
      });
    }
    if (onRefinance) {
      actions.push({
        id: 'refinance',
        label: 'Оптимизировать вклады',
        icon: <Zap className="w-5 h-5" />,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50 hover:bg-blue-100',
        badge: 'Больше %',
      });
    }
  }

  if (actions.length === 0) {
    return null;
  }

  const handleAction = (actionId: string) => {
    switch (actionId) {
      case 'mdp':
        onPayMDP?.();
        break;
      case 'adp':
        onPayADP?.();
        break;
      case 'sdp':
        onPaySDP?.();
        break;
      case 'refinance':
        onRefinance?.();
        break;
    }
  };

  return (
    <div className="w-full bg-white rounded-2xl p-4 border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-900">Быстрые действия</span>
        <ArrowRight className="w-4 h-4 text-gray-400" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => handleAction(action.id)}
            className={`${action.bgColor} ${action.color} rounded-xl p-3 text-left transition-all hover:shadow-md`}
          >
            <div className="flex items-start justify-between mb-2">
              {action.icon}
              {action.badge && (
                <span className="text-xs font-medium bg-white/60 px-1.5 py-0.5 rounded">
                  {action.badge}
                </span>
              )}
            </div>
            <div className="text-xs font-medium mb-1">{action.label}</div>
            {action.amount && (
              <div className="text-sm font-semibold">{formatCurrency(action.amount)}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

