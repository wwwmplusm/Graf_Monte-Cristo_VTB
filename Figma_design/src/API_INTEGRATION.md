# API Integration Guide

Руководство по интеграции Credit Guard с реальным backend API.

## 📡 Основные эндпоинты

### Аутентификация и доступы

```typescript
// Получить статус согласий пользователя
GET /api/v1/user/consents
Response: {
  [bankId: string]: 'granted' | 'pending' | 'denied'
}

// Подключить новый банк
POST /api/v1/user/consents
Body: {
  bankId: string
  redirectUrl: string
}
Response: {
  consentUrl: string  // URL для редиректа
  consentId: string
}
```

### Балансы и карты

```typescript
// Получить общий баланс и карты
GET /api/v1/balances
Response: {
  total: number
  total_debit: number
  cards: Array<{
    id: string
    bank: string
    mask: string
    balance: number
    holds: number
    type: 'debit' | 'credit'
  }>
}

// Обновить балансы (принудительная синхронизация)
POST /api/v1/balances/refresh
Response: {
  status: 'syncing' | 'completed'
  timestamp: string
}
```

### Safe to Spend (STS)

```typescript
// Получить текущий STS
GET /api/v1/sts/today
Response: {
  amount: number        // Доступно сегодня
  spent: number        // Потрачено
  tomorrow: {
    impact: string     // Текстовое описание прогноза
    amount: number     // Прогноз на завтра
  }
}

// Пересчитать STS после операции
POST /api/v1/sts/recalculate
Body: {
  reason: 'payment' | 'income' | 'manual'
  amount?: number
}
Response: {
  new_sts: number
  previous_sts: number
  diff: number
}
```

### Кредиты

```typescript
// Получить сводку по кредитам
GET /api/v1/loans/summary
Response: {
  total_outstanding: number
  mandatory_daily_payment: number
  additional_daily_payment: number
  total_monthly_payment: number
}

// Получить список кредитов
GET /api/v1/loans
Response: {
  items: Array<{
    id: string
    bank: string
    type: string
    balance: number
    rate: number
    monthly_payment: number
    maturity_date: string
    priority: number
  }>
}

// Оплатить обязательный дневной платёж
POST /api/v1/loans/pay/mdp
Body: {
  amount: number
  loanIds?: string[]  // Опционально: конкретные кредиты
}
Response: {
  success: boolean
  transaction_id: string
  new_balance: number
}

// Оплатить дополнительный платёж
POST /api/v1/loans/pay/adp
Body: {
  amount: number
  loanIds?: string[]
}
Response: {
  success: boolean
  transaction_id: string
  new_balance: number
  interest_saved: number
}
```

### Накопления и вклады

```typescript
// Получить текущий вклад
GET /api/v1/deposits/current
Response: {
  id: string
  bank: string
  product: string
  rate: number
  balance: number
  capitalization: boolean
  withdrawable: boolean
  maturity_date: string
}

// Получить сводку по целям
GET /api/v1/goals/summary
Response: {
  total_saved: number
  daily_payment: number
  target: number
  target_date: string
}

// Пополнить накопления
POST /api/v1/deposits/pay/sdp
Body: {
  amount: number
  depositId: string
}
Response: {
  success: boolean
  transaction_id: string
  new_balance: number
  interest_earned: number
}
```

### Финансовое здоровье

```typescript
// Получить показатель финздоровья
GET /api/v1/health
Response: {
  score: number                    // 0-100
  status: 'спокойно' | 'внимание' | 'нужен план'
  reasons: string[]                // Причины изменения
  next_action: {
    type: 'refinance' | 'pay_mdp' | 'pay_sdp' | 'save_more'
    label: string
  } | null
  factors: Array<{
    name: string
    value: number
    weight: number
    impact: 'positive' | 'neutral' | 'negative'
  }>
}
```

### Таймлайн событий

```typescript
// Получить события на N дней
GET /api/v1/timeline?days=30
Response: {
  events: Array<{
    date: string                    // ISO 8601
    type: 'loan_payment' | 'deposit_due' | 'reminder' | 'income'
    title: string
    amount: number
    can_defer: number               // Сумма, которую можно отложить
    loan_id?: string
    deposit_id?: string
  }>
}

// Отложить событие
POST /api/v1/timeline/defer
Body: {
  eventId: string
  deferDays: number
  deferAmount: number
}
Response: {
  success: boolean
  new_date: string
}
```

