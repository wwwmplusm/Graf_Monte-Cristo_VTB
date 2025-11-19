#!/bin/bash

# ============================================================================
# ИСПРАВЛЕННЫЙ СКРИПТ СБОРА ДАННЫХ ПОЛЬЗОВАТЕЛЯ team260-3 ИЗ ТРЁХ БАНКОВ
# ============================================================================
# ОШИБКИ, КОТОРЫЕ БЫЛИ ИСПРАВЛЕНЫ:
# 1. ❌ curl -d "client_id=..." (передавались в body через x-www-form-urlencoded)
# 2. ✅ curl "?client_id=...&client_secret=..." (должны быть в QUERY параметрах!)
#
# 3. ❌ Заголовок X-Requesting-Bank указывали как team260-1 (клиент)
# 4. ✅ X-Requesting-Bank должен быть team260 (только ID команды!)
#
# 5. ❌ Заголовок X-Consent-Id при создании согласия
# 6. ✅ При создании согласия заголовок НЕ нужен, только Authorization
# ============================================================================

# ПЕРЕМЕННЫЕ КОНФИГУРАЦИИ
# ============================================================================
CLIENT_ID="team260"
CLIENT_SECRET="wPnKt4ljvSh63JpV0Pmmqp2OeNFHWcYN"
CLIENT_USER="team260-3"
REQUESTING_BANK="team260"  # ⚠️ ТОЛЬКО ID команды! БЕЗ суффикса -3

ABANK_API_URL="https://abank.open.bankingapi.ru"
VBANK_API_URL="https://vbank.open.bankingapi.ru"
SBANK_API_URL="https://sbank.open.bankingapi.ru"

OUTPUT_DIR="./data_team260-3"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Создаём директорию для результатов
mkdir -p "${OUTPUT_DIR}"

# ============================================================================
# ФУНКЦИИ ВСПОМОГАТЕЛЬНЫЕ
# ============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

save_response() {
    local endpoint=$1
    local response=$2
    local bank_name=$3
    local filename="${OUTPUT_DIR}/${bank_name}_${endpoint//\//_}_${TIMESTAMP}.json"
    echo "$response" | jq '.' > "$filename" 2>/dev/null || echo "$response" > "$filename"
    log "✓ Сохранено: $filename"
}

# ============================================================================
# ШАГ 1: АУТЕНТИФИКАЦИЯ - ПОЛУЧЕНИЕ ACCESS TOKENS
# ============================================================================

log "================================"
log "ШАГ 1: ПОЛУЧЕНИЕ ACCESS TOKENS"
log "================================"

# ✅ ИСПРАВКА #1: Параметры в QUERY, не в BODY!
log "Получаю токен для ABank..."
ABANK_TOKEN_RESPONSE=$(curl -s -X POST \
    "${ABANK_API_URL}/auth/bank-token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}")

ABANK_TOKEN=$(echo "$ABANK_TOKEN_RESPONSE" | jq -r '.access_token // empty')
log "✓ ABank токен получен: ${ABANK_TOKEN:0:50}..."
save_response "auth_bank_token" "$ABANK_TOKEN_RESPONSE" "abank"

log "Получаю токен для VBank..."
VBANK_TOKEN_RESPONSE=$(curl -s -X POST \
    "${VBANK_API_URL}/auth/bank-token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}")

VBANK_TOKEN=$(echo "$VBANK_TOKEN_RESPONSE" | jq -r '.access_token // empty')
log "✓ VBank токен получен: ${VBANK_TOKEN:0:50}..."
save_response "auth_bank_token" "$VBANK_TOKEN_RESPONSE" "vbank"

log "Получаю токен для SBank..."
SBANK_TOKEN_RESPONSE=$(curl -s -X POST \
    "${SBANK_API_URL}/auth/bank-token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}")

SBANK_TOKEN=$(echo "$SBANK_TOKEN_RESPONSE" | jq -r '.access_token // empty')
log "✓ SBank токен получен: ${SBANK_TOKEN:0:50}..."
save_response "auth_bank_token" "$SBANK_TOKEN_RESPONSE" "sbank"

