# 🎯 План доработки FinPulse для хакатона

**Цель:** Довести приложение до 95% соответствия спецификации за 18-26 часов работы

---

## 📊 Текущий статус: 70% готовности

**Что работает отлично:**
- ✅ Backend архитектура и API
- ✅ 6 из 9 алгоритмов расчета
- ✅ Интеграция с OpenBanking Russia
- ✅ Dashboard с кешированием
- ✅ Payment flow (MDP/ADP/SDP)
- ✅ UI/UX всех экранов

**Что нужно доработать:**
- ❌ Онбординг (нарушения спецификации)
- ❌ Refinancing (нет backend логики)
- ❌ Loans/Deposits Detail (mock данные)
- ❌ Goal Selection (нет валидации)

---

## 🔴 ПРИОРИТЕТ 1: Критические задачи (14-20 часов)

### Задача 1.1: Исправление Consent Flow в онбординге (6 часов)

**Проблема:** После создания consent не проверяется auto-approve и не дается ссылка на банк

**Спецификация (back onboard.md, Step 1.5):**
```
Как только отправляется на бэкэнде запрос на консент, банк переходит в режим ожидания. 
И если не получил approve от клиента, то выводится экранчик ожидания с ссылкой на банк, 
чтобы пользователь зашел и вручную все подтвердил.
```

#### Шаг 1.1.1: Backend - проверка auto-approve (2 часа)

**Файл:** `hktn/backend/services/consents.py`

**Изменения в функции `initiate_full_consent_flow()`:**

```python
async def initiate_full_consent_flow(req: ConsentInitiateRequest) -> Dict[str, Any]:
    """Инициирует полный consent flow: accounts + products + payments."""
    # ... существующий код ...
    
    # После создания account consent
    account_response = await client.request_account_consent(...)
    
    # ДОБАВИТЬ: Проверка auto-approve
    auto_approved = account_response.get("status") == "approved"
    authorization_url = None
    
    if not auto_approved:
        # Построить URL для ручного подтверждения
        authorization_url = (
            f"{config.base_url}/consent/authorize?"
            f"request_id={account_request_id}&"
            f"client_id={req.user_id}"
        )
    
    # Сохранить consent с дополнительными полями
    consent = StoredConsent(
        user_id=req.user_id,
        bank_id=req.bank_id,
        consent_id=account_consent_id,
        consent_type="accounts",
        status="approved" if auto_approved else "pending",
        # ...
    )
    
    # ИЗМЕНИТЬ: Вернуть расширенный ответ
    return {
        "status": "ok",
        "bank_id": req.bank_id,
        "consents": {
            "account": {
                "consent_id": account_consent_id,
                "request_id": account_request_id,
                "status": "approved" if auto_approved else "pending",
                "auto_approved": auto_approved,
                "authorization_url": authorization_url,
            },
            # ... аналогично для product и payment consents
        },
    }
```

**Новые поля в ответе:**
- `auto_approved: bool` - был ли consent автоматически одобрен
- `authorization_url: str | null` - ссылка на банк для ручного подтверждения
- `status: "approved" | "pending"` - текущий статус consent

---

#### Шаг 1.1.2: Backend - endpoint для polling статуса (1 час)

**Файл:** `hktn/backend/services/consents.py`

**Новая функция:**

```python
async def poll_consent_status(
    user_id: str,
    bank_id: str,
    request_id: str,
) -> Dict[str, Any]:
    """
    Проверяет статус consent по request_id.
    Используется для polling после ручного подтверждения в банке.
    """
    config = get_bank_config(bank_id, require_url=True)
    
    async with bank_client(bank_id) as client:
        # Проверить статус через банковский API
        status_response = await client.get_consent_status(request_id)
        
        status = status_response.get("status", "pending")
        
        if status == "approved":
            # Получить consent_id и подтвердить
            consent_id = status_response.get("consent_id")
            
            # Обновить в БД
            update_consent_status(user_id, bank_id, "accounts", consent_id, "approved")
            
        return {
            "status": status,  # "pending" | "approved" | "rejected"
            "consent_id": consent_id if status == "approved" else None,
        }
```

**Роутер уже существует:** `hktn/backend/routers/consents.py` (строка 41-43)

---

#### Шаг 1.1.3: Frontend - отображение ссылки и polling (3 часа)

**Файл:** `hktn/src/components/steps/Step2ConsentProgress.tsx`

**Текущий код:**
```typescript
// Сейчас просто показывается spinner и переход дальше
```

**Новый код:**

