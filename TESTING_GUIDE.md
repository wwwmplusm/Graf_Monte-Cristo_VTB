# Руководство по тестированию Приоритета 1

## Подготовка

### 1. Запуск Backend

```bash
cd /home/kesha/MyCode/HACKATHON/CASH_PREDICT/hktn

# Активируйте виртуальное окружение (если используется)
# source venv/bin/activate

# Запустите backend сервер
uvicorn backend.app:app --reload --port 8000
```

**Ожидаемый результат**: Сервер запускается на `http://localhost:8000`

Проверьте что сервер работает:
```bash
curl http://localhost:8000/docs
```
Должна открыться Swagger UI документация.

---

## Тестирование Backend

### Тест 1: Создание согласий (POST /api/onboarding/consents)

**Команда**:
```bash
curl -X POST "http://localhost:8000/api/onboarding/consents" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user-1",
    "banks": [
      {
        "bank_id": "bank-a",
        "consents": {
          "account": true,
          "product": true,
          "payment": false
        }
      },
      {
        "bank_id": "bank-b",
        "consents": {
          "account": true,
          "product": false,
          "payment": true
        }
      }
    ]
  }'
```

**Ожидаемый результат**:
```json
{
  "results": [
    {
      "bank_id": "bank-a",
      "bank_name": "Банк A",
      "account_consent": {
        "status": "approved" | "pending" | "creating" | "error",
        "consent_id": "...",
        "request_id": "...",
        "approval_url": "..." // если требуется подтверждение
      },
      "product_consent": {
        "status": "...",
        "consent_id": "...",
        ...
      },
      "payment_consent": null
    },
    {
      "bank_id": "bank-b",
      ...
    }
  ],
  "user_id": "test-user-1",
  "overall_status": "in_progress" | "completed" | "partial" | "error"
}
```

**Что проверить**:
- ✅ Структура ответа соответствует ожидаемой
- ✅ Для каждого банка возвращается `bank_name`
- ✅ Для каждого типа согласия возвращается детальная информация
- ✅ `overall_status` корректно отражает общее состояние

---

### Тест 2: Получение статуса согласий (GET /api/onboarding/consents/status)

**Команда**:
```bash
curl "http://localhost:8000/api/onboarding/consents/status?user_id=test-user-1"
```

**Ожидаемый результат**:
```json
{
  "results": [
    {
      "bank_id": "bank-a",
      "bank_name": "Банк A",
      "account_consent": {
        "status": "approved" | "pending" | "creating",
        "consent_id": "...",
        "request_id": "...",
        "approval_url": "..."
      },
      "product_consent": {
        "status": "...",
        ...
      },
      "payment_consent": null
    }
  ],
  "user_id": "test-user-1"
}
```

**Что проверить**:
- ✅ Возвращаются все согласия пользователя из БД
- ✅ Статусы корректно маппятся (APPROVED → "approved", AWAITING_USER → "pending")
- ✅ Структура соответствует структуре из `create_multiple_consents()`

---

### Тест 3: Финализация онбординга (POST /api/onboarding/finalize)

**Команда**:
```bash
curl -X POST "http://localhost:8000/api/onboarding/finalize" \
  -H "Content-Type: application/json" \
  -d '{
    "onboarding_id": "test-onboarding-1",
    "user_id": "test-user-1"
  }'
```

**Ожидаемый результат** (если есть approved согласия):
```json
{
  "onboarding_id": "test-onboarding-1",
  "user_id": "test-user-1",
  "status": "completed",
  "ready": true,
  "approved_consents_count": 2
}
```

**Ожидаемый результат** (если нет approved согласий):
```json
{
  "detail": "No approved consents found. Cannot finalize onboarding."
}
```
HTTP статус: 400

**Что проверить**:
- ✅ Валидация наличия approved согласий работает
- ✅ Проверка обязательных account consents работает
- ✅ Возвращается корректная структура ответа

---

## Тестирование Frontend

### 1. Запуск Frontend

```bash
cd /home/kesha/MyCode/HACKATHON/CASH_PREDICT/hktn

# Установите зависимости (если еще не установлены)
npm install

# Запустите dev сервер
npm run dev
```

**Ожидаемый результат**: Frontend запускается на `http://localhost:5173` (или другом порту)

---

### 2. Тестирование полного flow онбординга