# Проверка, что токены получены
if [ -z "$ABANK_TOKEN" ] || [ -z "$VBANK_TOKEN" ] || [ -z "$SBANK_TOKEN" ]; then
    log "❌ ОШИБКА: Не удалось получить токены!"
    log "ABANK_TOKEN: $ABANK_TOKEN"
    log "VBANK_TOKEN: $VBANK_TOKEN"
    log "SBANK_TOKEN: $SBANK_TOKEN"
    exit 1
fi

# ============================================================================
# ШАГ 2: СОЗДАНИЕ СОГЛАСИЙ (CONSENTS) НА ДОСТУП К СЧЕТАМ
# ============================================================================

log ""
log "================================"
log "ШАГ 2: СОЗДАНИЕ СОГЛАСИЙ (ACCOUNT CONSENTS)"
log "================================"

# Account Consent для ABANK
log "Создаю Account Consent для ABank (client_id=${CLIENT_USER})..."
ABANK_ACCOUNT_CONSENT=$(curl -s -X POST "${ABANK_API_URL}/account-consents/request" \
    -H "Authorization: Bearer ${ABANK_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
    -d '{
        "client_id": "'${CLIENT_USER}'",
        "permissions": [
            "ReadAccountsDetail",
            "ReadBalances",
            "ReadTransactionsDetail"
        ],
        "reason": "Агрегация счетов для HackAPI",
        "requesting_bank": "'${REQUESTING_BANK}'",
        "requesting_bank_name": "Team 260"
    }')

# ✅ ИСПРАВКА #2: Извлекаем consentId из ответа
ABANK_CONSENT_ID=$(echo "$ABANK_ACCOUNT_CONSENT" | jq -r '.data.consentId // .consentId // empty')
log "✓ ABank Account Consent создан: $ABANK_CONSENT_ID"
save_response "account_consents_request" "$ABANK_ACCOUNT_CONSENT" "abank"

# Account Consent для VBANK
log "Создаю Account Consent для VBank..."
VBANK_ACCOUNT_CONSENT=$(curl -s -X POST "${VBANK_API_URL}/account-consents/request" \
    -H "Authorization: Bearer ${VBANK_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
    -d '{
        "client_id": "'${CLIENT_USER}'",
        "permissions": [
            "ReadAccountsDetail",
            "ReadBalances",
            "ReadTransactionsDetail"
        ],
        "reason": "Агрегация счетов для HackAPI",
        "requesting_bank": "'${REQUESTING_BANK}'",
        "requesting_bank_name": "Team 260"
    }')

VBANK_CONSENT_ID=$(echo "$VBANK_ACCOUNT_CONSENT" | jq -r '.data.consentId // .consentId // empty')
log "✓ VBank Account Consent создан: $VBANK_CONSENT_ID"
save_response "account_consents_request" "$VBANK_ACCOUNT_CONSENT" "vbank"

# Account Consent для SBANK
log "Создаю Account Consent для SBank..."
SBANK_ACCOUNT_CONSENT=$(curl -s -X POST "${SBANK_API_URL}/account-consents/request" \
    -H "Authorization: Bearer ${SBANK_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
    -d '{
        "client_id": "'${CLIENT_USER}'",
        "permissions": [
            "ReadAccountsDetail",
            "ReadBalances",
            "ReadTransactionsDetail"
        ],
        "reason": "Агрегация счетов для HackAPI",
        "requesting_bank": "'${REQUESTING_BANK}'",
        "requesting_bank_name": "Team 260"
    }')

SBANK_CONSENT_ID=$(echo "$SBANK_ACCOUNT_CONSENT" | jq -r '.data.consentId // .consentId // empty')
log "✓ SBank Account Consent создан: $SBANK_CONSENT_ID"
save_response "account_consents_request" "$SBANK_ACCOUNT_CONSENT" "sbank"

# ============================================================================
# ШАГ 3: ПОЛУЧЕНИЕ СПИСКА СЧЕТОВ
# ============================================================================

log ""
log "================================"
log "ШАГ 3: ПОЛУЧЕНИЕ СПИСКА СЧЕТОВ"
log "================================"