```typescript
interface ConsentStatus {
  consent_id: string | null;
  request_id: string;
  status: 'pending' | 'approved' | 'rejected';
  auto_approved: boolean;
  authorization_url: string | null;
}

interface BankConsentState {
  bank_id: string;
  bank_name: string;
  account: ConsentStatus;
  product: ConsentStatus;
  payment: ConsentStatus;
  current_step: 'account' | 'product' | 'payment' | 'done';
}

export function Step2ConsentProgress({ ... }) {
  const [banksState, setBanksState] = useState<BankConsentState[]>([]);
  const [currentBankIndex, setCurrentBankIndex] = useState(0);
  
  // Инициализация consent для текущего банка
  useEffect(() => {
    if (currentBankIndex >= banksWithConsents.length) {
      // Все банки обработаны
      onNext();
      return;
    }
    
    const bank = banksWithConsents[currentBankIndex];
    initiateConsentsForBank(bank);
  }, [currentBankIndex]);
  
  const initiateConsentsForBank = async (bank: any) => {
    // 1. Создать account consent
    const accountResponse = await fetch('/api/consent/initiate', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        bank_id: bank.bank_id,
      }),
    });
    
    const accountData = await accountResponse.json();
    const accountConsent = accountData.consents.account;
    
    // 2. Обновить state
    setBanksState((prev) => {
      const newState = [...prev];
      newState[currentBankIndex] = {
        bank_id: bank.bank_id,
        bank_name: bank.bank_name,
        account: accountConsent,
        product: { ... },
        payment: { ... },
        current_step: 'account',
      };
      return newState;
    });
    
    // 3. Если НЕ auto-approved → запустить polling
    if (!accountConsent.auto_approved) {
      startPolling(bank.bank_id, accountConsent.request_id, 'account');
    } else {
      // Сразу переходим к product consent
      proceedToProductConsent(bank);
    }
  };
  
  const startPolling = (bankId: string, requestId: string, consentType: string) => {
    const intervalId = setInterval(async () => {
      const statusResponse = await fetch(
        `/api/consent/status?user_id=${userId}&bank_id=${bankId}&request_id=${requestId}`
      );
      const statusData = await statusResponse.json();
      
      if (statusData.status === 'approved') {
        clearInterval(intervalId);
        
        // Обновить state
        setBanksState((prev) => {
          const newState = [...prev];
          newState[currentBankIndex][consentType].status = 'approved';
          newState[currentBankIndex][consentType].consent_id = statusData.consent_id;
          return newState;
        });
        
        // Перейти к следующему consent
        if (consentType === 'account') {
          proceedToProductConsent(banksWithConsents[currentBankIndex]);
        } else if (consentType === 'product') {
          proceedToPaymentConsent(banksWithConsents[currentBankIndex]);
        } else if (consentType === 'payment') {
          // Переходим к следующему банку
          setCurrentBankIndex((prev) => prev + 1);
        }
      } else if (statusData.status === 'rejected') {
        clearInterval(intervalId);
        // Показать ошибку
        alert('Consent был отклонен. Попробуйте снова.');
      }
    }, 5000); // Проверяем каждые 5 секунд
  };
  
  // Render
  return (
    <div>
      <h2>Подключение банков</h2>
      
      {banksState.map((bank, index) => (
        <div key={bank.bank_id}>
          <h3>{bank.bank_name}</h3>
          
          {/* Account consent */}
          <div>
            {bank.account.status === 'pending' && (
              <>
                <div className="spinner" />
                <p>Ожидаем подтверждения...</p>
                {bank.account.authorization_url && (
                  <a 
                    href={bank.account.authorization_url} 
                    target="_blank"
                    className="btn-primary"
                  >
                    Подтвердить в банке →
                  </a>
                )}
              </>
            )}
            
            {bank.account.status === 'approved' && (
              <div className="success">✓ Account consent подтвержден</div>
            )}
          </div>
          
          {/* Product consent (аналогично) */}
          {/* Payment consent (аналогично) */}
        </div>
      ))}
    </div>
  );
}
```

**Ключевые моменты:**
- Последовательная обработка банков (один за другим)
- Для каждого банка: сначала account → product → payment
- Если не auto-approved → показываем ссылку + polling каждые 5 сек
- Только после approve переходим к следующему consent

---

### Задача 1.2: Реализация Refinancing API (8 часов)

**Проблема:** RefinanceScreen использует только mock данные, нет backend логики

#### Шаг 1.2.1: Реализация алгоритма financing_need_detector (2 часа)

**Файл:** `hktn/backend/services/algorithms.py`

**Новая функция:**

