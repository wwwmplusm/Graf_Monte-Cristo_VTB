# Credit Guard - Руководство по интеграции

## Обзор архитектуры

Приложение теперь полностью интегрировано с онбордингом и использует единое состояние данных.

### Навигация по потоку

```
Splash Screen (2 сек)
    ↓
Onboarding (5 шагов)
    ↓
Loading/Calculation Screen
    ↓
Home Screen (главное приложение)
    ↓
Детальные экраны (STS, Loans, Deposits, etc.)
```

## Структура данных

### OnboardingData (формируется в онбординге)

```typescript
{
  user_profile: {
    user_id: string,
    display_name: string
  },
  linked_banks: [{
    bank_id: string,
    name: string,
    connected: boolean
  }],
  consents: [{
    bank_id: string,
    consent_id: string,
    status: 'pending' | 'approved' | 'rejected'
  }],
  selected_products: [{
    bank_id: string,
    product_id: string,
    product_type: 'loan' | 'deposit' | 'card'
  }],
  goal: {
    type: 'close_debts' | 'save_money' | 'both',
    risk_mode: 'conservative' | 'balanced' | 'fast',
    save?: { amount_target, horizon },
    debts?: { selected_loan_ids[] }
  }
}
```

### AppState (используется в главном приложении)

```typescript
{
  mode: 'loans' | 'deposits',
  user: {
    id: string,
    name: string,
    consents: { [bankId]: consentId }
  },
  onboarding: {
    completed: boolean,
    strategy: 'консервативно' | 'сбалансировано' | 'агрессивно'
  },
  health: { score, status, reasons, next_action },
  sts: { today: { amount, spent }, tomorrow },
  loans: { summary, items[] },
  goals: { summary },
  deposits: { current, goal },
  balances: { total, total_debit },
  cards: [],
  timeline: [],
  offers: { refi[], deposits[] }
}
```

## Этапы потока

### 1. Splash Screen
- Показывается 2 секунды
- Автоматически переходит к онбордингу
- Файл: `/screens/SplashScreen.tsx`

### 2. Onboarding (5 шагов)

**Шаг 1: Информация о пользователе**
- User ID и имя
- Согласие с условиями
- Опция "Пропустить" (создает минимальный профиль)

**Шаг 2: Выбор банков**
- Отображает доступные банки
- Множественный выбор
- API: `GET /api/banks`

**Шаг 3: Подтверждение согласий**
- OAuth-подобный процесс для каждого банка
- Симулирует редирект и callback
- API: `POST /api/consents/:bankId`

**Шаг 4: Выбор продуктов**
- Загружает продукты из подключенных банков
- Выбор кредитов, вкладов, карт
- API: `GET /api/products?bank_id=xxx`

**Шаг 5: Цели и стратегия**
- Выбор цели: накопить / закрыть кредиты / оба
- Настройка суммы и скорости
- Показ прогноза результатов

### 3. Loading/Calculation Screen

- Симулирует загрузку данных:
  - Подключение к банкам (20%)
  - Загрузка счетов (40%)
  - Анализ транзакций (60%)
  - Расчёт метрик (80%)
  - Готово (100%)

- Генерирует `AppState` на основе `OnboardingData`:
  - Создает моковые loans, cards, deposits
  - Рассчитывает STS, MDP, ADP
  - Формирует health score
  - Создает timeline событий

### 4. Home Screen и детальные экраны

- Home отображает:
  - Приветствие с именем из `app_state.user.name`
  - Health Widget → `app_state.health`
  - STS Widget → `app_state.sts.today`
  - Loans/Deposits Widget → `app_state.loans` или `app_state.goals`
  - Debit Cards Widget → `app_state.balances.total_debit`

- Детальные экраны используют данные из `app_state`
- Никаких изменений в визуальном дизайне

## Охранная логика

### Проверка согласий
```typescript
const hasConsents = Object.keys(appState.user.consents).length > 0;
```
Если нет согласий → показываем баннер "Подключите банки"

