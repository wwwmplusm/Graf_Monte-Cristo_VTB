import { Calendar, Clock, AlertCircle } from 'lucide-react';
import { formatDate, formatCurrency, getDaysUntil } from '../../utils/formatters';
import type { AppState } from '../../data/mockAppState';

interface TimelineWidgetProps {
  timeline: AppState['timeline'];
  onTap: () => void;
}

export function TimelineWidget({ timeline, onTap }: TimelineWidgetProps) {
  const upcomingEvents = timeline.slice(0, 3);

  const getEventIcon = (type: string) => {
    if (type === 'loan_payment') return <AlertCircle className="w-4 h-4 text-red-500" />;
    if (type === 'deposit_due') return <TrendingUp className="w-4 h-4 text-green-500" />;
    return <Clock className="w-4 h-4 text-blue-500" />;
  };

  return (
    <button
      onClick={onTap}
      className="w-full bg-white rounded-2xl p-5 border border-gray-200 hover:shadow-lg transition-shadow text-left"
      data-api-binding="timeline[]"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-400" />
          <span className="font-medium text-gray-900">Предстоящие 30 дней</span>
        </div>
      </div>

      <div className="space-y-3">
        {upcomingEvents.map((event, idx) => {
          const daysUntil = getDaysUntil(event.date);
          return (
            <div key={idx} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
              <div className="flex items-start gap-3">
                {getEventIcon(event.type)}
                <div>
                  <div className="text-sm font-medium text-gray-900">{event.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {formatDate(event.date)} • {daysUntil === 0 ? 'Сегодня' : `через ${daysUntil} дн.`}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">
                  {formatCurrency(event.amount)}
                </div>
                {event.can_defer > 0 && (
                  <div className="text-xs text-purple-600 mt-0.5">
                    отложить
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {timeline.length > 3 && (
        <div className="mt-3 text-center text-sm text-purple-600 font-medium">
          Ещё {timeline.length - 3} событий →
        </div>
      )}
    </button>
  );
}

function TrendingUp({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}