```python
def financing_need_detector(
    estimated_monthly_income: float,
    active_loans: List[Dict[str, Any]],
    debt_obligations_status: List[Dict[str, Any]],
    sts_status: str,
    days_until_gap: int,
    total_overdue_debt_base: float,
    dti_threshold: float = 0.5,
) -> Dict[str, Any]:
    """
    Определяет, нуждается ли клиент в финансировании (рефинанс, консолидация).
    
    Согласно спецификации (Алгоритм 7):
    - Расчет ПДН (DTI)
    - Сбор триггеров
    - Оценка срочности
    """
    # ЭТАП 1: Расчет DTI
    total_payments = sum(
        ob.get("planned_amount", 0) 
        for ob in debt_obligations_status
    )
    
    if estimated_monthly_income > 0:
        dti = total_payments / estimated_monthly_income
    else:
        dti = 1.0  # Считаем, что всё плохо
    
    # ЭТАП 2: Сбор триггеров
    triggers = []
    refi_candidates = []
    
    # Триггер 1: Просрочка
    if total_overdue_debt_base > 0:
        triggers.append("overdue")
    
    # Триггер 2: Gap Risk (нет денег)
    if sts_status == "DANGER":
        triggers.append("gap_risk")
    
    # Триггер 3: High Load (высокая нагрузка)
    if dti > dti_threshold:
        triggers.append("high_dti")
    
    # Триггер 4: Refi Opportunity (можно сэкономить)
    # Для каждого кредита проверяем, можно ли снизить ставку
    for loan in active_loans:
        # Загружаем product catalog
        catalog = load_product_catalog()
        
        # Ищем минимальную ставку для такого же типа продукта
        best_market_rate = min(
            (p["rate"] for p in catalog if p["product_type"] == loan["product_type"]),
            default=loan["interest_rate"]
        )
        
        rate_diff = loan["interest_rate"] - best_market_rate
        
        if rate_diff >= 1.5 and total_overdue_debt_base == 0:
            # Можно рефинансировать
            triggers.append("refi_opportunity")
            refi_candidates.append(loan["agreement_id"])
    
    # ЭТАП 3: Оценка срочности
    if "overdue" in triggers or "gap_risk" in triggers:
        urgency = "HIGH"
    elif "high_dti" in triggers:
        urgency = "MEDIUM"
    elif "refi_opportunity" in triggers:
        urgency = "WATCH"
    else:
        urgency = "NONE"
    
    # ЭТАП 4: Финал
    financing_needed = urgency != "NONE"
    
    return {
        "financing_needed": financing_needed,
        "urgency": urgency,
        "triggers": triggers,
        "refi_candidates": refi_candidates,
        "dti": round(dti, 3),
    }
```

**Вспомогательная функция:**

```python
def load_product_catalog() -> List[Dict[str, Any]]:
    """Загружает product catalog из JSON файла."""
    catalog_path = "hktn/team260_data/products/catalog.json"
    
    with open(catalog_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    return data.get("products", [])
```

---

#### Шаг 1.2.2: Реализация алгоритма best_financing_offer_selector (3 часа)

**Файл:** `hktn/backend/services/algorithms.py`

**Новая функция:**