#### Шаг 1: UserInfo
1. Откройте `http://localhost:5173` (или другой порт)
2. Введите `user_id` (например: `test-user-1`)
3. Введите имя (например: `Тестовый Пользователь`)
4. Нажмите "Продолжить"

**Что проверить**:
- ✅ Переход на следующий шаг
- ✅ Stepper показывает шаг 1 из 6

---

#### Шаг 2: BanksAndConsents
1. Выберите хотя бы один банк (чекбокс)
2. Для выбранного банка отметьте согласия:
   - ✅ Доступ к счетам (обязательно)
   - ✅ Доступ к продуктам (опционально)
   - ✅ Разрешение на платежи (опционально)
3. Нажмите "Продолжить"

**Что проверить**:
- ✅ Кнопка "Продолжить" активна только если выбран хотя бы один банк с account consent
- ✅ Переход на шаг 3 (ConsentProgress)

---

#### Шаг 3: ConsentProgress (НОВЫЙ ШАГ)
1. Должен автоматически начаться процесс создания согласий
2. Должен появиться progress bar с процентами
3. Для каждого банка должны отображаться:
   - Статус каждого типа согласия
   - Иконки статусов (spinner для "creating", галочка для "approved", и т.д.)
   - Ссылки "Подтвердить" для pending согласий (если есть approval_url)

**Что проверить**:
- ✅ Progress bar обновляется в реальном времени
- ✅ Polling работает (статусы обновляются каждые 2.5 секунды)
- ✅ Ссылки на approval_url открываются в новой вкладке
- ✅ Кнопка "Продолжить" активна только когда все account consents approved
- ✅ Кнопка показывает "Ожидание подтверждения..." когда не все готово

**Проверка polling**:
- Откройте DevTools → Network
- Должны видеть запросы к `/api/onboarding/consents/status` каждые 2.5 секунды
- После завершения всех согласий polling должен остановиться

**Проверка ошибок**:
- Если backend недоступен, должна показаться ошибка
- Кнопка "Повторить" должна работать

---

#### Шаг 4: ProductSelection
1. Выберите продукты для подключенных банков (если есть)
2. Нажмите "Продолжить"

**Что проверить**:
- ✅ Переход на шаг 5

---

#### Шаг 5: Questions
1. Выберите цели (накопление / закрытие кредитов / оба)
2. Если выбрано накопление - введите сумму и скорость
3. Если выбрано закрытие кредитов - выберите скорость
4. Нажмите "Завершить"

**Что проверить**:
- ✅ Переход на шаг 6 (Summary)

---

#### Шаг 6: Summary (НОВЫЙ ШАГ)
1. Должна отображаться сводка:
   - Подключенные банки с типами согласий
   - Выбранные продукты (если есть)
   - Цели (тип, стратегия, суммы)

**Что проверить**:
- ✅ Все выбранные настройки отображаются корректно
- ✅ Кнопка "Назад" возвращает на шаг 5
- ✅ Кнопка "Готово" вызывает финализацию

**Проверка финализации**:
1. Нажмите "Готово"
2. Должно показаться loading состояние ("Завершение...")
3. В DevTools → Network должен быть запрос к `/api/onboarding/finalize`
4. После успешной финализации должен вызваться `onComplete()` из OnboardingScreen

---

### 3. Тестирование edge cases

#### Тест: Нет выбранных банков
- Попробуйте перейти на шаг 2 без выбора банков
- Кнопка "Продолжить" должна быть неактивна

#### Тест: Банк без account consent
- Выберите банк, но не отметьте account consent
- Кнопка "Продолжить" должна быть неактивна
- Должно показаться предупреждение

#### Тест: Backend недоступен
- Остановите backend сервер
- Попробуйте создать согласия
- Должна показаться ошибка с возможностью повтора

#### Тест: Нет продуктов
- Пропустите шаг выбора продуктов (если возможно)
- Summary должен корректно отображаться без секции продуктов

#### Тест: Нет целей
- Пропустите шаг выбора целей (если возможно)
- Summary должен корректно отображаться без секции целей

---

## Автоматизированное тестирование (опционально)

### Тест через Python скрипт

Создайте файл `test_onboarding.py`:

