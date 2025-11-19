#!/usr/bin/env python3
"""
Детальный анализ запросов к балансам и кредитам
"""
import asyncio
import httpx
import json
import sys

sys.path.insert(0, '/home/kesha/MyCode/HACKATHON/CASH_PREDICT')

from hktn.core.obr_client import OBRAPIClient

async def test_balances_detailed():
    """Тестируем получение балансов с детальными логами"""
    
    bank_url = "https://abank.open.bankingapi.ru"
    client_id = "team260"
    client_secret = "wPnKt4ljvSh63JpV0Pmmqp2OeNFHWcYN"
    user_id = "team260-3"
    consent_id = "consent-df8ab442621e"  # из предыдущего теста
    
    client = OBRAPIClient(bank_url, client_id, client_secret)
    
    try:
        # 1. Получаем токен
        print("=" * 80)
        print("1. Получение bank token...")
        print("=" * 80)
        bank_token = await client._get_bank_token()
        print(f"✅ Token получен: {bank_token[:50]}...")
        
        # 2. Получаем accounts
        print("\n" + "=" * 80)
        print("2. Получение accounts...")
        print("=" * 80)
        headers = {
            "Authorization": f"Bearer {bank_token}",
            "X-Consent-Id": consent_id,
            "x-fapi-interaction-id": "test-debug"
        }
        
        response = await client._client.get(f"/accounts?client_id={user_id}", headers=headers)
        print(f"Status: {response.status_code}")
        accounts_data = response.json()
        print(f"Response: {json.dumps(accounts_data, indent=2, ensure_ascii=False)[:1000]}")
        
        accounts = client._extract_accounts(accounts_data)
        print(f"\n✅ Извлечено accounts: {len(accounts)}")
        
        if not accounts:
            print("❌ Нет accounts для тестирования балансов!")
            return
        
        # 3. Для каждого account пробуем получить balances
        print("\n" + "=" * 80)
        print("3. Получение balances для каждого account...")
        print("=" * 80)
        
        for account in accounts[:2]:  # первые 2
            account_id = client._extract_account_id(account)
            print(f"\n📊 Account ID: {account_id}")
            print(f"Account data: {json.dumps(account, indent=2, ensure_ascii=False)[:500]}")
            
            # Запрос к балансам
            balance_url = f"/accounts/{account_id}/balances"
            print(f"\n🔗 Запрос: GET {balance_url}")
            
            try:
                balance_response = await client._client.get(balance_url, headers=headers)
                print(f"Status: {balance_response.status_code}")
                
                if balance_response.status_code == 200:
                    balance_data = balance_response.json()
                    print(f"Response body:\n{json.dumps(balance_data, indent=2, ensure_ascii=False)}")
                    
                    # Пробуем извлечь через _jget
                    extracted = client._jget(balance_data, ["data", "Balance"], [])
                    print(f"\n📋 Извлечено балансов через ['data']['Balance']: {len(extracted)}")
                    
                    if not extracted:
                        print("⚠️ Путь ['data']['Balance'] не сработал, проверяем другие варианты:")
                        print(f"  - balance_data.keys(): {list(balance_data.keys()) if isinstance(balance_data, dict) else 'not dict'}")
                        if isinstance(balance_data, dict) and 'data' in balance_data:
                            print(f"  - balance_data['data'].keys(): {list(balance_data['data'].keys())}")
                else:
                    print(f"❌ Ошибка: {balance_response.text}")
                    
            except Exception as e:
                print(f"❌ Exception: {e}")
        
        # 4. Тестируем product agreements / credits
        print("\n" + "=" * 80)
        print("4. Получение product-agreements / credits...")
        print("=" * 80)
        
        urls_to_try = ["/credits", "/product-agreements"]
        header_variants = [
            {"X-Product-Agreement-Consent-Id": consent_id},
            {"X-Consent-Id": consent_id},
            {"x-product-agreement-consent-id": consent_id},
        ]
        
        for url in urls_to_try:
            print(f"\n🔗 Пробуем: GET {url}")
            
            for header_var in header_variants:
                test_headers = {
                    "Authorization": f"Bearer {bank_token}",
                    **header_var
                }
                header_name = list(header_var.keys())[0]
                print(f"\n  📝 С заголовком: {header_name}")
                
                try:
                    response = await client._client.get(
                        url, 
                        headers=test_headers,
                        params={"client_id": user_id}
                    )
                    print(f"  Status: {response.status_code}")
                    
                    if response.status_code == 200:
                        data = response.json()
                        print(f"  Response: {json.dumps(data, indent=2, ensure_ascii=False)[:1000]}")
                        
                        # Попробуем извлечь
                        extracted = client._extract_agreements(data)
                        print(f"  ✅ Извлечено agreements: {len(extracted)}")
                        
                        if extracted:
                            print(f"  Первый agreement: {json.dumps(extracted[0], indent=2, ensure_ascii=False)[:500]}")
                            break
                    else:
                        print(f"  ❌ Error: {response.text[:200]}")
                        
                except Exception as e:
                    print(f"  ❌ Exception: {e}")
            
            # Если хоть один вариант сработал - не пробуем другие URLs
            if response.status_code == 200:
                break
                
    finally:
        await client.close()
    
    print("\n" + "=" * 80)
    print("Тестирование завершено")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(test_balances_detailed())
