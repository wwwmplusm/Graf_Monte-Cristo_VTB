import { ArrowLeft } from 'lucide-react';
import type { AppState } from '../data/mockAppState';

interface ProfileScreenProps {
    appState: AppState;
    onBack: () => void;
    onToggleBank: (bankId: string, enabled: boolean) => void;
}

export function ProfileScreen({ appState, onBack, onToggleBank }: ProfileScreenProps) {
    const banks = Object.entries(appState.user.banks_status || {}).map(([id, status]) => ({
        id,
        name: id === 'sberbank' ? 'Сбербанк' : id === 'vtb' ? 'ВТБ' : id === 'tinkoff' ? 'Т-Банк' : id === 'alpha' ? 'Альфа-Банк' : id,
        ...status
    }));

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <div className="max-w-lg mx-auto">
                <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-4 py-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onBack}
                            className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
                            aria-label="Назад"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h1 className="text-xl font-semibold text-gray-900">Профиль</h1>
                    </div>
                </div>
                <div className="p-4">
                    <div className="bg-white rounded-2xl p-8 text-center border border-gray-200 mb-4">
                        <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">{appState.user.name}</h2>
                        <p className="text-sm text-gray-600">{appState.user.id}</p>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl p-4 border border-gray-200">
                            <h3 className="font-medium text-gray-900 mb-4">Подключенные банки</h3>
                            <div className="space-y-4">
                                {banks.map((bank) => (
                                    <div key={bank.id} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${bank.id === 'sberbank' ? 'bg-green-100 text-green-600' :
                                                    bank.id === 'vtb' ? 'bg-blue-100 text-blue-600' :
                                                        bank.id === 'tinkoff' ? 'bg-yellow-100 text-yellow-600' :
                                                            'bg-gray-100 text-gray-600'
                                                }`}>
                                                {bank.name[0]}
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-900">{bank.name}</div>
                                                <div className="text-xs text-gray-500">{bank.status}</div>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={bank.enabled}
                                                onChange={(e) => onToggleBank(bank.id, e.target.checked)}
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-4 border border-gray-200">
                            <div className="font-medium text-gray-900">Стратегия</div>
                            <div className="text-sm text-gray-500 mt-1">{appState.onboarding.strategy}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
