import { TrendingUp, Info, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import type { AppState } from '../../data/mockAppState';

interface HealthWidgetProps {
  health: AppState['health'];
  onTap: () => void;
}

export function HealthWidget({ health, onTap }: HealthWidgetProps) {
  const getStatusColor = () => {
    if (health.status === 'спокойно') return 'text-green-600';
    if (health.status === 'внимание') return 'text-orange-600';
    return 'text-red-600';
  };

  const getStatusBg = () => {
    if (health.status === 'спокойно') return 'bg-green-50';
    if (health.status === 'внимание') return 'bg-orange-50';
    return 'bg-red-50';
  };

  const getStatusBorderColor = () => {
    if (health.status === 'спокойно') return 'border-green-200';
    if (health.status === 'внимание') return 'border-orange-200';
    return 'border-red-200';
  };

  const getCircleColor = () => {
    if (health.status === 'спокойно') return '#10b981'; // green-500
    if (health.status === 'внимание') return '#f59e0b'; // orange-500
    return '#ef4444'; // red-500
  };

  return (
    <button
      onClick={onTap}
      className={`w-full bg-white rounded-2xl p-5 border ${getStatusBorderColor()} hover:shadow-lg transition-shadow text-left`}
      data-api-binding="health.score, health.status, health.next_action, health.reasons"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-4 flex-1">
          {/* Circle indicator */}
          <div className="relative flex-shrink-0">
            <svg className="w-16 h-16 -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="#f3f4f6"
                strokeWidth="4"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke={getCircleColor()}
                strokeWidth="4"
                strokeDasharray={`${(health.score / 100) * 175.93} 175.93`}
                className="transition-all duration-1000"
                style={{
                  animation: 'breathe 3s ease-in-out infinite',
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`font-semibold text-lg ${getStatusColor()}`}>
                {Math.round(health.score)}
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-500 mb-1">Финздоровье</div>
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBg()} ${getStatusColor()}`}
            >
              {health.status === 'спокойно' && <CheckCircle2 className="w-3 h-3" />}
              {health.status === 'внимание' && <AlertCircle className="w-3 h-3" />}
              {health.status === 'нужен план' && <AlertCircle className="w-3 h-3" />}
              <span>{health.status}</span>
            </div>
          </div>
        </div>

        <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
      </div>

      {/* Reasons */}
      {health.reasons && health.reasons.length > 0 && (
        <div className="mb-3 space-y-1">
          {health.reasons.slice(0, 2).map((reason, idx) => (
            <div key={idx} className="text-xs text-gray-600 flex items-start gap-1.5">
              <div className={`w-1 h-1 rounded-full mt-1.5 ${getStatusColor().replace('text-', 'bg-')}`} />
              <span className="flex-1">{reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Next action */}
      {health.next_action && (
        <div className={`flex items-center gap-2 text-xs ${getStatusColor()} ${getStatusBg()} rounded-lg px-3 py-2 mt-2`}>
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="font-medium">{health.next_action.label}</span>
        </div>
      )}

      <style>{`
        @keyframes breathe {
          0%, 100% { stroke-opacity: 1; }
          50% { stroke-opacity: 0.6; }
        }
      `}</style>
    </button>
  );
}
