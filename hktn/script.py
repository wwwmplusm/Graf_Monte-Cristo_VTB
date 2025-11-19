import requests
import json
import os
import time
from datetime import datetime, timezone

# ================= КОНФИГУРАЦИЯ =================
CLIENT_ID = "team260"
CLIENT_SECRET = "wPnKt4ljvSh63JpV0Pmmqp2OeNFHWcYN"
TEAM_ID = CLIENT_ID # Глобальная переменная для заголовков

# Используем VBank, где, по опыту песочниц, лежат тестовые данные.
BASE_URL = "https://vbank.open.bankingapi.ru"

TARGET_USER_ID = f"{CLIENT_ID}-1" 
OUTPUT_DIR = "team260_data"

session = requests.Session()

# ================= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =================

def setup_directories():
    """Создает структуру папок"""
    folders = [
        f"{OUTPUT_DIR}/profile",
        f"{OUTPUT_DIR}/accounts",
        f"{OUTPUT_DIR}/products",
        f"{OUTPUT_DIR}/agreements"
    ]
    for folder in folders:
        os.makedirs(folder, exist_ok=True)
    print(f"📂 Директория данных: {OUTPUT_DIR}")
    print(f"🏦 Целевой банк: {BASE_URL}")

def save_json(data, filename, folder):
    """Сохраняет JSON с красивыми отступами"""
    filepath = os.path.join(OUTPUT_DIR, folder, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    print(f"   💾 Сохранено: {folder}/{filename}")

# ================= АВТОРИЗАЦИЯ И СОГЛАСИЯ =================

def get_bank_token():
    """Получает технический токен (Client Credentials)"""
    print("\n🔐 Авторизация...")
    url = f"{BASE_URL}/auth/bank-token"
    params = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET
    }
    try:
        resp = session.post(url, params=params)
        resp.raise_for_status()
        token = resp.json().get("access_token")
        print("   ✅ Токен получен")
        return token
    except Exception as e:
        print(f"   ❌ Критическая ошибка авторизации: {e}")
        exit(1)

def create_consent(token, type_):
    """Создает согласие, корректно передавая client_id в Query Params"""
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Requesting-Bank": CLIENT_ID,
        "Content-Type": "application/json"
    }
    
    # КРИТИЧНО для избежания 401 Unauthorized на product-agreement-consents
    params = {"client_id": TARGET_USER_ID}

    if type_ == "accounts":
        url = f"{BASE_URL}/account-consents/request"
        body = {
            "client_id": TARGET_USER_ID,
            "permissions": ["ReadAccountsDetail", "ReadBalances", "ReadTransactionsDetail"],
            "reason": "Full Data Export",
            "requesting_bank": CLIENT_ID,
            "requesting_bank_name": f"Team {CLIENT_ID} App"
        }
        filename = "account_consent.json"
    else: # products
        url = f"{BASE_URL}/product-agreement-consents/request"
        body = {
            "client_id": TARGET_USER_ID,
            "requesting_bank": CLIENT_ID,
            "read_product_agreements": True,
            "open_product_agreements": False,
            "close_product_agreements": False,
            "allowed_product_types": ["deposit", "credit", "card", "account"],
            "reason": "Full Data Export"
        }
        filename = "product_consent.json"

    try:
        resp = session.post(url, headers=headers, json=body, params=params)
        resp.raise_for_status()
        data = resp.json()
        c_id = data.get("consent_id") or data.get("data", {}).get("consentId")
        save_json(data, filename, "profile")
        print(f"   ✅ Согласие ({type_}) создано: {c_id}")
        return c_id
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Ошибка создания согласия {type_}: {e}")
        if e.response:
            print(f"   Ответ сервера: {e.response.text}")
        return None

# ================= ЛОГИКА ВЫГРУЗКИ ТРАНЗАКЦИЙ С ПАГИНАЦИЕЙ (ОБНОВЛЕННАЯ ВЕРСИЯ) =================

def get_all_transactions(account_id: str, token: str, consent_id: str) -> list[dict]:
    """
    Скачивает все страницы транзакций, используя пагинацию.
    Использует логику парсинга и логирования, предоставленную пользователем.
    """
    all_tx = []
    page = 1
    
    print(f"      ⏳ Скачиваем полную историю транзакций (limit=200, пагинация)...")

    while True:
        resp = session.get(
            f"{BASE_URL}/accounts/{account_id}/transactions",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Consent-Id": consent_id,
                "X-Requesting-Bank": TEAM_ID, 
            },
            params={
                "client_id": TARGET_USER_ID,
                "page": page,
                "limit": 50, # ВНИМАНИЕ: Если API требует 50, здесь должна быть 50
            }
        )

        if resp.status_code != 200:
            print(f"         ⚠️ [TX] account={account_id} page={page} status={resp.status_code}")
            print(f"         Ответ: {resp.text}")
            break

        body = resp.json()
        
        # VBank/ABank стиль (новый):
        chunk = body.get("data", {}).get("transaction", [])
        # или fallback (старый/другой):
        if not chunk:
            chunk = body.get("transactions", [])
        
        # Дополнительный fallback для OpenBanking Russia, где транзакции могут быть в 'data'
        if not chunk:
            chunk = body.get("data", {}).get("transactions", [])

        if not chunk:
            break

        all_tx.extend(chunk)
        print(f"         📄 Стр. {page}: получено {len(chunk)} шт.")
        
        # Если получено меньше лимита (200), то это последняя страница
        if len(chunk) < 200:
            break
            
        page += 1
        time.sleep(0.1)

    return all_tx