### Рефинансирование

```typescript
// Получить офферы рефинансирования
GET /api/v1/refinance/offers?type=loans
Query params:
  - type: 'loans' | 'deposits'
  - loanIds: string[]              // Для рефинанса конкретных кредитов
Response: {
  offers: Array<{
    id: string
    bank: string
    rate: number
    term_months: number
    monthly_payment: number
    commission: number
    savings: number                 // Экономия за весь срок
    breakeven_months: number        // Окупаемость комиссии
    requirements: {
      min_credit_score?: number
      min_income?: number
      kyc_level: 'basic' | 'full'
    }
  }>
}

// Подать заявку на рефинансирование
POST /api/v1/refinance/apply
Body: {
  offerId: string
  loanIds: string[]                // Какие кредиты рефинансировать
  amount: number
}
Response: {
  applicationId: string
  status: 'pending' | 'docs_required' | 'approved' | 'declined'
  statusUrl: string                // URL для проверки статуса
}

// Проверить статус заявки
GET /api/v1/refinance/applications/:id
Response: {
  status: 'pending' | 'docs_required' | 'approved' | 'declined'
  created_at: string
  updated_at: string
  bank: string
  amount: number
  next_steps?: string[]
  documents_required?: Array<{
    type: string
    description: string
  }>
}

// Получить офферы вкладов
GET /api/v1/deposits/offers
Response: {
  offers: Array<{
    id: string
    bank: string
    product: string
    rate: number
    ear: number                     // Effective Annual Rate
    term_months: number
    capitalization: string
    min_amount: number
    max_amount?: number
    withdrawable: boolean
    early_withdrawal_penalty?: number
    requirements: {
      kyc_level: 'basic' | 'full'
    }
  }>
}
```

### Онбординг и настройки

```typescript
// Получить стратегию пользователя
GET /api/v1/onboarding/strategy
Response: {
  strategy: 'консервативно' | 'сбалансировано' | 'быстро'
  goal: 'закрыть кредиты' | 'накопить'
  created_at: string
}

// Обновить стратегию
PUT /api/v1/onboarding/strategy
Body: {
  strategy: 'консервативно' | 'сбалансировано' | 'быстро'
}
Response: {
  success: boolean
  recalculated: {
    adp_new: number
    sdp_new: number
  }
}
```

## 🔄 Webhook уведомления

Backend может отправлять webhook уведомления для обновления UI в реальном времени:

```typescript
// Webhook payload
POST /client/webhook
Body: {
  type: 'balance_updated' | 'payment_completed' | 'application_status_changed'
  timestamp: string
  data: {
    // Зависит от типа события
  }
}

// Обработка в приложении
window.addEventListener('creditguard:webhook', (event) => {
  const { type, data } = event.detail;
  
  if (type === 'balance_updated') {
    // Обновить балансы и пересчитать STS
    refreshBalances();
    recalculateSTS();
  }
  
  if (type === 'payment_completed') {
    // Показать toast уведомление
    toast.success('Платёж выполнен успешно');
  }
  
  if (type === 'application_status_changed') {
    // Обновить статус заявки
    updateApplicationStatus(data.applicationId, data.status);
  }
});
```

## 🔐 Аутентификация

Используйте Bearer token для всех запросов:

```typescript
const headers = {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json'
};
```

## ⚠️ Обработка ошибок

Все эндпоинты возвращают ошибки в едином формате:

```typescript
Response (4xx, 5xx): {
  error: {
    code: string              // Машинно-читаемый код
    message: string           // Человеко-читаемое сообщение
    details?: any            // Дополнительная информация
  }
}

// Примеры кодов ошибок
'INSUFFICIENT_BALANCE'        // Недостаточно средств
'CONSENT_REQUIRED'           // Требуется согласие банка
'INVALID_AMOUNT'             // Некорректная сумма
'LOAN_NOT_FOUND'             // Кредит не найден
'APPLICATION_ALREADY_EXISTS' // Заявка уже существует
'BANK_API_ERROR'             // Ошибка API банка
'RATE_LIMIT_EXCEEDED'        // Превышен лимит запросов
```

