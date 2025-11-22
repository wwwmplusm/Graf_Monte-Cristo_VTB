import { Home, CreditCard, RefreshCw, User } from 'lucide-react';

interface BottomNavProps {
  currentScreen: string;
  onNavigate: (screen: string) => void;
  mode: 'loans' | 'deposits';
}

export function BottomNav({ currentScreen, onNavigate, mode }: BottomNavProps) {
  const navItems = [
    { id: 'home', label: 'Главная', icon: Home },
    { 
      id: mode === 'loans' ? 'loans' : 'deposits', 
      label: mode === 'loans' ? 'Долги' : 'Вклады', 
      icon: CreditCard 
    },
    { id: 'refinance', label: 'Офферы', icon: RefreshCw },
    { id: 'profile', label: 'Профиль', icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
                  isActive
                    ? 'text-purple-600 bg-purple-50'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}