# Получение счетов ABANK
# ✅ ИСПРАВКА #3: X-Requesting-Bank = team260 (БЕЗ суффикса -3!)
log "Получаю счета ABank (client_id=${CLIENT_USER})..."
ABANK_ACCOUNTS=$(curl -s -X GET \
    "${ABANK_API_URL}/accounts?client_id=${CLIENT_USER}" \
    -H "Authorization: Bearer ${ABANK_TOKEN}" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
    -H "X-Consent-Id: ${ABANK_CONSENT_ID}")

log "✓ Ответ ABank получен"
save_response "accounts" "$ABANK_ACCOUNTS" "abank"

# Получение счетов VBANK
log "Получаю счета VBank..."
VBANK_ACCOUNTS=$(curl -s -X GET \
    "${VBANK_API_URL}/accounts?client_id=${CLIENT_USER}" \
    -H "Authorization: Bearer ${VBANK_TOKEN}" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
    -H "X-Consent-Id: ${VBANK_CONSENT_ID}")

log "✓ Ответ VBank получен"
save_response "accounts" "$VBANK_ACCOUNTS" "vbank"

# Получение счетов SBANK
log "Получаю счета SBank..."
SBANK_ACCOUNTS=$(curl -s -X GET \
    "${SBANK_API_URL}/accounts?client_id=${CLIENT_USER}" \
    -H "Authorization: Bearer ${SBANK_TOKEN}" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
    -H "X-Consent-Id: ${SBANK_CONSENT_ID}")

log "✓ Ответ SBank получен"
save_response "accounts" "$SBANK_ACCOUNTS" "sbank"

# Парсим account_id'ы
ABANK_ACCOUNT_IDS=$(echo "$ABANK_ACCOUNTS" | jq -r '.data[]?.account_id // .accounts[]?.account_id // .accounts[]?.id // empty' 2>/dev/null | sort | uniq)
VBANK_ACCOUNT_IDS=$(echo "$VBANK_ACCOUNTS" | jq -r '.data[]?.account_id // .accounts[]?.account_id // .accounts[]?.id // empty' 2>/dev/null | sort | uniq)
SBANK_ACCOUNT_IDS=$(echo "$SBANK_ACCOUNTS" | jq -r '.data[]?.account_id // .accounts[]?.account_id // .accounts[]?.id // empty' 2>/dev/null | sort | uniq)

log "ABank счетов: $(echo "$ABANK_ACCOUNT_IDS" | wc -l)"
log "VBank счетов: $(echo "$VBANK_ACCOUNT_IDS" | wc -l)"
log "SBank счетов: $(echo "$SBANK_ACCOUNT_IDS" | wc -l)"

# ============================================================================
# ШАГ 4: ПОЛУЧЕНИЕ БАЛАНСОВ
# ============================================================================

log ""
log "================================"
log "ШАГ 4: ПОЛУЧЕНИЕ БАЛАНСОВ"
log "================================"

for ACCOUNT_ID in $ABANK_ACCOUNT_IDS; do
    [ -z "$ACCOUNT_ID" ] && continue
    log "Баланс счета $ACCOUNT_ID (ABank)..."
    ABANK_BALANCE=$(curl -s -X GET \
        "${ABANK_API_URL}/accounts/${ACCOUNT_ID}/balances" \
        -H "Authorization: Bearer ${ABANK_TOKEN}" \
        -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
        -H "X-Consent-Id: ${ABANK_CONSENT_ID}")
    save_response "balances_${ACCOUNT_ID}" "$ABANK_BALANCE" "abank"
done

for ACCOUNT_ID in $VBANK_ACCOUNT_IDS; do
    [ -z "$ACCOUNT_ID" ] && continue
    log "Баланс счета $ACCOUNT_ID (VBank)..."
    VBANK_BALANCE=$(curl -s -X GET \
        "${VBANK_API_URL}/accounts/${ACCOUNT_ID}/balances" \
        -H "Authorization: Bearer ${VBANK_TOKEN}" \
        -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
        -H "X-Consent-Id: ${VBANK_CONSENT_ID}")
    save_response "balances_${ACCOUNT_ID}" "$VBANK_BALANCE" "vbank"
