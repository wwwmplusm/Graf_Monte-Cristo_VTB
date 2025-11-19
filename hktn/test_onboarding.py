#!/usr/bin/env python3
"""
Тестовый скрипт для проверки onboarding эндпоинтов согласно TESTING_GUIDE.md
"""
import requests
import time
import json
import sys

BASE_URL = "http://localhost:8000"
USER_ID = "test-user-1"

def print_section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def print_result(success, message):
    status = "✅" if success else "❌"
    print(f"{status} {message}")

def check_endpoint_exists(endpoint, method="GET"):
    """Проверяет существование эндпоинта"""
    try:
        if method == "GET":
            response = requests.get(f"{BASE_URL}{endpoint}", timeout=2)
        else:
            response = requests.post(f"{BASE_URL}{endpoint}", json={}, timeout=2)
        # 404 означает что эндпоинт не найден, но сервер работает
        # 422/400 означает что эндпоинт существует, но параметры неверные
        return response.status_code != 404
    except Exception:
        return False

def test_backend_available():
    """Тест 0: Проверка доступности backend"""
    print_section("Тест 0: Проверка доступности Backend")
    try:
        response = requests.get(f"{BASE_URL}/docs", timeout=5)
        if response.status_code == 200:
            print_result(True, f"Backend доступен на {BASE_URL}")
            return True
        else:
            print_result(False, f"Backend вернул статус {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print_result(False, f"Не удалось подключиться к {BASE_URL}")
        print("   Убедитесь что backend запущен: uvicorn backend.app:app --reload --port 8000")
        return False
    except Exception as e:
        print_result(False, f"Ошибка: {e}")
        return False

def test_1_create_consents():
    """Тест 1: Создание согласий (POST /api/onboarding/consents)"""
    print_section("Тест 1: POST /api/onboarding/consents")
    
    # Проверяем существование эндпоинта
    if not check_endpoint_exists("/api/onboarding/consents", "POST"):
        print_result(False, "Эндпоинт /api/onboarding/consents не найден")
        print("   Возможно сервер запущен со старой версией кода")
        print("   Перезапустите сервер: uvicorn backend.app:app --reload --port 8000")
        return None
    
    url = f"{BASE_URL}/api/onboarding/consents"
    data = {
        "user_id": USER_ID,
        "banks": [
            {
                "bank_id": "abank",
                "consents": {
                    "account": True,
                    "product": True,
                    "payment": False
                }
            },
            {
                "bank_id": "vbank",
                "consents": {
                    "account": True,
                    "product": False,
                    "payment": True
                }
            }
        ]
    }
    
    try:
        response = requests.post(url, json=data, timeout=30)
        print(f"HTTP Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print_result(True, "Создание согласий успешно")
            
            # Проверяем структуру ответа
            checks = [
                ("results" in result, "Поле 'results' присутствует"),
                ("overall_status" in result, "Поле 'overall_status' присутствует"),
                ("user_id" in result, "Поле 'user_id' присутствует"),
                (len(result.get("results", [])) > 0, "Есть результаты для банков"),
            ]
            
            if len(result.get("results", [])) > 0:
                bank_result = result["results"][0]
                checks.extend([
                    ("bank_id" in bank_result, "Поле 'bank_id' в результате"),
                    ("bank_name" in bank_result, "Поле 'bank_name' в результате"),
                    ("account_consent" in bank_result, "Поле 'account_consent' в результате"),
                ])
            
            for check, msg in checks:
                print_result(check, msg)
            
            print(f"\nРезультат:")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return result
        else:
            print_result(False, f"Ошибка: {response.status_code}")
            print(f"Ответ: {response.text}")
            return None
            
    except Exception as e:
        print_result(False, f"Исключение: {e}")
        return None

def test_2_get_status():
    """Тест 2: Получение статуса согласий (GET /api/onboarding/consents/status)"""
    print_section("Тест 2: GET /api/onboarding/consents/status")
    
    # Проверяем существование эндпоинта
    if not check_endpoint_exists("/api/onboarding/consents/status", "GET"):
        print_result(False, "Эндпоинт /api/onboarding/consents/status не найден")
        print("   Возможно сервер запущен со старой версией кода")
        print("   Перезапустите сервер: uvicorn backend.app:app --reload --port 8000")
        return None
    
    url = f"{BASE_URL}/api/onboarding/consents/status"
    params = {"user_id": USER_ID}
    
    try:
        response = requests.get(url, params=params, timeout=10)
        print(f"HTTP Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print_result(True, "Получение статуса успешно")
            
            # Проверяем структуру ответа
            checks = [
                ("results" in result, "Поле 'results' присутствует"),
                ("user_id" in result, "Поле 'user_id' присутствует"),
            ]
            
            for check, msg in checks:
                print_result(check, msg)
            
            print(f"\nРезультат:")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return result
        else:
            print_result(False, f"Ошибка: {response.status_code}")
            print(f"Ответ: {response.text}")
            return None
            
    except Exception as e:
        print_result(False, f"Исключение: {e}")
        return None

def test_3_finalize():
    """Тест 3: Финализация онбординга (POST /api/onboarding/finalize)"""
    print_section("Тест 3: POST /api/onboarding/finalize")
    
    # Проверяем существование эндпоинта
    if not check_endpoint_exists("/api/onboarding/finalize", "POST"):
        print_result(False, "Эндпоинт /api/onboarding/finalize не найден")
        print("   Возможно сервер запущен со старой версией кода")
        print("   Перезапустите сервер: uvicorn backend.app:app --reload --port 8000")
        return None
    
    url = f"{BASE_URL}/api/onboarding/finalize"
    data = {
        "onboarding_id": f"{USER_ID}-onboarding",
        "user_id": USER_ID
    }
    
    try:
        response = requests.post(url, json=data, timeout=10)
        print(f"HTTP Status: {response.status_code}")
        
        # Может быть 200 или 400 в зависимости от наличия approved согласий
        if response.status_code == 200:
            result = response.json()
            print_result(True, "Финализация успешна (есть approved согласия)")
            
            checks = [
                ("status" in result, "Поле 'status' присутствует"),
                ("ready" in result, "Поле 'ready' присутствует"),
            ]
            
            for check, msg in checks:
                print_result(check, msg)
            
            print(f"\nРезультат:")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return result
        elif response.status_code == 400:
            result = response.json()
            print_result(True, "Финализация вернула 400 (нет approved согласий - ожидаемо)")
            print(f"Ответ: {result.get('detail', 'Unknown error')}")
            return result
        else:
            print_result(False, f"Неожиданный статус: {response.status_code}")
            print(f"Ответ: {response.text}")
            return None
            
    except Exception as e:
        print_result(False, f"Исключение: {e}")
        return None

def main():
    print("\n" + "="*60)
    print("  ТЕСТИРОВАНИЕ ONBOARDING ENDPOINTS")
    print("  Согласно TESTING_GUIDE.md")
    print("="*60)
    
    # Проверка доступности backend
    if not test_backend_available():
        print("\n❌ Backend недоступен. Прерывание тестов.")
        sys.exit(1)
    
    # Тест 1: Создание согласий
    create_result = test_1_create_consents()
    
    # Небольшая задержка перед проверкой статуса
    if create_result:
        print("\n⏳ Ожидание 2 секунды перед проверкой статуса...")
        time.sleep(2)
    
    # Тест 2: Получение статуса
    status_result = test_2_get_status()
    
    # Тест 3: Финализация
    test_3_finalize()
    
    # Итоги
    print_section("ИТОГИ ТЕСТИРОВАНИЯ")
    
    tests_passed = 0
    tests_failed = 0
    tests_skipped = 0
    
    if create_result is not None:
        tests_passed += 1
    elif create_result is False:
        tests_failed += 1
    else:
        tests_skipped += 1
    
    if status_result is not None:
        tests_passed += 1
    elif status_result is False:
        tests_failed += 1
    else:
        tests_skipped += 1
    
    print(f"✅ Успешно: {tests_passed}")
    print(f"❌ Провалено: {tests_failed}")
    print(f"⏭️  Пропущено: {tests_skipped}")
    
    if tests_failed > 0 or tests_skipped > 0:
        print("\n⚠️  ВНИМАНИЕ: Некоторые тесты не выполнены.")
        print("   Убедитесь что:")
        print("   1. Backend запущен: uvicorn backend.app:app --reload --port 8000")
        print("   2. Сервер перезагрузился после изменений кода")
        print("   3. Все зависимости установлены")
        sys.exit(1)
    else:
        print("\n✅ Все тесты пройдены успешно!")
        sys.exit(0)

if __name__ == "__main__":
    main()

