// Mock data for ФинПульс app
export interface AppState {
  mode: 'loans' | 'deposits';
  user: {
    id: string;
    name: string;
    consents: {
      [bankId: string]: string;
    };
    banks_status: Record<string, { status: string; enabled: boolean }>;
  };
  onboarding: {
    completed: boolean;
    strategy: 'консервативно' | 'сбалансировано' | 'агрессивно';
  };
  health: {
    score: number;
    status: 'спокойно' | 'внимание' | 'нужен план';
    reasons: string[];
    next_action: {
      type: 'refinance' | 'pay_mdp' | 'pay_sdp' | 'save_more';
      label: string;
    } | null;
  };
  sts: {
    today: {
      amount: number;
      spent: number;
    };
    tomorrow: {
      impact: string;
    };
  };
  loans: {
    summary: {
      total_outstanding: number;
      mandatory_daily_payment: number;
      additional_daily_payment: number;
    };
    items: Array<{
      id: string;
      bank: string;
      type: string;
      balance: number;
      rate: number;
      monthly_payment: number;
      maturity_date: string;
      priority: number;
    }>;
  };
  goals: {
    summary: {
      total_saved: number;
      daily_payment: number;
      target: number;
      target_date: string;
    };
  };
  deposits: {
    current: {
      id: string;
      bank: string;
      product: string;
      rate: number;
      balance: number;
      capitalization: boolean;
      withdrawable: boolean;
      maturity_date: string;
    } | null;
    goal: {
      target_amount: number;
      horizon_months: number;
      liquidity: 'full' | 'partial' | 'locked';
    };
  };
  balances: {
    total: number;
    total_debit: number;
  };
  cards: Array<{
    id: string;
    bank: string;
    mask: string;
    balance: number;
    holds: number;
    type: 'debit' | 'credit';
  }>;
  timeline: Array<{
    date: string;
    type: 'loan_payment' | 'deposit_due' | 'reminder';
    title: string;
    amount: number;
    can_defer: number;
  }>;
  analytics?: {
    debtsByBank: Array<{ bank: string; total: number; products: number }>;
    balancesByBank: Array<{ bank: string; total: number; accounts: number }>;
    refinance?: {
      currentDebt: number;
      loansCount: number;
      weightedRate: number;
      proposedRate: number;
      currentMonthly: number;
      newMonthly: number;
      savingsTotal: number;
      termMonths: number;
    };
  };
  offers: {
    refi: Array<{
      id: string;
      bank: string;
      rate: number;
      term_months: number;
      monthly_payment: number;
      commission: number;
      savings: number;
      breakeven_months: number;
    }>;
    deposits: Array<{
      id: string;
      bank: string;
      product: string;
      rate: number;
      ear: number;
      term_months: number;
      capitalization: string;
      min_amount: number;
      withdrawable: boolean;
    }>;
  };
  applications: {
    [offerId: string]: {
      status: 'pending' | 'approved' | 'docs_required' | 'declined';
      created_at: string;
    };
  };
}

export const mockAppState: AppState = {
  mode: 'loans',
  user: {
    id: 'demo-user',
    name: 'Иван Иванов',
    consents: {
      sberbank: 'consent-sb-001',
      vtb: 'consent-vtb-001',
      tinkoff: 'consent-tf-001',
    },
    banks_status: {
      sberbank: { status: 'Active', enabled: true },
      vtb: { status: 'Active', enabled: true },
      tinkoff: { status: 'Active', enabled: true },
    },
  },
  onboarding: {
    completed: true,
    strategy: 'сбалансировано',
  },
  health: {
    score: 72,
    status: 'спокойно',
    reasons: ['STS выше 40%', 'Долг снизился на 5%'],
    next_action: {
      type: 'pay_mdp',
      label: 'Оплатить обязательный платёж',
    },
  },
  sts: {
    today: {
      amount: 12500,
      spent: 2300,
    },
    tomorrow: {
      impact: '+1 200 ₽ после платежа',
    },
  },
  loans: {
    summary: {
      total_outstanding: 450000,
      mandatory_daily_payment: 850,
      additional_daily_payment: 1200,
    },
    items: [
      {
        id: 'loan1',
        bank: 'Сбербанк',
        type: 'Потребительский',
        balance: 180000,
        rate: 12.5,
        monthly_payment: 8500,
        maturity_date: '2026-05-15',
        priority: 1,
      },
      {
        id: 'loan2',
        bank: 'ВТБ',
        type: 'Кредитная карта',
        balance: 150000,
        rate: 24.9,
        monthly_payment: 6000,
        maturity_date: '2025-12-01',
        priority: 2,
      },
      {
        id: 'loan3',
        bank: 'Тинькофф',
        type: 'Рассрочка',
        balance: 120000,
        rate: 0,
        monthly_payment: 10000,
        maturity_date: '2025-08-01',
        priority: 3,
      },
    ],
  },
  goals: {
    summary: {
      total_saved: 0,
      daily_payment: 0,
      target: 0,
      target_date: '',
    },
  },
  deposits: {
    current: null,
    goal: {
      target_amount: 0,
      horizon_months: 0,
      liquidity: 'full',
    },
  },
  balances: {
    total: 85000,
    total_debit: 85000,
  },
  cards: [
    {
      id: 'card1',
      bank: 'Сбербанк',
      mask: '•• 4356',
      balance: 45000,
      holds: 2500,
      type: 'debit',
    },
    {
      id: 'card2',
      bank: 'Тинькофф',
      mask: '•• 7821',
      balance: 32000,
      holds: 0,
      type: 'debit',
    },
    {
      id: 'card3',
      bank: 'Альфа-Банк',
      mask: '•• 1234',
      balance: 8000,
      holds: 500,
      type: 'debit',
    },
  ],
  timeline: [
    {
      date: '2025-11-10',
      type: 'loan_payment',
      title: 'Платёж Сбербанк',
      amount: 8500,
      can_defer: 2500,
    },
    {
      date: '2025-11-15',
      type: 'loan_payment',
      title: 'Платёж ВТБ',
      amount: 6000,
      can_defer: 0,
    },
    {
      date: '2025-11-20',
      type: 'reminder',
      title: 'Пополнить STS',
      amount: 5000,
      can_defer: 5000,
    },
    {
      date: '2025-11-25',
      type: 'loan_payment',
      title: 'Платёж Тинькофф',
      amount: 10000,
      can_defer: 0,
    },
  ],
  offers: {
    refi: [
      {
        id: 'refi1',
        bank: 'Райффайзенбанк',
        rate: 9.9,
        term_months: 36,
        monthly_payment: 7200,
        commission: 5000,
        savings: 45000,
        breakeven_months: 8,
      },
      {
        id: 'refi2',
        bank: 'Газпромбанк',
        rate: 11.5,
        term_months: 24,
        monthly_payment: 9500,
        commission: 0,
        savings: 28000,
        breakeven_months: 12,
      },
    ],
    deposits: [
      {
        id: 'dep1',
        bank: 'Сбербанк',
        product: 'Пополняй',
        rate: 18.5,
        ear: 19.2,
        term_months: 12,
        capitalization: 'ежемесячно',
        min_amount: 1000,
        withdrawable: true,
      },
      {
        id: 'dep2',
        bank: 'ВТБ',
        product: 'Накопительный',
        rate: 17.0,
        ear: 17.5,
        term_months: 6,
        capitalization: 'ежедневно',
        min_amount: 10000,
        withdrawable: false,
      },
    ],
  },
  applications: {},
};

