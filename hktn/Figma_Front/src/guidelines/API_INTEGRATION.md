# Руководство по интеграции с бэкендом

## Обзор изменений

Онбординг перестроен под API-контракты бэкенда. Все визуальные элементы и порядок шагов сохранены, добавлены только состояния loading/error/success и привязка к API-контрактам.

## Структура данных (onboardingState)

```typescript
interface OnboardingState {
  user_id: string;            // Технический ID (UUID/slug) - для API
  user_name: string;          // Имя для отображения
  banks: Array<{              // Динамический список банков
    id: string;
    name: string;
    connected: boolean;
  }>;
  selected_bank_ids: string[];  // Выбранные пользователем банки
  productsByBank: {             // Продукты по банкам
    [bankId: string]: Array<{
      id: string;
      type: string;
      name: string;
      consented: boolean;
      tos_url: string;
    }>;
  };
  goals: {                      // Финансовые цели
    mode: "save" | "close_loans" | "both" | null;
    save_amount: number | null;
    save_speed: "conservative" | "optimal" | "fast" | null;
    close_loan_ids: string[];
    close_speed: "conservative" | "optimal" | "fast" | null;
  };
  consents: {                   // Служебное для редиректов
    pending_consent_id: string | null;
    last_error: string | null;
  };
}
```

## Шаги онбординга

### Шаг 1: Данные пользователя

**Файл:** `/components/steps/Step1UserInfo.tsx`

**Изменения:**
- ✅ Добавлено поле `User ID` (технический идентификатор)
- ✅ Хинт: "Используется для API-запросов"
- ✅ Валидация: кнопка Continue заблокирована если user_id или user_name пустые

**Данные:**
- `user_id` → onboardingState.user_id
- `user_name` → onboardingState.user_name

### Шаг 2: Выбор банков

**Файл:** `/components/steps/Step2BankSelection.tsx`

**Изменения:**
- ✅ Динамический список банков (загрузка из onboardingState.banks)
- ✅ Состояния: loading (скелетоны), error (ErrorBanner), empty ("Банки недоступны")
- ✅ Чекбоксы привязаны к selected_bank_ids
- ✅ Сохранен визуал BankCard компонента

**API (будущая интеграция):**
```
GET /api/banks
Response: { banks: [{ id, name }] }
```

### Шаг 3: Согласие банка

**Файл:** `/components/steps/Step3BankConsent.tsx`

**Изменения:**
- ✅ Показывает прогресс (Банк X из Y)
- ✅ При нажатии "Выдать доступ" моделируется POST /api/consent/initiate
- ✅ Симулируется редирект на approval_url банка
- ✅ Переход на CallbackScreen после "редиректа"

**API (будущая интеграция):**
```
POST /api/consent/initiate
Body: { user_id, bank_id }
Response: { approval_url, consent_id }
→ Redirect to approval_url
```

### Callback: Возврат из банка

**Файл:** `/components/steps/CallbackScreen.tsx`

**Изменения:**
- ✅ Новый экран обработки возврата из банка
- ✅ Читает consent_id из параметров (в прототипе - мокается)
- ✅ Моделирует GET /api/consents/status
- ✅ При успехе помечает банк как connected
- ✅ Состояния: checking (загрузка), approved (успех), error (ошибка)

**API (будущая интеграция):**
```
GET /api/consents/status?user_id=xxx&consent_id=xxx
Response: { status: "approved" | "rejected", bank_id }
```

### Шаг 4: Выбор продуктов

**Файл:** `/components/steps/Step4ProductSelection.tsx`

**Изменения:**
- ✅ Динамическая загрузка продуктов для каждого подключённого банка
- ✅ Состояния: loading (скелетоны), error (ErrorBanner), success
- ✅ Продукты хранятся в productsByBank с полями: id, type, name, consented, tos_url
- ✅ Ссылка "Прочитать соглашение" использует tos_url
- ✅ Чекбокс продукта двигает consented: true/false

**API (будущая интеграция):**
```
GET /api/products?bank_id=xxx
Response: { products: [{ id, type, name, consented, tos_url }] }

POST /api/products/consent
Body: { user_id, items: [{ bank_id, product_id, consent: boolean }] }
```

### Шаг 5: Вопросы о целях

**Файл:** `/components/steps/Step5Questions.tsx`

**Изменения:**
- ✅ Возможность выбрать обе цели (накопить и закрыть кредиты)
- ✅ Привязка к структуре goals API
- ✅ mode: "save" | "close_loans" | "both"
- ✅ Поля для накоплений: save_amount, save_speed
- ✅ Поля для кредитов: close_loan_ids, close_speed
- ✅ Показывает комплексные результаты если выбраны обе цели

**API (будущая интеграция):**
```
POST /api/goals
Body: {
  user_id,
  mode: "save" | "close_loans" | "both",
  save: { amount, speed } | null,
  close: { loan_ids, speed } | null
}
```

### Финал: Обзор и завершение

**Файл:** `/components/steps/FinalSummary.tsx`

**Изменения:**
- ✅ Показывает резюме из onboardingState
- ✅ Подключённые банки (с connected: true)
- ✅ Выбранные продукты (с consented: true)
- ✅ Финансовые цели (goals)
- ✅ Кнопка "Завершить онбординг" моделирует POST /api/onboarding/commit
- ✅ Состояния: submitting (загрузка), error (ErrorBanner)