```python
import numpy as np

def best_financing_offer_selector(
    refi_candidates: List[str],
    active_loans: List[Dict[str, Any]],
    estimated_monthly_income: float,
    min_rate_diff: float = 1.5,
) -> List[Dict[str, Any]]:
    """
    Подбирает лучшие условия финансирования: рефинанс или консолидация.
    
    Согласно спецификации (Алгоритм 8):
    - Сценарий "Точечный выстрел" (Single Refi)
    - Сценарий "Консолидация" (All-in)
    - Сортировка по monthly_saving
    """
    catalog = load_product_catalog()
    top_offers = []
    
    # ЭТАП 1: Сценарий "Точечный выстрел"
    for loan_id in refi_candidates:
        loan = next((l for l in active_loans if l["agreement_id"] == loan_id), None)
        if not loan:
            continue
        
        # Ищем офферы в каталоге
        matching_offers = [
            offer for offer in catalog
            if (
                offer["product_type"] in ["loan", "refinance"] and
                offer["min_amount"] <= loan["amount"] <= offer["max_amount"] and
                offer["rate"] <= loan["interest_rate"] - min_rate_diff
            )
        ]
        
        for offer in matching_offers:
            # Рассчитываем новый платеж (PMT аннуитет)
            new_monthly_payment = calculate_pmt(
                rate=offer["rate"] / 100 / 12,
                nper=offer["max_term_months"],
                pv=loan["amount"],
            )
            
            # Считаем выгоду
            old_monthly_payment = loan.get("monthly_payment", 0)
            if old_monthly_payment == 0:
                # Эвристика
                old_monthly_payment = loan["amount"] * 0.02
            
            monthly_saving = old_monthly_payment - new_monthly_payment
            
            if monthly_saving > 0:
                top_offers.append({
                    "id": f"refi-{loan_id}-{offer['id']}",
                    "strategy": "Refinance One",
                    "bank": offer["bank"],
                    "product": offer["product_name"],
                    "rate": offer["rate"],
                    "term_months": offer["max_term_months"],
                    "old_monthly_payment": round(old_monthly_payment, 2),
                    "new_monthly_payment": round(new_monthly_payment, 2),
                    "monthly_saving": round(monthly_saving, 2),
                    "total_saving": round(monthly_saving * offer["max_term_months"], 2),
                    "commission": offer.get("commission", 0),
                    "breakeven_months": (
                        int(offer.get("commission", 0) / monthly_saving) 
                        if monthly_saving > 0 else 0
                    ),
                    "target_loans": [loan_id],
                })
    
    # ЭТАП 2: Сценарий "Консолидация"
    if len(refi_candidates) > 1:
        # Собираем "Пакет"
        total_debt_sum = sum(
            loan["amount"] 
            for loan in active_loans 
            if loan["agreement_id"] in refi_candidates
        )
        
        total_current_pay = sum(
            loan.get("monthly_payment", loan["amount"] * 0.02)
            for loan in active_loans
            if loan["agreement_id"] in refi_candidates
        )
        
        # Ищем офферы для консолидации
        consolidation_offers = [
            offer for offer in catalog
            if (
                offer["product_type"] in ["loan", "refinance", "consolidation"] and
                offer["max_amount"] >= total_debt_sum
            )
        ]
        
        for offer in consolidation_offers:
            new_total_pay = calculate_pmt(
                rate=offer["rate"] / 100 / 12,
                nper=offer["max_term_months"],
                pv=total_debt_sum,
            )
            
            total_saving = total_current_pay - new_total_pay
            
            if total_saving > 0:
                top_offers.append({
                    "id": f"consol-{offer['id']}",
                    "strategy": "Consolidation",
                    "bank": offer["bank"],
                    "product": offer["product_name"],
                    "rate": offer["rate"],
                    "term_months": offer["max_term_months"],
                    "old_monthly_payment": round(total_current_pay, 2),
                    "new_monthly_payment": round(new_total_pay, 2),
                    "monthly_saving": round(total_saving, 2),
                    "total_saving": round(total_saving * offer["max_term_months"], 2),
                    "commission": offer.get("commission", 0),
                    "breakeven_months": (
                        int(offer.get("commission", 0) / total_saving)
                        if total_saving > 0 else 0
                    ),
                    "target_loans": refi_candidates,
                })
    
    # ЭТАП 3: Сортировка по выгоде
    top_offers.sort(key=lambda x: x["monthly_saving"], reverse=True)
    
    # Возвращаем топ-3
    return top_offers[:3]


def calculate_pmt(rate: float, nper: int, pv: float) -> float:
    """
    Рассчитывает аннуитетный платеж (формула PMT из Excel).
    
    PMT = PV * [r(1 + r)^n] / [(1 + r)^n - 1]
    
    Args:
        rate: процентная ставка за период (месяц)
        nper: количество периодов (месяцев)
        pv: текущая стоимость (сумма кредита)
    
    Returns:
        Ежемесячный платеж
    """
    if rate == 0:
        return pv / nper
    
    return pv * (rate * (1 + rate) ** nper) / ((1 + rate) ** nper - 1)
```

---

#### Шаг 1.2.3: Backend роутер для Refinancing (2 часа)

**Создать файл:** `hktn/backend/routers/refinance.py`

```python
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from ..services.algorithms import (
    financing_need_detector,
    best_financing_offer_selector,
)
from ..services.analytics import get_dashboard_metrics

router = APIRouter(prefix="/api", tags=["refinance"])
logger = logging.getLogger("finpulse.backend.refinance")


@router.get("/refinance/optimize-loans")
async def optimize_loans(user_id: str) -> Dict[str, Any]:
    """
    Оптимизирует кредиты пользователя: рефинансирование или консолидация.
    
    Возвращает топ-3 предложения, отсортированные по выгоде.
    """
    # 1. Получаем dashboard метрики
    dashboard = await get_dashboard_metrics(user_id, force_refresh=False)
    
    # Извлекаем необходимые данные
    # (нужно расширить get_dashboard_metrics чтобы возвращал больше деталей)
    
    # Для упрощения используем mock данные
    # TODO: Расширить dashboard API
    
    estimated_monthly_income = 50000.0  # Заглушка
    active_loans = []  # Заглушка
    debt_obligations_status = []
    sts_status = "OK"
    days_until_gap = 30
    total_overdue_debt_base = 0.0
    
    # 2. Определяем потребность в финансировании
    detection = financing_need_detector(
        estimated_monthly_income=estimated_monthly_income,
        active_loans=active_loans,
        debt_obligations_status=debt_obligations_status,
        sts_status=sts_status,
        days_until_gap=days_until_gap,
        total_overdue_debt_base=total_overdue_debt_base,
    )
    
    if not detection["financing_needed"]:
        return {
            "status": "ok",
            "financing_needed": False,
            "message": "Ваши кредиты в порядке, рефинансирование не требуется.",
            "offers": [],
        }
    
    # 3. Подбираем лучшие офферы
    offers = best_financing_offer_selector(
        refi_candidates=detection["refi_candidates"],
        active_loans=active_loans,
        estimated_monthly_income=estimated_monthly_income,
    )
    
    logger.info(
        "Refinance optimization for user %s: %d offers, urgency=%s",
        user_id,
        len(offers),
        detection["urgency"],
    )
    
    return {
        "status": "ok",
        "financing_needed": True,
        "urgency": detection["urgency"],
        "triggers": detection["triggers"],
        "dti": detection["dti"],
        "offers": offers,
    }


@router.post("/refinance/apply")
async def apply_for_refinance(
    user_id: str,
    offer_id: str,
) -> Dict[str, Any]:
    """
    Подать заявку на рефинансирование.
    
    Для демо: просто возвращаем случайный статус (approved/declined).
    """
    import random
    
    # Mock: 70% вероятность одобрения
    approved = random.random() < 0.7
    
    logger.info(
        "Refinance application: user=%s, offer=%s, approved=%s",
        user_id,
        offer_id,
        approved,
    )
    
    return {
        "status": "ok",
        "application_status": "approved" if approved else "declined",
        "offer_id": offer_id,
        "message": (
            "Заявка одобрена! Ваши кредиты будут рефинансированы." 
            if approved else 
            "К сожалению, заявка отклонена. Попробуйте другие предложения."
        ),
    }
```

