import { useEffect, useState } from 'react';
import { OnboardingData } from './OnboardingScreen';

// Removed backend URL; using local demo users

interface DemoUser {
  id: string;
  name: string;
  original_client_id: string;
}

interface DemoUserSelectionScreenProps {
  onComplete: (data: OnboardingData) => void;
}

export function DemoUserSelectionScreen({ onComplete }: DemoUserSelectionScreenProps) {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load demo users from local dataset
    import('../data/demoUsers').then(module => {
      setUsers(module.demoUsers);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setError('Could not load demo users.');
      setLoading(false);
    });
  }, []);

  const handleSelectUser = (user: DemoUser) => {
    // Create a mock onboarding data structure for the selected user
    const data: OnboardingData = {
      user_profile: {
        user_id: user.id,
        display_name: user.name,
      },
      linked_banks: [
        { bank_id: 'sbank', name: 'Сбербанк', connected: true },
        { bank_id: 'vbank', name: 'ВТБ', connected: true }
      ],
      consents: [
        { bank_id: 'sbank', consent_id: 'demo-consent-s', status: 'approved' },
        { bank_id: 'vbank', consent_id: 'demo-consent-v', status: 'approved' }
      ],
      selected_products: [],
      goal: {
        type: 'close_debts',
        risk_mode: 'balanced',
        debts: { selected_loan_ids: [] }
      }
    };
    onComplete(data);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading demo users...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-4">
          <div className="text-red-500 text-xl mb-2">Error</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Выберите пользователя для демо
          </h1>
          <p className="text-lg text-gray-600">
            Данные будут загружены из подготовленного датасета
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => handleSelectUser(user)}
              className="bg-white overflow-hidden shadow rounded-2xl hover:shadow-lg transition-shadow duration-300 text-left group"
            >
              <div className="p-6">
                <div className="flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mb-4 group-hover:bg-purple-200 transition-colors">
                  <span className="text-2xl font-bold text-purple-600">
                    {user.name.charAt(0)}
                  </span>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                  {user.name}
                </h3>
                <p className="text-sm text-gray-500">
                  ID: {user.original_client_id || 'N/A'}
                </p>
              </div>
              <div className="bg-gray-50 px-6 py-3">
                <span className="text-sm font-medium text-purple-600 group-hover:text-purple-700">
                  Выбрать &rarr;
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