**API (будущая интеграция):**
```
POST /api/onboarding/commit
Body: {
  user_id,
  banks: [{ id, connected }],
  products: [{ bank_id, product_id, consent }],
  goals: { mode, save, close }
}
```

## Состояния UI

### Loading States
- **Banks**: Skeleton загрузка списка банков (3 скелетона)
- **Products**: Skeleton загрузка для каждого банка
- **Callback**: Спиннер "Проверяем статус подключения..."
- **Submit**: Кнопка с текстом "Сохранение..."

### Error States
- **ErrorBanner** с кнопкой "Повторить попытку"
- Используется на всех шагах где возможны ошибки
- Показывает специфичные сообщения для разных кодов ошибок

### Empty States
- **Banks Empty**: "Банки недоступны. Проверьте подключение к бэкенду"
- С кнопкой "Повторить попытку"

## Коды ошибок

Добавить обработку в реальной интеграции:

- **401/403**: "Авторизуйтесь и повторите"
- **404**: "Данные не найдены"
- **409**: "Конфликт операции, попробуйте позже"
- **424**: "Нет активных согласий, подключите банк"
- **429**: "Слишком много запросов, подождите"
- **5xx**: "Техническая ошибка, повторите позже"

## Сквозной сценарий

1. **Step 1** (User Info) → ввод user_id и user_name → Next
2. **Step 2** (Banks) → загрузка банков → выбор → Next
3. **Step 3** (Consent 1) → согласие → "Redirecting..." → **Callback** → банк помечен connected
4. **Step 3** (Consent 2) → согласие → "Redirecting..." → **Callback** → банк помечен connected
5. **Step 4** (Products) → загрузка продуктов → выбор → согласие → Next
6. **Step 5** (Goals) → выбор целей → ввод данных → расчёт → Next
7. **Summary** → проверка → "Завершить онбординг" → POST /api/onboarding/commit → Success

## Примеры интеграции

### Загрузка банков (Step2)

```typescript
const fetchBanks = async () => {
  setLoadingState("loading");
  
  try {
    const response = await fetch('/api/banks');
    const data = await response.json();
    
    setOnboardingState((prev) => ({
      ...prev,
      banks: data.banks.map(b => ({ ...b, connected: false })),
    }));
    
    setLoadingState("success");
  } catch (error) {
    setLoadingState("error");
  }
};
```

### Инициация согласия (Step3)

```typescript
const handleBankConsent = async (bankId: string) => {
  try {
    const response = await fetch('/api/consent/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        user_id: onboardingState.user_id, 
        bank_id: bankId 
      })
    });
    
    const { approval_url, consent_id } = await response.json();
    
    // Store consent_id
    setOnboardingState(prev => ({
      ...prev,
      consents: { ...prev.consents, pending_consent_id: consent_id }
    }));
    
    // Redirect to bank
    window.location.href = approval_url;
  } catch (error) {
    // Handle error
  }
};
```

### Проверка статуса (Callback)

```typescript
const checkConsentStatus = async () => {
  const params = new URLSearchParams(window.location.search);
  const consent_id = params.get('consent_id');
  
  try {
    const response = await fetch(
      `/api/consents/status?user_id=${userId}&consent_id=${consent_id}`
    );
    const data = await response.json();
    
    if (data.status === 'approved') {
      // Mark bank as connected
      setOnboardingState(prev => ({
        ...prev,
        banks: prev.banks.map(b =>
          b.id === data.bank_id ? { ...b, connected: true } : b
        ),
      }));
    }
  } catch (error) {
    // Handle error
  }
};
```

## Компоненты

### Новые компоненты
- `/components/steps/CallbackScreen.tsx` - обработка возврата из банка

### Обновлённые компоненты
- `/App.tsx` - новая структура onboardingState
- `/components/steps/Step1UserInfo.tsx` - добавлено поле user_id
- `/components/steps/Step2BankSelection.tsx` - динамическая загрузка банков
- `/components/steps/Step3BankConsent.tsx` - прогресс и симуляция редиректа
- `/components/steps/Step4ProductSelection.tsx` - динамическая загрузка продуктов
- `/components/steps/Step5Questions.tsx` - структура goals для API
- `/components/steps/FinalSummary.tsx` - обновлено под onboardingState

### Переиспользуемые компоненты
- `/components/ErrorBanner.tsx` - баннер ошибки с ретраем
- `/components/StatusChip.tsx` - чип статуса банка
- `/components/ui/skeleton.tsx` - скелетоны загрузки
- `/components/BankCard.tsx` - карточка банка с чекбоксом
- `/components/ProductRow.tsx` - строка продукта с чекбоксом

## Что НЕ изменилось

✅ Порядок экранов (5 шагов + summary)
✅ Визуальный стиль (все Color/Text Styles)
✅ Макеты и Auto Layout
✅ Выбор финансовых инструментов
✅ Выбор целей (накопление и погашение кредитов)
✅ Тексты и ссылки на соглашения
✅ Адаптивность (desktop/tablet/mobile)
✅ Поддержка light/dark тем

## Готовность к интеграции

Онбординг полностью готов к интеграции с бэкендом:

1. ✅ Все поля соответствуют контрактам API
2. ✅ Состояния loading/error/success везде где нужно
3. ✅ Mock-данные легко заменить на реальные API-вызовы
4. ✅ Обработка ошибок с кодами
5. ✅ Сохранён весь функционал и визуал

Для реальной интеграции нужно только заменить mock-функции на реальные fetch-вызовы согласно примерам выше.
