#!/usr/bin/env python3
"""Test script to check bank API endpoints"""
import asyncio
import httpx

async def test_bank():
    # Test А-Банк
    base_url = "https://abank.open.bankingapi.ru"
    client_id = "team260"
    client_secret = "wPnKt4ljvSh63JpV0Pmmqp2OeNFHWcYN"  # из логов
    
    async with httpx.AsyncClient(base_url=base_url, timeout=30.0) as client:
        # 1. Get bank token
        print(f"🔑 Getting bank token from {base_url}...")
        response = await client.post(
            "/auth/bank-token",
            params={"client_id": client_id, "client_secret": client_secret}
        )
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            token_data = response.json()
            bank_token = token_data["access_token"]
            print(f"✅ Bank token obtained: {bank_token[:50]}...")
            
            # 2. Try different consent endpoints
            user_id = "team260-test-1"
            headers = {
                "Authorization": f"Bearer {bank_token}",
                "Content-Type": "application/json",
                "x-fapi-interaction-id": "test-123"
            }
            body = {
                "client_id": user_id,
                "permissions": ["ReadAccountsDetail", "ReadBalances", "ReadTransactionsDetail"],
                "reason": "Test",
                "requesting_bank": client_id,
                "requesting_bank_name": f"{client_id} App",
                "redirect_uri": "http://localhost:5173/callback",
            }
            
            # Try variant 1
            print(f"\n📝 Trying POST /account-consents/request...")
            try:
                response = await client.post("/account-consents/request", headers=headers, json=body)
                print(f"Status: {response.status_code}")
                print(f"Response: {response.text[:500]}")
            except Exception as e:
                print(f"Error: {e}")
            
            # Try variant 2
            print(f"\n📝 Trying POST /consents/accounts...")
            try:
                response = await client.post("/consents/accounts", headers=headers, json=body)
                print(f"Status: {response.status_code}")
                print(f"Response: {response.text[:500]}")
            except Exception as e:
                print(f"Error: {e}")
                
            # Try variant 3
            print(f"\n📝 Trying POST /accounts-consents...")
            try:
                response = await client.post("/accounts-consents", headers=headers, json=body)
                print(f"Status: {response.status_code}")
                print(f"Response: {response.text[:500]}")
            except Exception as e:
                print(f"Error: {e}")
        else:
            print(f"❌ Failed to get bank token: {response.text}")

if __name__ == "__main__":
    asyncio.run(test_bank())