done

for ACCOUNT_ID in $SBANK_ACCOUNT_IDS; do
    [ -z "$ACCOUNT_ID" ] && continue
    log "Баланс счета $ACCOUNT_ID (SBank)..."
    SBANK_BALANCE=$(curl -s -X GET \
        "${SBANK_API_URL}/accounts/${ACCOUNT_ID}/balances" \
        -H "Authorization: Bearer ${SBANK_TOKEN}" \
        -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
        -H "X-Consent-Id: ${SBANK_CONSENT_ID}")
    save_response "balances_${ACCOUNT_ID}" "$SBANK_BALANCE" "sbank"
done

# ============================================================================
# ШАГ 5: ПОЛУЧЕНИЕ ТРАНЗАКЦИЙ
# ============================================================================

log ""
log "================================"
log "ШАГ 5: ПОЛУЧЕНИЕ ТРАНЗАКЦИЙ"
log "================================"

for ACCOUNT_ID in $ABANK_ACCOUNT_IDS; do
    [ -z "$ACCOUNT_ID" ] && continue
    log "Транзакции счета $ACCOUNT_ID (ABank)..."
    ABANK_TRANSACTIONS=$(curl -s -X GET \
        "${ABANK_API_URL}/accounts/${ACCOUNT_ID}/transactions?page=1&limit=100" \
        -H "Authorization: Bearer ${ABANK_TOKEN}" \
        -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
        -H "X-Consent-Id: ${ABANK_CONSENT_ID}")
    save_response "transactions_${ACCOUNT_ID}" "$ABANK_TRANSACTIONS" "abank"
done

for ACCOUNT_ID in $VBANK_ACCOUNT_IDS; do
    [ -z "$ACCOUNT_ID" ] && continue
    log "Транзакции счета $ACCOUNT_ID (VBank)..."
    VBANK_TRANSACTIONS=$(curl -s -X GET \
        "${VBANK_API_URL}/accounts/${ACCOUNT_ID}/transactions?page=1&limit=100" \
        -H "Authorization: Bearer ${VBANK_TOKEN}" \
        -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
        -H "X-Consent-Id: ${VBANK_CONSENT_ID}")
    save_response "transactions_${ACCOUNT_ID}" "$VBANK_TRANSACTIONS" "vbank"
done

for ACCOUNT_ID in $SBANK_ACCOUNT_IDS; do
    [ -z "$ACCOUNT_ID" ] && continue
    log "Транзакции счета $ACCOUNT_ID (SBank)..."
    SBANK_TRANSACTIONS=$(curl -s -X GET \
        "${SBANK_API_URL}/accounts/${ACCOUNT_ID}/transactions?page=1&limit=100" \
        -H "Authorization: Bearer ${SBANK_TOKEN}" \
        -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
        -H "X-Consent-Id: ${SBANK_CONSENT_ID}")
    save_response "transactions_${ACCOUNT_ID}" "$SBANK_TRANSACTIONS" "sbank"
done

# ============================================================================
# ШАГ 6: ПОЛУЧЕНИЕ ДОГОВОРОВ ПО ПРОДУКТАМ
# ============================================================================

log ""
log "================================"
log "ШАГ 6: ПОЛУЧЕНИЕ ДОГОВОРОВ"
log "================================"

log "Договоры (ABank)..."
ABANK_PRODUCT_AGREEMENTS=$(curl -s -X GET \
    "${ABANK_API_URL}/product-agreements?client_id=${CLIENT_USER}" \
    -H "Authorization: Bearer ${ABANK_TOKEN}" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}")
save_response "product_agreements" "$ABANK_PRODUCT_AGREEMENTS" "abank"

log "Договоры (VBank)..."
VBANK_PRODUCT_AGREEMENTS=$(curl -s -X GET \
    "${VBANK_API_URL}/product-agreements?client_id=${CLIENT_USER}" \
    -H "Authorization: Bearer ${VBANK_TOKEN}" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}")
save_response "product_agreements" "$VBANK_PRODUCT_AGREEMENTS" "vbank"