# ================= ОСНОВНАЯ ЛОГИКА СБОРА ДАННЫХ =================

def fetch_all_data(token, acc_consent, prod_consent):
    base_headers = {
        "Authorization": f"Bearer {token}",
        "X-Requesting-Bank": CLIENT_ID
    }
    
    # --- 1. СЧЕТА И ТРАНЗАКЦИИ ---
    print("\n📡 [1/3] Сбор данных по счетам...")
    if acc_consent:
        headers = base_headers.copy()
        headers["X-Consent-Id"] = acc_consent
        
        try:
            # 1.1 Список счетов
            url = f"{BASE_URL}/accounts"
            resp = session.get(url, headers=headers, params={"client_id": TARGET_USER_ID})
            
            if resp.status_code == 200:
                data = resp.json()
                save_json(data, "accounts_list.json", "accounts")
                
                # ИСПРАВЛЕНО: ищем "account" (структура VBank/ABank)
                accounts = data.get("data", {}).get("account", [])
                if not accounts: 
                    accounts = data.get("accounts", [])
                
                print(f"   Найдено счетов: {len(accounts)}")
                
                # Цикл по каждому счету
                if accounts: 
                    for acc in accounts:
                        aid = acc.get("accountId")
                        print(f"   ⬇️ Обработка счета: {aid}")
                        
                        # 1.2 Детали
                        det_resp = session.get(f"{url}/{aid}", headers=headers, params={"client_id": TARGET_USER_ID})
                        save_json(det_resp.json(), f"{aid}_details.json", "accounts")
                        
                        # 1.3 Баланс
                        bal_resp = session.get(f"{url}/{aid}/balances", headers=headers, params={"client_id": TARGET_USER_ID})
                        save_json(bal_resp.json(), f"{aid}_balance.json", "accounts")
                        
                        # 1.4 ВСЯ ИСТОРИЯ ТРАНЗАКЦИЙ (с исправленной пагинацией)
                        full_history = get_all_transactions(aid, token, acc_consent)
                        save_json(full_history, f"{aid}_full_transactions.json", "accounts")
                        print(f"      ✅ Итого сохранено транзакций: {len(full_history)}")
                    
            else:
                print(f"   ⚠️ Не удалось получить список счетов: {resp.status_code}")
                
        except Exception as e:
            print(f"   ❌ Ошибка в блоке счетов: {e}")
    else:
        print("   ⚠️ Пропуск: нет согласия на счета")

    # --- 2. ПРОДУКТЫ (КАТАЛОГ) ---
    print("\n📦 [2/3] Скачивание каталога продуктов...")
    try:
        # Каталог обычно не требует client_id, но headers отправляем для консистентности
        resp = session.get(f"{BASE_URL}/products", headers=base_headers)
        save_json(resp.json(), "catalog.json", "products")
    except Exception as e:
        print(f"   ⚠️ Ошибка каталога: {e}")

    # --- 3. ДОГОВОРЫ (AGREEMENTS) ---
    print("\n📄 [3/3] Сбор договоров пользователя...")
    if prod_consent:
        headers = base_headers.copy()
        headers["X-Product-Agreement-Consent-Id"] = prod_consent
        
        try:
            # 3.1 Список договоров
            url = f"{BASE_URL}/product-agreements"
            resp = session.get(url, headers=headers, params={"client_id": TARGET_USER_ID})
            
            if resp.status_code == 200:
                data = resp.json()
                save_json(data, "agreements_list.json", "agreements")
                
                # Список договоров находится непосредственно под ключом "data"
                agreements = data.get("data", [])
                
                print(f"   Найдено договоров: {len(agreements)}")
                
                # 3.2 Детали договоров
                for agr in agreements:
                    # Используем оба варианта ключей для надежности
                    ag_id = agr.get("agreementId") or agr.get("agreement_id")
                    if not ag_id:
                        print("      ⚠️ Пропущен договор без ID")
                        continue
                        
                    print(f"   ⬇️ Детали договора: {ag_id}")
                    det_resp = session.get(f"{url}/{ag_id}", headers=headers, params={"client_id": TARGET_USER_ID})
                    save_json(det_resp.json(), f"{ag_id}.json", "agreements")
            else:
                print(f"   ⚠️ Не удалось получить договоры: {resp.status_code}")
                
        except Exception as e:
            print(f"   ❌ Ошибка в блоке договоров: {e}")
    else:
        print("   ⚠️ Пропуск: нет согласия на продукты")

# ================= ЗАПУСК СКРИПТА =================

if __name__ == "__main__":
    setup_directories()
    
    # 1. Получаем токен
    token = get_bank_token()
    
    # 2. Создаем согласия (с исправленной передачей client_id)
    print("\n✍️  Запрос согласий...")
    acc_consent_id = create_consent(token, "accounts")
    prod_consent_id = create_consent(token, "products")
    
    if not acc_consent_id and not prod_consent_id:
        print("\n⛔ Не получено ни одного согласия. Проверьте client_secret и BASE_URL.")
        exit()

    # 3. Скачиваем все данные
    fetch_all_data(token, acc_consent_id, prod_consent_id)
    
    print("\n✨ ВЫГРУЗКА ЗАВЕРШЕНА. Все данные, включая полную историю транзакций, сохранены.")