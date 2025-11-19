# 🎯 План доработки для максимизации баллов на хакатоне

**Дата**: 2025-01-20  
**Цель**: Довести код до идеального состояния согласно требованиям хакатона

---

## 📋 Анализ текущего состояния

### ✅ Что уже реализовано хорошо:

1. **Backend API**:
   - ✅ Account consent flow работает
   - ✅ Product consent flow работает (автоматически создается)
   - ✅ Bootstrap endpoint получает все данные (accounts, balances, transactions, credits)
   - ✅ Исправлен парсинг balances и credits
   - ✅ Database структура поддерживает типы consent

2. **Frontend**:
   - ✅ 5-шаговый онбординг реализован
   - ✅ UI компоненты готовы
   - ✅ Интеграция с API частично работает

### ❌ Что нужно доработать:

1. **Payment Consent** - НЕ РЕАЛИЗОВАН
2. **Объединенный экран выбора банков + согласий** - НЕ РЕАЛИЗОВАН
3. **Payment endpoints (MDP/ADP/SDP)** - НЕ РЕАЛИЗОВАНЫ
4. **Onboarding API endpoints** - НЕ СООТВЕТСТВУЮТ требованиям
5. **Dashboard структура** - НЕ ПОЛНАЯ

---

## 🔴 КРИТИЧЕСКИЕ ДОРАБОТКИ (высокий приоритет)

### 1. Payment Consent Flow

**Проблема**: Согласно требованиям, нужен третий тип consent - **Payment Consent** для:
- Single payments (MDP)
- Multiple payments (ADP) 
- Variable Recurring Payments (VRP) для SDP

**Текущее состояние**: 
- ❌ Нет `initiate_payment_consent()` в `obr_client.py`
- ❌ Нет endpoint `/api/consent/initiate/payment`
- ❌ Нет сохранения payment consent в БД

**Что нужно сделать**:

#### Backend:

1. **Добавить в `hktn/core/obr_client.py`**:
```python
async def initiate_payment_consent(self, user_id: str) -> ConsentInitResult:
    """Создает payment consent для всех типов платежей"""
    bank_token = await self._get_bank_token()
    headers = await self._get_common_headers(bank_token)
    body = {
        "client_id": user_id,
        "permissions": [
            "InitiateSinglePayment",
            "InitiateMultiplePayment", 
            "CreateVariableRecurringPayment"
        ],
        "reason": "FinPulse: автоматические платежи по кредитам и накоплениям",
        "requesting_bank": self.team_id,
        "requesting_bank_name": f"{self.team_id} App",
    }
    # ... аналогично initiate_product_consent
```

2. **Добавить в `hktn/backend/services/consents.py`**:
```python
async def initiate_payment_consent(req: ConsentInitiateRequest) -> Dict[str, Any]:
    """Создает payment consent"""
    # Аналогично initiate_product_consent
    # Сохраняет с consent_type="payments"
```

3. **Обновить `initiate_full_consent_flow()`**:
```python
async def initiate_full_consent_flow(req: ConsentInitiateRequest) -> Dict[str, Any]:
    """Создает ВСЕ три типа consent: account + product + payment"""
    account_result = await initiate_consent(req)
    
    # Создаем product consent всегда (не только при auto-approve)
    try:
        product_result = await initiate_product_consent(req)
    except Exception:
        logger.warning("Product consent failed")
    
    # Создаем payment consent всегда
    try:
        payment_result = await initiate_payment_consent(req)
    except Exception:
        logger.warning("Payment consent failed")
    
    return account_result
```

4. **Добавить endpoint в `hktn/backend/routers/consents.py`**:
```python
@router.post("/consent/initiate/payment")
async def initiate_payment_consent_endpoint(req: ConsentInitiateRequest):
    return await consents.initiate_payment_consent(req)
```

---

### 2. Объединенный экран выбора банков + согласий

