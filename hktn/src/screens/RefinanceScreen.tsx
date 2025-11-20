import { ArrowLeft, TrendingDown, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/formatters';
import { getRefinanceOffers, applyRefinance, type RefinanceOffer } from '../utils/api';
import type { AppState } from '../data/mockAppState';

interface RefinanceScreenProps {
  appState: AppState;
  onBack: () => void;
}

export function RefinanceScreen({ appState, onBack }: RefinanceScreenProps) {
  const [selectedOffer, setSelectedOffer] = useState<string | null>(null);
  const [applicationStatus, setApplicationStatus] = useState<'idle' | 'pending' | 'approved' | 'declined'>('idle');
  const [offers, setOffers] = useState<RefinanceOffer[]>([]);
  const [loading, setLoading] = useState(true);

  const isLoansMode = appState.mode === 'loans';

  useEffect(() => {
    const loadOffers = async () => {
      if (!isLoansMode) {
        // Для режима deposits пока используем mock данные
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const response = await getRefinanceOffers(appState.user.id);
        setOffers(response.offers || []);
      } catch (error) {
        console.error('Failed to load refinance offers:', error);
        setOffers([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadOffers();
  }, [appState.user.id, isLoansMode]);

  const handleSelectOffer = (offerId: string) => {
    setSelectedOffer(offerId);
  };

  const handleSubmitApplication = async () => {
    if (!selectedOffer) return;
    
    setApplicationStatus('pending');
    try {
      const result = await applyRefinance({
        user_id: appState.user.id,
        offer_id: selectedOffer,
        loan_ids: [], // TODO: получить из выбранного оффера
        phone: '+7 (999) 123-45-67', // TODO: получить из профиля
      });
      
      if (result.status === 'approved') {
        setApplicationStatus('approved');
      } else {
        setApplicationStatus('declined');
      }
    } catch (error) {
      console.error('Failed to submit refinance application:', error);
      setApplicationStatus('declined');
    }
  };

  if (applicationStatus === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center border border-gray-200">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Отправка заявки</h2>
          <p className="text-sm text-gray-600">
            Ожидаем ответ от банка...
          </p>
        </div>
      </div>
    );
  }

  if (applicationStatus === 'approved') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center border border-gray-200">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Заявка одобрена!</h2>
          <p className="text-sm text-gray-600 mb-6">
            Ваши обязательства будут обновлены, и STS пересчитан автоматически
          </p>
          <button
            onClick={onBack}
            className="w-full py-3 px-6 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
            data-action="refresh_balances(), recalc_sts()"
          >
            Вернуться на главную
          </button>
        </div>
      </div>
    );
  }

  if (applicationStatus === 'declined') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center border border-gray-200">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Заявка отклонена</h2>
          <p className="text-sm text-gray-600 mb-6">
            К сожалению, банк отклонил заявку. Попробуйте другие предложения
          </p>
          <button
            onClick={() => {
              setApplicationStatus('idle');
              setSelectedOffer(null);
            }}
            className="w-full py-3 px-6 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
          >
            Посмотреть другие офферы
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Назад"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-semibold text-gray-900">
              {isLoansMode ? 'Рефинансирование' : 'Лучшие вклады'}
            </h1>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Info banner */}
          <div className="bg-purple-50 rounded-2xl p-4 border border-purple-200/50">
            <div className="text-sm font-medium text-gray-900 mb-1">
              {isLoansMode ? 'Снизьте переплату по кредитам' : 'Увеличьте доходность'}
            </div>
            <div className="text-xs text-gray-600">
              {isLoansMode 
                ? 'Мы нашли предложения с более выгодными условиями для вас'
                : 'Рассмотрите вклады с более высокой ставкой и лучшими условиями'
              }
            </div>
          </div>

          {/* Offers list */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
            </div>
          ) : offers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {isLoansMode 
                ? 'Нет доступных предложений рефинансирования'
                : 'Нет доступных предложений по вкладам'
              }
            </div>
          ) : (
            <div className="space-y-3">
              {isLoansMode ? (
                // Loan refinancing offers
                offers.map((offer) => (
                <button
                  key={offer.id}
                  onClick={() => handleSelectOffer(offer.id)}
                  className={`w-full text-left bg-white rounded-2xl p-5 border-2 transition-all ${
                    selectedOffer === offer.id
                      ? 'border-purple-500 shadow-lg'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  data-api-binding="offers.refi[]"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-gray-900 mb-1">{offer.bank}</div>
                      <div className="text-xs text-gray-500">Рефинансирование</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold text-purple-600">
                        {offer.rate}%
                      </div>
                      <div className="text-xs text-gray-500">{offer.term_months} мес.</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Ежемесячно</div>
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(offer.monthly_payment)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Комиссия</div>
                      <div className="font-semibold text-gray-900">
                        {offer.commission > 0 ? formatCurrency(offer.commission) : 'Без комиссии'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-green-600">
                        <TrendingDown className="w-4 h-4" />
                        <span className="font-medium">Экономия {formatCurrency(offer.savings)}</span>
                      </div>
                      {offer.breakeven_months > 0 && (
                        <div className="text-xs text-gray-500">
                          Окупается за {offer.breakeven_months} мес.
                        </div>
                      )}
                    </div>
                  </div>
                </button>
                ))
              ) : (
                // Deposit offers (mock для deposits режима)
                (appState.offers.deposits || []).map((offer) => (
                <button
                  key={offer.id}
                  onClick={() => handleSelectOffer(offer.id)}
                  className={`w-full text-left bg-white rounded-2xl p-5 border-2 transition-all ${
                    selectedOffer === offer.id
                      ? 'border-purple-500 shadow-lg'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  data-api-binding="offers.deposits[]"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-gray-900 mb-1">{offer.bank}</div>
                      <div className="text-xs text-gray-500">{offer.product}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold text-green-600">
                        {offer.rate}%
                      </div>
                      <div className="text-xs text-gray-500">EAR {offer.ear}%</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Срок</div>
                      <div className="font-semibold text-gray-900">
                        {offer.term_months} мес.
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Минимум</div>
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(offer.min_amount)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-600 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      <span>{offer.capitalization}</span>
                    </div>
                    {offer.withdrawable && (
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                        <span>Можно снимать</span>
                      </div>
                    )}
                  </div>
                </button>
                ))
              )}
            </div>
          )}

          {/* Submit button */}
          {selectedOffer && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
              <div className="max-w-lg mx-auto">
                <button
                  onClick={handleSubmitApplication}
                  className="w-full py-4 px-6 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-lg"
                  data-action="submit_refi_application(offer_id)"
                >
                  Подать заявку
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