**Зарегистрировать роутер:**

**Файл:** `hktn/backend/app.py`

```python
from .routers import analytics, banks, consents, auth, payments, onboarding, refinance

# ...

app.include_router(refinance.router)
```

---

#### Шаг 1.2.4: Frontend интеграция (1 час)

**Файл:** `hktn/src/utils/api.ts`

**Добавить функции:**

```typescript
export interface RefinanceOffer {
  id: string;
  strategy: 'Refinance One' | 'Consolidation';
  bank: string;
  product: string;
  rate: number;
  term_months: number;
  old_monthly_payment: number;
  new_monthly_payment: number;
  monthly_saving: number;
  total_saving: number;
  commission: number;
  breakeven_months: number;
  target_loans: string[];
}

export interface RefinanceResponse {
  status: 'ok';
  financing_needed: boolean;
  urgency?: 'HIGH' | 'MEDIUM' | 'WATCH' | 'NONE';
  triggers?: string[];
  dti?: number;
  offers: RefinanceOffer[];
  message?: string;
}

export async function getRefinanceOffers(userId: string): Promise<RefinanceResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/refinance/optimize-loans?user_id=${userId}`
  );
  if (!response.ok) {
    throw new Error('Failed to fetch refinance offers');
  }
  return response.json();
}

