import { CreditCard, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import type { AppState } from '../../data/mockAppState';

interface DebitCardsWidgetProps {
  balances: AppState['balances'];
  cards: AppState['cards'];
  onTap: () => void;
}

export function DebitCardsWidget({ balances, cards, onTap }: DebitCardsWidgetProps) {
  const debitCards = cards.filter(c => c.type === 'debit');

  return (
    <button
      onClick={onTap}
      className="w-full bg-white rounded-2xl p-5 border border-gray-200 hover:shadow-lg transition-shadow text-left"
      data-api-binding="balances.total_debit, cards[]"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm text-gray-500 mb-1">Единая картина денег</div>
          <div className="text-2xl font-semibold text-gray-900">
            {formatCurrency(balances.total_debit)}
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-gray-400 mt-1" />
      </div>

      <div className="text-xs text-gray-500">
        {debitCards.length} {debitCards.length === 1 ? 'карта' : debitCards.length < 5 ? 'карты' : 'карт'}
      </div>
    </button>
  );
}