## 🎯 Action Hooks для UI

В компонентах используются data-атрибуты для связи с API:

```typescript
// В HomeScreen.tsx
const handlePayMDP = async () => {
  try {
    const response = await fetch('/api/v1/loans/pay/mdp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        amount: appState.loans.summary.mandatory_daily_payment
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // Обновить state
      setAppState(prev => ({
        ...prev,
        loans: {
          ...prev.loans,
          summary: {
            ...prev.loans.summary,
            total_outstanding: data.new_balance
          }
        }
      }));
      
      // Пересчитать STS
      await recalculateSTS('payment', amount);
      
      toast.success('Платёж выполнен успешно');
    }
  } catch (error) {
    toast.error('Ошибка при выполнении платежа');
  }
};
```

## 📊 Polling и синхронизация

Для некоторых операций требуется polling статуса:

```typescript
// Polling статуса заявки
const pollApplicationStatus = async (applicationId: string) => {
  const maxAttempts = 30;
  let attempts = 0;
  
  const poll = async () => {
    if (attempts >= maxAttempts) {
      throw new Error('Timeout waiting for application status');
    }
    
    const response = await fetch(`/api/v1/refinance/applications/${applicationId}`, {
      headers
    });
    
    const data = await response.json();
    
    if (data.status === 'pending') {
      attempts++;
      setTimeout(poll, 2000);  // Опрашиваем каждые 2 секунды
    } else {
      // Статус изменился
      return data;
    }
  };
  
  return poll();
};
```

## 🧪 Mock режим для разработки

Для разработки без реального backend используйте файлы mock-данных:

```typescript
// В App.tsx
const USE_MOCK_DATA = process.env.REACT_APP_USE_MOCK === 'true';

const fetchBalances = async () => {
  if (USE_MOCK_DATA) {
    return mockAppState.balances;
  }
  
  const response = await fetch('/api/v1/balances', { headers });
  return response.json();
};
```

## 🔗 Интеграция с Open Banking

Для подключения банков через Open Banking API:

1. Получить consent URL от backend
2. Редирект пользователя на страницу банка
3. После авторизации банк редиректит обратно с кодом
4. Backend обменивает код на access token
5. Backend периодически синхронизирует данные

```typescript
// Инициация подключения банка
const connectBank = async (bankId: string) => {
  const response = await fetch('/api/v1/user/consents', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      bankId,
      redirectUrl: `${window.location.origin}/callback`
    })
  });
  
  const { consentUrl } = await response.json();
  
  // Редирект на страницу банка
  window.location.href = consentUrl;
};

// Callback после авторизации
// /callback?code=xxx&state=yyy
const handleCallback = async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  
  if (code) {
    // Backend автоматически обработает код и создаст согласие
    // Просто обновляем список согласий
    await refreshConsents();
  }
};
```

## 📱 Push уведомления

Для push-уведомлений используйте FCM/APNs:

```typescript
// Регистрация токена устройства
POST /api/v1/notifications/register
Body: {
  token: string
  platform: 'ios' | 'android' | 'web'
}

// Типы уведомлений
- payment_due           // Приближается срок платежа
- payment_completed     // Платёж выполнен
- application_approved  // Заявка одобрена
- balance_low          // Низкий баланс STS
- refinance_opportunity // Появилась возможность рефинанса
```

## 🎨 Best Practices

1. **Оптимистичные обновления** - обновляйте UI сразу, откатывайте при ошибке
2. **Кеширование** - кешируйте данные локально, синхронизируйте фоном
3. **Retry механизмы** - автоматически повторяйте неудачные запросы
4. **Offline режим** - показывайте закешированные данные офлайн
5. **Loading states** - всегда показывайте состояние загрузки
6. **Error handling** - понятные сообщения об ошибках пользователю

## 📚 Дополнительные ресурсы

- [Open Banking API Documentation](https://www.openbanking.org.uk/)
- [PSD2 Compliance Guide](https://ec.europa.eu/info/law/payment-services-psd-2-directive-eu-2015-2366_en)
- [API Security Best Practices](https://owasp.org/www-project-api-security/)
