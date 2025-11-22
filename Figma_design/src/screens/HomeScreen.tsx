import { LoansDepositsWidget } from '../components/widgets/LoansDepositsWidget';
import { DebitCardsWidget } from '../components/widgets/DebitCardsWidget';
import { STSWidget } from '../components/widgets/STSWidget';
import { formatCurrency } from '../utils/formatters';
import type { AppState } from '../data/mockAppState';

interface HomeScreenProps {
  appState: AppState;
  onNavigate: (screen: string) => void;
  onPayment: (type: 'mdp' | 'adp' | 'sdp') => void;
}

export function HomeScreen({ appState, onNavigate, onPayment }: HomeScreenProps) {
  const hasConsents = Object.keys(appState.user.consents).length > 0;

  if (!hasConsents) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center border border-gray-200">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Подключите банки</h2>
          <p className="text-sm text-gray-600 mb-6">
            Для начала работы подключите свои банковские счета через безопасное соединение
          </p>
          <button className="w-full py-3 px-6 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors">
            Подключить банки
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <h1 className="text-2xl font-semibold text-gray-900">Привет, {appState.user.name.split(' ')[0]}!</h1>
          <p className="text-sm text-gray-600 mt-1">Ваши финансы под контролем</p>
        </div>

        {/* Widgets */}
        <div className="p-4 space-y-4">
          <STSWidget sts={appState.sts} onTap={() => onNavigate('sts')} />

          <LoansDepositsWidget
            mode={appState.mode}
            loans={appState.loans}
            goals={appState.goals}
            onTap={() => onNavigate(appState.mode === 'loans' ? 'loans' : 'deposits')}
            onPayMDP={() => onPayment('mdp')}
            onPayADP={() => onPayment('adp')}
            onPaySDP={() => onPayment('sdp')}
          />

          {appState.analytics?.debtsByBank?.length ? (
            <div className="w-full bg-white rounded-2xl p-5 border border-gray-200">
              <div className="text-sm text-gray-500 mb-2">Долг по банкам</div>
              <div className="space-y-2">
                {appState.analytics.debtsByBank.map(item => (
                  <div key={item.bank} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{item.bank}</span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(item.total)} · {item.products} шт.
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <DebitCardsWidget
            balances={appState.balances}
            cards={appState.cards}
            onTap={() => onNavigate('cards')}
          />
        </div>
      </div>
    </div>
  );
}