**Проблема**: Согласно требованиям, шаг 1.3 должен быть **одним экраном**:
- Список банков с чекбоксами
- Под каждым банком - список всех трех согласий с чекбоксами
- Кнопка "Продолжить" активируется только когда выбраны банки И все обязательные согласия

**Текущее состояние**:
- ❌ Step2BankSelection - только выбор банков
- ❌ Step3BankConsent - только согласия (по одному банку)
- ❌ Нет объединенного экрана

**Что нужно сделать**:

#### Frontend:

1. **Создать новый компонент `Step2BanksAndConsents.tsx`**:
```typescript
interface BankConsentMatrix {
  bank_id: string;
  bank_name: string;
  consents: {
    account: boolean;    // Read Accounts/Balances/Transactions
    product: boolean;    // Product Agreements
    payment: boolean;    // Payments (MDP/ADP/SDP)
  };
}

export function Step2BanksAndConsents({ 
  onNext, 
  onBack,
  banks,
  initialSelection 
}: Props) {
  const [selectedBanks, setSelectedBanks] = useState<BankConsentMatrix[]>([]);
  
  // UI: список банков, под каждым - 3 чекбокса согласий
  // Валидация: хотя бы один банк + все обязательные согласия отмечены
}
```

2. **Обновить `OnboardingScreen.tsx`**:
```typescript
// Заменить Step2 + Step3 на Step2BanksAndConsents
{currentStep === 2 && (
  <Step2BanksAndConsents
    onNext={handleStep2Complete}
    onBack={() => setCurrentStep(1)}
    banks={onboardingState.banks}
    initialSelection={onboardingState.selected_banks_with_consents}
  />
)}
```

3. **Обновить API вызовы**:
```typescript
// При нажатии "Продолжить" отправляем на бэкенд:
POST /api/onboarding/consents
{
  "user_id": "team260-3",
  "banks": [
    {
      "bank_id": "abank",
      "consents": {
        "account": true,
        "product": true,
        "payment": true
      }
    }
  ]
}
```

#### Backend:

1. **Создать endpoint `POST /api/onboarding/consents`**:
```python
@router.post("/onboarding/consents")
async def create_all_consents(req: OnboardingConsentsRequest):
    """
    Создает все необходимые consents для выбранных банков
    """
    results = []
    for bank_data in req.banks:
        bank_id = bank_data.bank_id
        consents_to_create = bank_data.consents
        
        if consents_to_create.account:
            account_result = await initiate_consent(...)
        if consents_to_create.product:
            product_result = await initiate_product_consent(...)
        if consents_to_create.payment:
            payment_result = await initiate_payment_consent(...)
        
        results.append({
            "bank_id": bank_id,
            "account_consent": account_result.get("consent_id"),
            "product_consent": product_result.get("consent_id"),
            "payment_consent": payment_result.get("consent_id"),
        })
    
    return {"results": results}
```

---

### 3. Payment Endpoints (MDP/ADP/SDP)

**Проблема**: Нет реализации платежей через банковское API

**Что нужно сделать**:

#### Backend:

1. **Создать `hktn/backend/routers/payments.py`**:
```python
@router.post("/payments/mdp")
async def pay_mdp(req: MDPPaymentRequest):
    """Mandatory Daily Payment - обязательный платеж по кредиту"""
    # 1. Найти payment consent для банка
    # 2. Вызвать банковское API для single payment
    # 3. Обновить транзакции в БД
    # 4. Пересчитать STS

@router.post("/payments/adp") 
async def pay_adp(req: ADPPaymentRequest):
    """Additional Daily Payment - дополнительный платеж"""

@router.post("/payments/sdp")
async def pay_sdp(req: SDPPaymentRequest):
    """Savings Daily Payment - пополнение накоплений"""
```

