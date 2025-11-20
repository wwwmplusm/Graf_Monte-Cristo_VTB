import { CreditCard, RefreshCw, User } from 'lucide-react';

interface BottomNavProps {
  currentScreen: string;
  onNavigate: (screen: string) => void;
  mode: 'loans' | 'deposits';
}

export function BottomNav({ currentScreen, onNavigate, mode }: BottomNavProps) {
  // According to requirements: Loans|Deposits / Refinance / Profile
  // Home is NOT a tab - it's the first screen when opening the app
  const navItems = [
    { 
      id: mode === 'loans' ? 'loans' : 'deposits', 
      label: mode === 'loans' ? 'Кредиты' : 'Вклады', 
      icon: CreditCard 
    },
    { id: 'refinance', label: 'Рефинанс', icon: RefreshCw },
    { id: 'profile', label: 'Профиль', icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-bg-primary)] border-t border-[var(--color-stroke-divider)] z-50">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            // Check if current screen matches this nav item
            const isActive = currentScreen === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
                  isActive
                    ? 'text-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] bg-opacity-10'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]'
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
