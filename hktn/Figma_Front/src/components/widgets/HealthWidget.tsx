import { TrendingUp, Info } from 'lucide-react';
import type { AppState } from '../../data/mockAppState';

interface HealthWidgetProps {
  health: AppState['health'];
  onTap: () => void;
}

export function HealthWidget({ health, onTap }: HealthWidgetProps) {
  const getStatusColor = () => {
    if (health.status === 'спокойно') return 'var(--color-accent-primary)';
    if (health.status === 'внимание') return 'var(--color-warning)';
    return 'var(--color-error)';
  };

  const getStatusBg = () => {
    if (health.status === 'спокойно') return 'var(--color-accent-light)';
    if (health.status === 'внимание') return 'var(--color-warning-light)';
    return 'var(--color-error-light)';
  };

  return (
    <button
      onClick={onTap}
      className="w-full bg-white rounded-2xl p-4 border border-gray-200 hover:shadow-lg transition-shadow text-left"
      data-api-binding="health.score, health.status, health.next_action"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Circle indicator */}
          <div className="relative">
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
                stroke={getStatusColor()}
                strokeWidth="4"
                strokeDasharray={`${(health.score / 100) * 175.93} 175.93`}
                className="transition-all duration-1000"
                style={{
                  animation: 'breathe 3s ease-in-out infinite',
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-medium" style={{ color: getStatusColor() }}>
                {health.score}
              </span>
            </div>
          </div>

          <div className="flex-1">
            <div className="text-sm text-gray-500 mb-1">Финздоровье</div>
            <div
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
              style={{
                backgroundColor: getStatusBg(),
                color: getStatusColor(),
              }}
            >
              <span>{health.status}</span>
            </div>
          </div>
        </div>

        {health.next_action && (
          <div className="flex items-center gap-1 text-xs" style={{ color: getStatusColor() }}>
            <Info className="w-4 h-4" />
          </div>
        )}
      </div>

      <style>{`
        @keyframes breathe {
          0%, 100% { stroke-opacity: 1; }
          50% { stroke-opacity: 0.6; }
        }
      `}</style>
    </button>
  );
}