2. **Добавить в `hktn/core/obr_client.py`**:
```python
async def initiate_single_payment(
    self, 
    user_id: str,
    consent_id: str,
    account_id: str,
    amount: float,
    creditor_account: str,
    description: str
) -> Dict[str, Any]:
    """Инициирует single payment через банковское API"""
    # POST /payments/single
    # Headers: X-Payment-Consent-Id
```

---

### 4. Onboarding API Endpoints

**Проблема**: Текущие endpoints не соответствуют требованиям

**Что нужно сделать**:

#### Backend:

1. **Создать `hktn/backend/routers/onboarding.py`**:
```python
@router.post("/onboarding/start")
async def start_onboarding(req: OnboardingStartRequest):
    """Начинает онбординг для пользователя"""
    # Сохраняет user_id, user_name
    # Возвращает onboarding_id

@router.get("/onboarding/status")
async def get_onboarding_status(onboarding_id: str):
    """Возвращает статус онбординга"""
    # Проверяет статусы всех consents
    # Возвращает прогресс по шагам

@router.post("/onboarding/finalize")
async def finalize_onboarding(req: OnboardingFinalizeRequest):
    """Завершает онбординг"""
    # Проверяет что все consents approved
    # Запускает первую синхронизацию данных
    # Возвращает готовность к работе
```

---

### 5. Dashboard Structure

**Проблема**: Dashboard не возвращает полную структуру согласно требованиям

**Что нужно сделать**:

#### Backend:

1. **Обновить `hktn/backend/services/analytics.py`**:
```python
async def get_dashboard_metrics(user_id: str) -> Dict[str, Any]:
    return {
        "sts_today": {
            "amount": 1250.50,
            "spent": 450.00,
            "tomorrow": {
                "amount": 1300.00,
                "impact": "После завтрашнего дохода"
            }
        },
        "loan_summary": {
            "total_outstanding": 150000.0,
            "mandatory_daily_payment": 850.0,  # MDP
            "additional_daily_payment": 1200.0,  # ADP
            "total_monthly_payment": 8500.0
        },
        "savings_summary": {
            "total_saved": 45000.0,
            "daily_payment": 500.0,  # SDP
            "target": 100000.0,
            "progress_percent": 45.0
        },
        "events_next_30d": [
            {
                "date": "2025-01-25",
                "type": "loan_payment",
                "amount": 8500.0,
                "description": "Платеж по кредиту"
            }
        ],
        "health_score": {
            "value": 75.5,
            "status": "good"
        }
    }
```

---

## 🟡 ВАЖНЫЕ ДОРАБОТКИ (средний приоритет)

### 6. Улучшение обработки ошибок

- Добавить retry логику для всех банковских запросов
- Graceful degradation при недоступности банка
- Детальное логирование для дебага

### 7. Кэширование и оптимизация

- Кэширование bank tokens
- Кэширование dashboard данных
- Оптимизация параллельных запросов

### 8. Валидация данных

- Валидация всех входных данных через Pydantic
- Проверка статусов consent перед использованием
- Валидация сумм платежей

---

## 🟢 УЛУЧШЕНИЯ (низкий приоритет)

### 9. Документация

- OpenAPI/Swagger документация для всех endpoints
- README с примерами использования
- Комментарии в коде

### 10. Тестирование

- Unit тесты для критичных функций
- Integration тесты для API endpoints
- E2E тесты для онбординга

---

## 📊 Приоритизация по критериям хакатона

### Технические критерии (обычно 40-50% баллов):

1. **✅ Полнота реализации API** (15 баллов)
   - ✅ Account consent - реализовано
   - ✅ Product consent - реализовано
   - ❌ Payment consent - **НУЖНО ДОБАВИТЬ**
   - ✅ Получение данных - реализовано
   - ❌ Платежи - **НУЖНО ДОБАВИТЬ**

2. **✅ Корректность работы** (10 баллов)
   - ✅ Парсинг данных исправлен
   - ✅ Обработка ошибок есть
   - ⚠️ Можно улучшить