log "Договоры (SBank)..."
SBANK_PRODUCT_AGREEMENTS=$(curl -s -X GET \
    "${SBANK_API_URL}/product-agreements?client_id=${CLIENT_USER}" \
    -H "Authorization: Bearer ${SBANK_TOKEN}" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}")
save_response "product_agreements" "$SBANK_PRODUCT_AGREEMENTS" "sbank"

# ============================================================================
# ШАГ 7: ПОЛУЧЕНИЕ КАТАЛОГА ПРОДУКТОВ
# ============================================================================

log ""
log "================================"
log "ШАГ 7: КАТАЛОГ ПРОДУКТОВ"
log "================================"

log "Каталог продуктов (ABank)..."
ABANK_PRODUCTS=$(curl -s -X GET \
    "${ABANK_API_URL}/products" \
    -H "Authorization: Bearer ${ABANK_TOKEN}")
save_response "products_catalog" "$ABANK_PRODUCTS" "abank"

log "Каталог продуктов (VBank)..."
VBANK_PRODUCTS=$(curl -s -X GET \
    "${VBANK_API_URL}/products" \
    -H "Authorization: Bearer ${VBANK_TOKEN}")
save_response "products_catalog" "$VBANK_PRODUCTS" "vbank"

log "Каталог продуктов (SBank)..."
SBANK_PRODUCTS=$(curl -s -X GET \
    "${SBANK_API_URL}/products" \
    -H "Authorization: Bearer ${SBANK_TOKEN}")
save_response "products_catalog" "$SBANK_PRODUCTS" "sbank"

# ============================================================================
# ШАГ 8: СОГЛАСИЯ ПО ПРОДУКТАМ
# ============================================================================

log ""
log "================================"
log "ШАГ 8: СОГЛАСИЯ ПО ПРОДУКТАМ"
log "================================"

log "Product Agreement Consents (ABank)..."
ABANK_PRODUCT_CONSENTS=$(curl -s -X POST "${ABANK_API_URL}/product-agreement-consents/request" \
    -H "Authorization: Bearer ${ABANK_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
    -d '{
        "client_id": "'${CLIENT_USER}'",
        "permissions": [
            "read_product_agreements",
            "open_product_agreements"
        ],
        "reason": "Агрегация счетов для HackAPI",
        "requesting_bank": "'${REQUESTING_BANK}'",
        "requesting_bank_name": "Team 260"
    }')
save_response "product_agreement_consents_request" "$ABANK_PRODUCT_CONSENTS" "abank"

log "Product Agreement Consents (VBank)..."
VBANK_PRODUCT_CONSENTS=$(curl -s -X POST "${VBANK_API_URL}/product-agreement-consents/request" \
    -H "Authorization: Bearer ${VBANK_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
    -d '{
        "client_id": "'${CLIENT_USER}'",
        "permissions": [
            "read_product_agreements",
            "open_product_agreements"
        ],
        "reason": "Агрегация счетов для HackAPI",
        "requesting_bank": "'${REQUESTING_BANK}'",
        "requesting_bank_name": "Team 260"
    }')
save_response "product_agreement_consents_request" "$VBANK_PRODUCT_CONSENTS" "vbank"

log "Product Agreement Consents (SBank)..."
SBANK_PRODUCT_CONSENTS=$(curl -s -X POST "${SBANK_API_URL}/product-agreement-consents/request" \
    -H "Authorization: Bearer ${SBANK_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
    -d '{
        "client_id": "'${CLIENT_USER}'",
        "permissions": [
            "read_product_agreements"
        ],
        "reason": "Агрегация счетов для HackAPI",
        "requesting_bank": "'${REQUESTING_BANK}'",
        "requesting_bank_name": "Team 260"
    }')
save_response "product_agreement_consents_request" "$SBANK_PRODUCT_CONSENTS" "sbank"

# ============================================================================
# ФИНАЛИЗАЦИЯ
# ============================================================================

log ""
log "================================"
log "✅ УСПЕШНО!"
log "================================"
log "Данные сохранены в: ${OUTPUT_DIR}"
log "Дата: $(date '+%Y-%m-%d %H:%M:%S')"