```python
import requests
import time

BASE_URL = "http://localhost:8000"
USER_ID = "test-user-1"

def test_create_consents():
    """Тест создания согласий"""
    url = f"{BASE_URL}/api/onboarding/consents"
    data = {
        "user_id": USER_ID,
        "banks": [
            {
                "bank_id": "bank-a",
                "consents": {
                    "account": True,
                    "product": True,
                    "payment": False
                }
            }
        ]
    }
    
    response = requests.post(url, json=data)
    assert response.status_code == 200
    result = response.json()
    
    assert "results" in result
    assert "overall_status" in result
    assert len(result["results"]) > 0
    
    bank_result = result["results"][0]
    assert "bank_id" in bank_result
    assert "bank_name" in bank_result
    assert "account_consent" in bank_result
    
    print("✅ Create consents test passed")
    return result

def test_get_status():
    """Тест получения статуса"""
    url = f"{BASE_URL}/api/onboarding/consents/status"
    params = {"user_id": USER_ID}
    
    response = requests.get(url, params=params)
    assert response.status_code == 200
    result = response.json()
    
    assert "results" in result
    assert "user_id" in result
    
    print("✅ Get status test passed")
    return result

def test_finalize():
    """Тест финализации"""
    url = f"{BASE_URL}/api/onboarding/finalize"
    data = {
        "onboarding_id": f"{USER_ID}-onboarding",
        "user_id": USER_ID
    }
    
    response = requests.post(url, json=data)
    # Может быть 200 или 400 в зависимости от наличия approved согласий
    assert response.status_code in [200, 400]
    
    if response.status_code == 200:
        result = response.json()
        assert "status" in result
        assert "ready" in result
        print("✅ Finalize test passed (with approved consents)")
    else:
        print("✅ Finalize test passed (no approved consents - expected)")

if __name__ == "__main__":
    print("Testing onboarding endpoints...")
    
    try:
        # Тест 1: Создание согласий
        create_result = test_create_consents()
        
        # Подождем немного
        time.sleep(2)
        
        # Тест 2: Получение статуса
        status_result = test_get_status()
        
        # Тест 3: Финализация
        test_finalize()
        
        print("\n✅ All tests passed!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        raise
```

Запуск:
```bash
cd /home/kesha/MyCode/HACKATHON/CASH_PREDICT/hktn
python test_onboarding.py
```

---

## Чеклист тестирования

### Backend
- [ ] POST /api/onboarding/consents возвращает детальную структуру
- [ ] GET /api/onboarding/consents/status возвращает статусы из БД
- [ ] POST /api/onboarding/finalize валидирует наличие согласий
- [ ] Обработка ошибок работает корректно
- [ ] Логирование работает

### Frontend
- [ ] Step2ConsentProgress отображается после Step2
- [ ] Progress bar обновляется
- [ ] Polling работает (запросы каждые 2.5 сек)
- [ ] Ссылки на approval_url работают
- [ ] Кнопка "Продолжить" активна только когда все account consents approved
- [ ] Step6Summary отображается после Step5
- [ ] Summary показывает все выбранные настройки
- [ ] Финализация работает корректно
- [ ] Stepper показывает 6 шагов
- [ ] Навигация назад работает на всех шагах

---

## Отладка

### Проблема: Backend не запускается
- Проверьте что порт 8000 свободен: `lsof -i :8000`
- Проверьте зависимости: `pip install -r requirements.txt`
- Проверьте логи ошибок в консоли

### Проблема: Frontend не подключается к Backend
- Проверьте что backend запущен на `http://localhost:8000`
- Проверьте CORS настройки в `backend/config.py`
- Проверьте `API_BASE_URL` в `src/utils/api.ts`

### Проблема: Polling не работает
- Откройте DevTools → Console
- Проверьте ошибки JavaScript
- Проверьте Network tab - должны быть запросы к `/api/onboarding/consents/status`

### Проблема: Согласия не создаются
- Проверьте логи backend в консоли
- Проверьте что банки существуют в конфигурации
- Проверьте что credentials настроены в `.env`

---

## Полезные команды

### Проверка что backend работает
```bash
curl http://localhost:8000/docs
```

### Проверка конкретного endpoint
```bash
curl -X GET "http://localhost:8000/api/onboarding/consents/status?user_id=test-user-1" | jq
```

### Просмотр логов backend
Логи выводятся в консоль где запущен uvicorn. Для более детального логирования:
```bash
uvicorn backend.app:app --reload --port 8000 --log-level debug
```

### Проверка базы данных
```bash
sqlite3 hktn/finpulse.db "SELECT * FROM consents WHERE user_id='test-user-1';"
```