3. **✅ Архитектура** (10 баллов)
   - ✅ Разделение на модули есть
   - ✅ Database структура правильная
   - ⚠️ Можно улучшить

4. **✅ Интеграция Frontend-Backend** (5 баллов)
   - ⚠️ Частично реализовано
   - ❌ Объединенный экран согласий - **НУЖНО ДОБАВИТЬ**

### Функциональные критерии (обычно 30-40% баллов):

1. **✅ Онбординг** (10 баллов)
   - ✅ 5 шагов реализовано
   - ❌ Объединенный экран - **НУЖНО ДОБАВИТЬ**
   - ❌ Payment consent - **НУЖНО ДОБАВИТЬ**

2. **✅ Dashboard** (10 баллов)
   - ⚠️ Частично реализовано
   - ❌ Полная структура - **НУЖНО ДОБАВИТЬ**

3. **✅ Платежи** (10 баллов)
   - ❌ MDP/ADP/SDP - **НУЖНО ДОБАВИТЬ**

---

## 🎯 План действий (по приоритету)

### Неделя 1 (Критично):

1. **День 1-2**: Реализовать Payment Consent
   - [ ] Добавить `initiate_payment_consent()` в `obr_client.py`
   - [ ] Добавить endpoint `/api/consent/initiate/payment`
   - [ ] Обновить `initiate_full_consent_flow()` для создания всех трех типов
   - [ ] Тестирование

2. **День 3-4**: Объединенный экран банков + согласий
   - [ ] Создать `Step2BanksAndConsents.tsx`
   - [ ] Обновить `OnboardingScreen.tsx`
   - [ ] Создать endpoint `POST /api/onboarding/consents`
   - [ ] Тестирование

3. **День 5**: Payment endpoints
   - [ ] Создать `routers/payments.py`
   - [ ] Реализовать MDP/ADP/SDP endpoints
   - [ ] Добавить методы в `obr_client.py` для платежей
   - [ ] Тестирование

### Неделя 2 (Важно):

4. **День 6-7**: Onboarding API endpoints
   - [ ] Создать `routers/onboarding.py`
   - [ ] Реализовать `/onboarding/start`, `/onboarding/status`, `/onboarding/finalize`
   - [ ] Интеграция с фронтендом

5. **День 8**: Dashboard структура
   - [ ] Обновить `get_dashboard_metrics()`
   - [ ] Добавить все требуемые поля
   - [ ] Тестирование

6. **День 9-10**: Улучшения и полировка
   - [ ] Обработка ошибок
   - [ ] Кэширование
   - [ ] Валидация
   - [ ] Документация

---

## 📝 Чек-лист готовности

### Backend:
- [ ] Payment consent реализован
- [ ] Все три типа consent создаются автоматически
- [ ] Payment endpoints (MDP/ADP/SDP) работают
- [ ] Onboarding API endpoints соответствуют требованиям
- [ ] Dashboard возвращает полную структуру
- [ ] Обработка ошибок улучшена
- [ ] Кэширование реализовано

### Frontend:
- [ ] Объединенный экран банков + согласий
- [ ] Интеграция с новыми API endpoints
- [ ] Обработка ошибок
- [ ] Loading states
- [ ] Валидация форм

### Тестирование:
- [ ] Все endpoints протестированы
- [ ] Онбординг flow протестирован
- [ ] Платежи протестированы
- [ ] Edge cases обработаны

---

## 🎓 Рекомендации для максимизации баллов

1. **Документировать все** - судьи должны понимать архитектуру
2. **Показывать реальные запросы** - логировать все взаимодействия с банками
3. **Обрабатывать edge cases** - что если банк недоступен? Что если consent expired?
4. **Показывать прогресс** - loading states, progress bars
5. **Тестировать с реальными данными** - использовать team260-3 с реальными кредитами

---

**Готов приступить к реализации!** Начнем с Payment Consent?

