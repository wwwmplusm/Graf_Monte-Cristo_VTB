import { Calendar, AlertCircle, TrendingUp, Clock, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface Event {
  date: string;
  type: string;
  amount: number;
  description: string;
}

interface UpcomingEventsWidgetProps {
  events: Event[];
  onTap: () => void;
  onQuickPay?: (event: Event) => void;
}

export function UpcomingEventsWidget({ events, onTap, onQuickPay }: UpcomingEventsWidgetProps) {
  const upcomingEvents = events.slice(0, 3);
  const hasMore = events.length > 3;

  const getDaysUntil = (dateStr: string): number => {
    const eventDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    eventDate.setHours(0, 0, 0, 0);
    const diffTime = eventDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (dateStr === today.toISOString().split('T')[0]) return 'Сегодня';
    if (dateStr === tomorrow.toISOString().split('T')[0]) return 'Завтра';
    
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const getEventIcon = (type: string) => {
    if (type === 'loan_payment') return <AlertCircle className="w-4 h-4 text-red-500" />;
    if (type === 'deposit_due' || type === 'salary') return <TrendingUp className="w-4 h-4 text-green-500" />;
    return <Clock className="w-4 h-4 text-blue-500" />;
  };

  const getEventColor = (type: string) => {
    if (type === 'loan_payment') return 'bg-red-50 border-red-200';
    if (type === 'deposit_due' || type === 'salary') return 'bg-green-50 border-green-200';
    return 'bg-blue-50 border-blue-200';
  };

  const isUrgent = (daysUntil: number) => daysUntil <= 3;

  if (upcomingEvents.length === 0) {
    return null;
  }

  return (
    <div
      className="w-full bg-white rounded-2xl p-5 border border-gray-200 hover:shadow-lg transition-shadow"
      data-api-binding="events_next_30d[]"
    >
      <button onClick={onTap} className="w-full text-left mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-900">Ближайшие события</span>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400" />
        </div>
      </button>

      <div className="space-y-3">
        {upcomingEvents.map((event, idx) => {
          const daysUntil = getDaysUntil(event.date);
          const urgent = isUrgent(daysUntil);
          
          return (
            <div
              key={idx}
              className={`flex items-start justify-between p-3 rounded-xl border ${getEventColor(event.type)} ${
                urgent ? 'ring-2 ring-red-300' : ''
              }`}
            >
              <div className="flex items-start gap-3 flex-1">
                {getEventIcon(event.type)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {event.description}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-2">
                    <span>{formatDate(event.date)}</span>
                    {daysUntil > 0 && (
                      <span className={`${urgent ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        {daysUntil === 1 ? 'завтра' : `через ${daysUntil} дн.`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right ml-3">
                {event.amount > 0 && (
                  <div className={`text-sm font-semibold ${event.type === 'loan_payment' ? 'text-red-700' : 'text-green-700'}`}>
                    {event.type === 'loan_payment' ? '−' : '+'}
                    {formatCurrency(Math.abs(event.amount))}
                  </div>
                )}
                {event.type === 'loan_payment' && onQuickPay && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickPay(event);
                    }}
                    className="mt-1 text-xs px-2 py-1 bg-white text-red-600 rounded-md hover:bg-red-50 transition-colors font-medium"
                  >
                    Оплатить
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={onTap}
          className="mt-3 w-full text-center text-sm text-purple-600 font-medium hover:text-purple-700 transition-colors"
        >
          Ещё {events.length - 3} событий →
        </button>
      )}
    </div>
  );
}