### Проверка целей
```typescript
if (!appState.onboarding.completed) {
  // Показать CTA "Завершите настройку"
}
```

### Режим работы
```typescript
const mode = appState.mode; // 'loans' или 'deposits'
```
Определяет, какие виджеты и экраны показывать

## Пресеты для тестирования

### Preset A: Накопления
```javascript
// Создается когда в Step5 выбрано "save"
{
  mode: 'deposits',
  goal: { type: 'save_money', save: { amount_target: 150000 } },
  linked_banks: 2,
  sts.today > 0
}
```

### Preset B: Кредиты
```javascript
// Создается когда в Step5 выбрано "payoff"
{
  mode: 'loans',
  goal: { type: 'close_debts', risk_mode: 'fast' },
  linked_banks: 3,
  loans: 3 кредита,
  refinance_candidates: есть
}
```

## API Binding комментарии

В компонентах используются атрибуты для документации API:
```jsx
<div data-api-binding="balances.total_debit, cards[]">
  {/* Здесь отображается data из API endpoint */}
</div>
```

## Переходы между экранами

```javascript
// В App.tsx
handleNavigate('home')     // Главный экран
handleNavigate('sts')      // STS детали
handleNavigate('loans')    // Кредиты детали
handleNavigate('deposits') // Вклады детали
handleNavigate('cards')    // Карты
handleNavigate('refinance') // Рефинансирование
handleNavigate('profile')  // Профиль
```

## Компоненты

### Основные экраны
- `/screens/SplashScreen.tsx` - Заставка
- `/screens/OnboardingScreen.tsx` - Контейнер онбординга
- `/screens/LoadingCalcScreen.tsx` - Загрузка и расчёты
- `/screens/HomeScreen.tsx` - Главный экран
- `/screens/STSDetailScreen.tsx` - Детали STS
- `/screens/LoansDetailScreen.tsx` - Детали кредитов
- `/screens/DepositsDetailScreen.tsx` - Детали вкладов
- `/screens/RefinanceScreen.tsx` - Рефинансирование
- `/screens/CardsScreen.tsx` - Карты

### Шаги онбординга
- `/components/steps/Step1UserInfo.tsx`
- `/components/steps/Step2BankSelection.tsx`
- `/components/steps/Step3BankConsent.tsx`
- `/components/steps/Step4ProductSelection.tsx`
- `/components/steps/Step5Questions.tsx`

### Виджеты
- `/components/widgets/HealthWidget.tsx`
- `/components/widgets/STSWidget.tsx`
- `/components/widgets/LoansDepositsWidget.tsx`
- `/components/widgets/DebitCardsWidget.tsx`

## Запуск приложения

1. Приложение стартует со Splash Screen
2. Автоматически переходит к онбордингу
3. Пользователь проходит 5 шагов (или нажимает "Пропустить" на шаге 1)
4. Показывается Loading Screen с прогресс-баром
5. Автоматически переходит к Home Screen
6. Теперь доступна вся функциональность приложения

## Изменения в существующих файлах

### `/App.tsx`
- Добавлен state управления потоком (splash → onboarding → loading → app)
- Сохранение OnboardingData и AppState
- Роутинг между основными этапами

### `/data/mockAppState.ts`
- Обновлена структура AppState
- Добавлены поля `user` (id, name, consents)
- Обновлено поле `onboarding` (completed, strategy)

### `/screens/HomeScreen.tsx`
- Приветствие использует `appState.user.name`
- Проверка согласий обновлена

## Что НЕ изменилось

✅ Дизайн и верстка всех экранов сохранены  
✅ Логика виджетов не изменилась  
✅ Интеракции и переходы работают как раньше  
✅ Все компоненты UI (shadcn) работают без изменений  
✅ Стили и токены из globals.css применяются  

## Следующие шаги

1. Подключить реальные API вместо моков
2. Добавить обработку ошибок API
3. Реализовать сохранение состояния (localStorage/API)
4. Добавить возможность повторного прохождения онбординга
5. Реализовать обновление согласий банков