export const mockAppStateDeposits: AppState = {
  mode: 'deposits',
  user: {
    id: 'demo-user',
    name: 'Иван Иванов',
    consents: {
      sberbank: 'consent-sb-001',
      vtb: 'consent-vtb-001',
    },
    banks_status: {
      sberbank: { status: 'Active', enabled: true },
      vtb: { status: 'Active', enabled: true },
    },
  },
  onboarding: {
    completed: true,
    strategy: 'сбалансировано',
  },
  health: {
    score: 68,
    status: 'внимание',
    reasons: ['Цель близка', 'Низкий темп накопления'],
    next_action: {
      type: 'save_more',
      label: 'Увеличить ежедневное пополнение',
    },
  },
  sts: {
    today: {
      amount: 8500,
      spent: 1200,
    },
    tomorrow: {
      impact: '−500 ₽ после пополнения',
    },
  },
  loans: {
    summary: {
      total_outstanding: 0,
      mandatory_daily_payment: 0,
      additional_daily_payment: 0,
    },
    items: [],
  },
  goals: {
    summary: {
      total_saved: 320000,
      daily_payment: 1500,
      target: 500000,
      target_date: '2026-06-01',
    },
  },
  deposits: {
    current: {
      id: 'dep_current',
      bank: 'Сбербанк',
      product: 'Пополняй',
      rate: 18.5,
      balance: 320000,
      capitalization: true,
      withdrawable: true,
      maturity_date: '2026-06-01',
    },
    goal: {
      target_amount: 500000,
      horizon_months: 18,
      liquidity: 'partial',
    },
  },
  balances: {
    total: 65000,
    total_debit: 65000,
  },
  cards: [
    {
      id: 'card1',
      bank: 'Сбербанк',
      mask: '•• 4356',
      balance: 45000,
      holds: 2500,
      type: 'debit',
    },
    {
      id: 'card2',
      bank: 'Тинькофф',
      mask: '•• 7821',
      balance: 20000,
      holds: 0,
      type: 'debit',
    },
  ],
  timeline: [
    {
      date: '2025-11-10',
      type: 'deposit_due',
      title: 'Пополнение вклада',
      amount: 1500,
      can_defer: 1500,
    },
    {
      date: '2025-11-20',
      type: 'reminder',
      title: 'Капитализация процентов',
      amount: 5200,
      can_defer: 0,
    },
  ],
  offers: {
    refi: [],
    deposits: [
      {
        id: 'dep1',
        bank: 'ВТБ',
        product: 'Накопительный счёт',
        rate: 19.0,
        ear: 20.1,
        term_months: 12,
        capitalization: 'ежедневно',
        min_amount: 50000,
        withdrawable: true,
      },
      {
        id: 'dep2',
        bank: 'Альфа-Банк',
        product: 'Альфа-Вклад',
        rate: 18.0,
        ear: 18.8,
        term_months: 24,
        capitalization: 'ежемесячно',
        min_amount: 100000,
        withdrawable: false,
      },
    ],
  },
  applications: {},
};