export async function applyForRefinance(
  userId: string,
  offerId: string
): Promise<{ application_status: 'approved' | 'declined'; message: string }> {
  const response = await fetch(`${API_BASE_URL}/api/refinance/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, offer_id: offerId }),
  });
  if (!response.ok) {
    throw new Error('Failed to apply for refinance');
  }
  return response.json();
}
```

**Файл:** `hktn/src/screens/RefinanceScreen.tsx`

**Заменить mock данные на API:**

```typescript
import { getRefinanceOffers, applyForRefinance, type RefinanceOffer } from '../utils/api';

export function RefinanceScreen({ appState, onBack }: RefinanceScreenProps) {
  const [offers, setOffers] = useState<RefinanceOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const loadOffers = async () => {
      try {
        setLoading(true);
        const data = await getRefinanceOffers(appState.user.id);
        
        if (!data.financing_needed) {
          // Показать сообщение "Рефинансирование не требуется"
          setOffers([]);
        } else {
          setOffers(data.offers);
        }
      } catch (err) {
        setError('Не удалось загрузить предложения');
      } finally {
        setLoading(false);
      }
    };
    
    loadOffers();
  }, [appState.user.id]);
  
  const handleSubmitApplication = async () => {
    if (!selectedOffer) return;
    
    setApplicationStatus('pending');
    
    try {
      const result = await applyForRefinance(appState.user.id, selectedOffer);
      
      if (result.application_status === 'approved') {
        setApplicationStatus('approved');
      } else {
        setApplicationStatus('declined');
      }
    } catch (err) {
      setError('Не удалось отправить заявку');
      setApplicationStatus('idle');
    }
  };
  
  // ... остальной код без изменений
}
```

---

### Задача 1.3: Реализация Loans/Deposits Detail API (6 часов)

**Проблема:** Экраны LoansDetailScreen и DepositsDetailScreen используют mock данные

#### Шаг 1.3.1: Backend - парсинг кредитов и вкладов (3 часа)

**Создать файл:** `hktn/backend/routers/loans.py`

```python
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from hktn.core.database import find_approved_consents

from ..services.banking import fetch_bank_credits
from ..services.algorithms import (
    total_debt_calculation,
    mdp_calculation,
    adp_calculation,
    transactions_categorization_salary_and_loans,
)

router = APIRouter(prefix="/api", tags=["loans"])
logger = logging.getLogger("finpulse.backend.loans")


@router.get("/loans")
async def get_loans(user_id: str) -> Dict[str, Any]:
    """
    Возвращает список всех кредитов пользователя с детализацией.
    
    Включает:
    - Список кредитов с полями: id, bank, type, balance, rate, monthly_payment, priority
    - Общие метрики: total_outstanding, mdp, adp
    - Стратегия погашения
    """
    # 1. Получить product consents
    product_consents = find_approved_consents(user_id, consent_type="products")
    if not product_consents:
        return {
            "status": "ok",
            "loans": [],
            "total_outstanding": 0.0,
            "mdp": 0.0,
            "adp": 0.0,
            "strategy": "avalanche",
        }
    
    # 2. Загрузить кредиты из всех банков
    all_credits = []
    for consent in product_consents:
        try:
            result = await fetch_bank_credits(
                consent.bank_id,
                consent.consent_id,
                user_id,
            )
            if result.get("status") == "ok":
                all_credits.extend(result.get("credits", []))
        except Exception as e:
            logger.error(f"Failed to fetch credits from {consent.bank_id}: {e}")
    
    # 3. Фильтровать только кредиты (не вклады)
    loans = []
    for credit in all_credits:
        product_type = credit.get("productType") or credit.get("product_type", "").lower()
        
        if any(keyword in product_type for keyword in ["loan", "credit", "mortgage", "кредит", "ипотека"]):
            # Это кредит
            loans.append(credit)
    
    # 4. Расчет долга через алгоритм
    debt_result = total_debt_calculation(loans)
    
    # 5. Расчет MDP и ADP
    # TODO: Нужны транзакции для categorization
    # Для упрощения используем простой расчет
    
    # 6. Ранжирование по стратегии (Avalanche)
    ranked_loans = sorted(
        debt_result["active_loans"],
        key=lambda l: (-l.get("interest_rate", 0), l.get("amount", 0))
    )
    
    # Присвоить priority
    for idx, loan in enumerate(ranked_loans):
        loan["priority"] = idx + 1
    
    # 7. Формат ответа
    loans_list = []
    for loan in ranked_loans:
        # Найти оригинальный credit для дополнительных данных
        original = next(
            (c for c in loans if c.get("agreementId") == loan["agreement_id"]),
            None
        )
        
        loans_list.append({
            "id": loan["agreement_id"],
            "bank": original.get("bank") or "Unknown Bank",
            "type": original.get("productType") or original.get("product_type") or "Loan",
            "balance": loan["amount"],
            "rate": loan["interest_rate"],
            "monthly_payment": original.get("monthlyPayment") or original.get("monthly_payment") or loan["amount"] * 0.02,
            "maturity_date": original.get("maturityDate") or original.get("maturity_date") or "2026-12-31",
            "priority": loan["priority"],
        })
    
    return {
        "status": "ok",
        "loans": loans_list,
        "total_outstanding": debt_result["total_debt_base"],
        "mdp": 0.0,  # TODO: Real calculation
        "adp": 0.0,  # TODO: Real calculation
        "strategy": "avalanche",
    }


@router.get("/deposits")
async def get_deposits(user_id: str) -> Dict[str, Any]:
    """
    Возвращает список всех вкладов/депозитов пользователя.
    
    Включает:
    - Список депозитов с полями: id, bank, type, balance, rate, term_months
    - Общие метрики: total_saved, sdp, target, progress
    """
    # 1. Получить product consents
    product_consents = find_approved_consents(user_id, consent_type="products")
    if not product_consents:
        return {
            "status": "ok",
            "deposits": [],
            "total_saved": 0.0,
            "sdp": 0.0,
            "target": 0.0,
            "progress_percent": 0.0,
        }
    
    # 2. Загрузить все продукты
    all_products = []
    for consent in product_consents:
        try:
            result = await fetch_bank_credits(
                consent.bank_id,
                consent.consent_id,
                user_id,
            )
            if result.get("status") == "ok":
                all_products.extend(result.get("credits", []))
        except Exception as e:
            logger.error(f"Failed to fetch products from {consent.bank_id}: {e}")
    
    # 3. Фильтровать только депозиты
    deposits = []
    total_saved = 0.0
    
    for product in all_products:
        product_type = product.get("productType") or product.get("product_type", "").lower()
        
        if any(keyword in product_type for keyword in ["deposit", "savings", "вклад", "накопительн"]):
            balance = float(product.get("balance") or product.get("currentBalance") or product.get("amount") or 0)
            
            deposits.append({
                "id": product.get("agreementId") or product.get("agreement_id"),
                "bank": product.get("bank") or "Unknown Bank",
                "type": product.get("productType") or product.get("product_type") or "Deposit",
                "balance": balance,
                "rate": float(product.get("interestRate") or product.get("interest_rate") or 0),
                "term_months": int(product.get("termMonths") or product.get("term_months") or 12),
            })
            
            total_saved += balance
    
    # 4. Расчет SDP (Savings Daily Payment)
    # TODO: Нужны данные о цели из user_financial_inputs
    sdp = 500.0  # Fallback
    
    return {
        "status": "ok",
        "deposits": deposits,
        "total_saved": round(total_saved, 2),
        "sdp": sdp,
        "target": 100000.0,  # TODO: From user_financial_inputs
        "progress_percent": round((total_saved / 100000.0) * 100, 2),
    }
```

**Зарегистрировать роутер:**

**Файл:** `hktn/backend/app.py`

```python
from .routers import analytics, banks, consents, auth, payments, onboarding, refinance, loans

# ...

app.include_router(loans.router)
```

---

#### Шаг 1.3.2: Frontend интеграция (3 часа)

**Файл:** `hktn/src/utils/api.ts`

**Добавить функции:**

```typescript
export interface Loan {
  id: string;
  bank: string;
  type: string;
  balance: number;
  rate: number;
  monthly_payment: number;
  maturity_date: string;
  priority: number;
}

export interface LoansResponse {
  status: 'ok';
  loans: Loan[];
  total_outstanding: number;
  mdp: number;
  adp: number;
  strategy: 'avalanche' | 'snowball';
}

export async function getLoans(userId: string): Promise<LoansResponse> {
  const response = await fetch(`${API_BASE_URL}/api/loans?user_id=${userId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch loans');
  }
  return response.json();
}

export interface Deposit {
  id: string;
  bank: string;
  type: string;
  balance: number;
  rate: number;
  term_months: number;
}

export interface DepositsResponse {
  status: 'ok';
  deposits: Deposit[];
  total_saved: number;
  sdp: number;
  target: number;
  progress_percent: number;
}

export async function getDeposits(userId: string): Promise<DepositsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/deposits?user_id=${userId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch deposits');
  }
  return response.json();
}
```

**Файл:** `hktn/src/screens/LoansDetailScreen.tsx`

**Заменить mock данные:**

```typescript
import { useEffect, useState } from 'react';
import { getLoans, type Loan } from '../utils/api';

export function LoansDetailScreen({ appState, onBack, onPayment }: LoansDetailScreenProps) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [mdp, setMdp] = useState(0);
  const [adp, setAdp] = useState(0);
  
  useEffect(() => {
    const loadLoans = async () => {
      try {
        setLoading(true);
        const data = await getLoans(appState.user.id);
        
        setLoans(data.loans);
        setTotalOutstanding(data.total_outstanding);
        setMdp(data.mdp);
        setAdp(data.adp);
      } catch (err) {
        console.error('Failed to load loans:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadLoans();
  }, [appState.user.id]);
  
  if (loading) {
    return <div>Загрузка...</div>;
  }
  
  return (
    <div>
      {/* Summary */}
      <div>
        <div>Общий долг</div>
        <div>{formatCurrency(totalOutstanding)}</div>
        
        <div>
          <button onClick={() => onPayment('mdp')}>
            Обязательный: {formatCurrency(mdp)}
          </button>
          
          <button onClick={() => onPayment('adp')}>
            Дополнительный: {formatCurrency(adp)}
          </button>
        </div>
      </div>
      
      {/* Loans list */}
      <div>
        {loans.map((loan) => (
          <div key={loan.id}>
            <div>{loan.bank}</div>
            <div>{loan.type}</div>
            <div>Остаток: {formatCurrency(loan.balance)}</div>
            <div>Ставка: {loan.rate}%</div>
            <div>Платеж: {formatCurrency(loan.monthly_payment)}</div>
            <div>Приоритет: {loan.priority}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Аналогично для DepositsDetailScreen**

---

## 🟠 ПРИОРИТЕТ 2: Высокий (4-6 часов)

### Задача 2.1: Goal Selection - блокировка "Закрыть кредиты" (2 часа)

**Файл:** `hktn/src/components/steps/Step5Questions.tsx`

**Изменения:**

```typescript
import { useEffect, useState } from 'react';
import { getLoans } from '../../utils/api';

export function Step5Questions({ onNext, onBack, initialGoals, userId }) {
  const [hasLoans, setHasLoans] = useState(false);
  const [loadingLoans, setLoadingLoans] = useState(true);
  
  useEffect(() => {
    const checkLoans = async () => {
      try {
        setLoadingLoans(true);
        const data = await getLoans(userId);
        
        // Проверяем наличие кредитов
        setHasLoans(data.loans.length > 0);
      } catch (err) {
        console.error('Failed to check loans:', err);
        // Fallback: разрешаем выбрать любой режим
        setHasLoans(true);
      } finally {
        setLoadingLoans(false);
      }
    };
    
    checkLoans();
  }, [userId]);
  
  if (loadingLoans) {
    return <div>Проверка доступных целей...</div>;
  }
  
  return (
    <div>
      <h2>Выберите вашу финансовую цель</h2>
      
      {/* Закрыть кредиты */}
      <button
        onClick={() => selectGoal('close_loans')}
        disabled={!hasLoans}
        className={!hasLoans ? 'opacity-50 cursor-not-allowed' : ''}
      >
        <div>Закрыть кредиты</div>
        {!hasLoans && (
          <div className="text-xs text-red-600 mt-2">
            У вас нет активных кредитов
          </div>
        )}
      </button>
      
      {/* Накопить деньги */}
      <button onClick={() => selectGoal('save_money')}>
        <div>Накопить на цель</div>
      </button>
    </div>
  );
}
```

---

### Задача 2.2: Сохранение repayment_speed (1 час)

**Файл:** `hktn/src/components/steps/Step5Questions.tsx`

**Изменения:**

```typescript
const handleNext = async () => {
  // Сохранить финансовые данные
  await fetch('/api/onboarding/save-financial-inputs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      repayment_speed: selectedSpeed,  // 'conservative' | 'balanced' | 'fast'
      repayment_strategy: 'avalanche',  // По умолчанию
      // ... другие поля
    }),
  });
  
  onNext({
    mode: selectedMode,
    speed: selectedSpeed,
    // ...
  });
};
```

**Файл:** `hktn/backend/services/onboarding.py`

**Изменения:**

```python
async def save_financial_inputs(req: FinancialInputsRequest) -> Dict[str, Any]:
    """Сохраняет финансовые данные пользователя."""
    # ... существующий код ...
    
    # ДОБАВИТЬ: Сохранение repayment_speed и repayment_strategy
    set_user_financial_inputs(
        user_id=req.user_id,
        salary_amount=req.salary_amount,
        next_salary_date=req.next_salary_date,
        credit_payment_amount=req.credit_payment_amount,
        credit_payment_date=req.credit_payment_date,
        repayment_speed=req.repayment_speed,  # НОВОЕ
        repayment_strategy=req.repayment_strategy,  # НОВОЕ
    )
    
    # ...
```

---

### Задача 2.3: Health Score reasons (2 часа)

**Файл:** `hktn/backend/services/analytics.py`

**Изменения в `_calculate_health_score()`:**

```python
def _calculate_health_score(
    total_balance: float,
    total_credit_debt: float,
    monthly_income: float,
    monthly_expenses: float,
) -> Dict[str, Any]:
    """Вычисляет показатель финансового здоровья (0-100)."""
    score = 50.0
    reasons = []
    
    # Соотношение долга к балансу
    if total_balance > 0:
        debt_ratio = total_credit_debt / total_balance
        if debt_ratio < 0.5:
            score += 20
            reasons.append("Долг меньше половины ваших активов")
        elif debt_ratio < 1.0:
            score += 10
            reasons.append("Долг под контролем")
        elif debt_ratio > 2.0:
            score -= 20
            reasons.append("⚠️ Долг превышает активы в 2 раза")
    
    # Соотношение расходов к доходам
    if monthly_income > 0:
        expense_ratio = monthly_expenses / monthly_income
        if expense_ratio < 0.7:
            score += 20
            reasons.append("Расходы меньше 70% дохода")
        elif expense_ratio < 0.9:
            score += 10
            reasons.append("Расходы под контролем")
        elif expense_ratio > 1.0:
            score -= 20
            reasons.append("⚠️ Расходы превышают доходы")
    
    # STS проверка
    # TODO: Передавать STS как параметр
    
    score = max(0.0, min(100.0, score))
    
    if score >= 75:
        status = "excellent"
    elif score >= 60:
        status = "good"
    elif score >= 40:
        status = "fair"
    else:
        status = "poor"
    
    return {
        "value": round(score, 1),
        "status": status,
        "reasons": reasons,  # НОВОЕ
    }
```

---

## ⏱️ Итоговый таймлайн

### Спринт 1: Критические баги (День 1-2, 14-20 часов)

| Задача | Время | Приоритет |
|--------|-------|-----------|
| 1.1 Consent Flow | 6 ч | 🔴 |
| 1.2 Refinancing API | 8 ч | 🔴 |
| 1.3 Loans/Deposits API | 6 ч | 🔴 |

### Спринт 2: Улучшения (День 3, 4-6 часов)

| Задача | Время | Приоритет |
|--------|-------|-----------|
| 2.1 Goal Selection блокировка | 2 ч | 🟠 |
| 2.2 Repayment Speed | 1 ч | 🟠 |
| 2.3 Health Reasons | 2 ч | 🟠 |

---

## ✅ Критерии готовности

### Для хакатона (минимум):
- [x] Онбординг работает по спецификации (ссылка на банк, polling)
- [x] Refinancing возвращает реальные офферы
- [x] Loans/Deposits Detail показывают реальные данные
- [x] Goal Selection блокирует недоступные режимы

### Для демонстрации (желательно):
- [x] Health Score с reasons
- [x] Repayment Speed сохраняется в БД
- [ ] Profile Screen (можно пропустить)

---

## 🚀 Следующие шаги

1. **Начать с Задачи 1.1** - самая критичная для соответствия спецификации
2. **Параллельно делать 1.2 и 1.3** - можно разделить между разработчиками
3. **После завершения критических** - переходить к улучшениям

**Результат:** Полноценный MVP, готовый к демонстрации на хакатоне через 18-26 часов работы.

