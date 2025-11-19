#!/bin/bash

# ============================================================================
# СКРИПТ СБОРА ДАННЫХ ПОЛЬЗОВАТЕЛЯ team260-3 ИЗ ТРЁХ БАНКОВ
# ============================================================================
# Данный скрипт выполняет последовательно curl запросы к API трёх банков
# (ABank, VBank, SBank) в песочнице OpenBanking Russia для сбора полной
# информации об одном клиенте в единый датасет

# ПЕРЕМЕННЫЕ КОНФИГУРАЦИИ
# ============================================================================
CLIENT_ID="team260"
CLIENT_SECRET="wPnKt4ljvSh63JpV0Pmmqp2OeNFHWcYN"
CLIENT_USER="team260-3"
REQUESTING_BANK="team260"

ABANK_API_URL="https://abank.open.bankingapi.ru"
VBANK_API_URL="https://vbank.open.bankingapi.ru"
SBANK_API_URL="https://sbank.open.bankingapi.ru"

OUTPUT_DIR="./data_team260-3"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Создаём директорию для результатов
mkdir -p "${OUTPUT_DIR}"

# ФУНКЦИИ ВСПОМОГАТЕЛЬНЫЕ
# ============================================================================

# Функция для логирования
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Функция для красивого вывода результата
save_response() {
    local endpoint=$1
    local response=$2
    local bank_name=$3
    local filename="${OUTPUT_DIR}/${bank_name}_${endpoint//\//_}_${TIMESTAMP}.json"
    echo "$response" | jq '.' > "$filename" 2>/dev/null || echo "$response" > "$filename"
    log "✓ Сохранено: $filename"
}

# Функция для выполнения запроса
make_request() {
    local method=$1
    local url=$2
    local data=$3
    local headers=$4
    
    if [ "$method" == "GET" ]; then
        curl -s -X GET "$url" \
            -H "Authorization: Bearer ${ACCESS_TOKEN}" \
            $headers
    elif [ "$method" == "POST" ]; then
        curl -s -X POST "$url" \
            -H "Authorization: Bearer ${ACCESS_TOKEN}" \
            -H "Content-Type: application/json" \
            $headers \
            -d "$data"
    fi
}

# ============================================================================
# ШАГ 1: АУТЕНТИФИКАЦИЯ И ПОЛУЧЕНИЕ ACCESS_TOKEN ДЛЯ КАЖДОГО БАНКА
# ============================================================================

log "================================"
log "ШАГ 1: ПОЛУЧЕНИЕ ACCESS TOKENS"
log "================================"

# ABANK Token
log "Получаю токен для ABank..."
ABANK_TOKEN_RESPONSE=$(curl -s -X POST "${ABANK_API_URL}/auth/bank-token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}")

ABANK_TOKEN=$(echo "$ABANK_TOKEN_RESPONSE" | jq -r '.access_token')
log "✓ ABank токен получен"
save_response "auth_bank_token" "$ABANK_TOKEN_RESPONSE" "abank"

# VBANK Token
log "Получаю токен для VBank..."
VBANK_TOKEN_RESPONSE=$(curl -s -X POST "${VBANK_API_URL}/auth/bank-token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}")

VBANK_TOKEN=$(echo "$VBANK_TOKEN_RESPONSE" | jq -r '.access_token')
log "✓ VBank токен получен"
save_response "auth_bank_token" "$VBANK_TOKEN_RESPONSE" "vbank"

# SBANK Token
log "Получаю токен для SBank..."
SBANK_TOKEN_RESPONSE=$(curl -s -X POST "${SBANK_API_URL}/auth/bank-token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}")

SBANK_TOKEN=$(echo "$SBANK_TOKEN_RESPONSE" | jq -r '.access_token')
log "✓ SBank токен получен"
save_response "auth_bank_token" "$SBANK_TOKEN_RESPONSE" "sbank"

# ============================================================================
# ШАГ 2: СОЗДАНИЕ СОГЛАСИЙ (CONSENTS) НА ДОСТУП К СЧЕТАМ И ПРОДУКТАМ
# ============================================================================

log ""
log "================================"
log "ШАГ 2: СОЗДАНИЕ СОГЛАСИЙ (CONSENTS)"
log "================================"

# Account Consents для ABANK
log "Создаю Account Consent для ABank..."
ACCESS_TOKEN="$ABANK_TOKEN"
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
        "reason": "Мультибанковское приложение - агрегация финдеты",
        "requesting_bank": "'${REQUESTING_BANK}'",
        "requesting_bank_name": "Team 260"
    }')

ABANK_CONSENT_ID=$(echo "$ABANK_ACCOUNT_CONSENT" | jq -r '.data.consentId // .consentId')
log "✓ ABank Account Consent создан: $ABANK_CONSENT_ID"
save_response "account_consents_request" "$ABANK_ACCOUNT_CONSENT" "abank"

# Account Consents для VBANK
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
        "reason": "Мультибанковское приложение - агрегация финдеты",
        "requesting_bank": "'${REQUESTING_BANK}'",
        "requesting_bank_name": "Team 260"
    }')

VBANK_CONSENT_ID=$(echo "$VBANK_ACCOUNT_CONSENT" | jq -r '.data.consentId // .consentId')
log "✓ VBank Account Consent создан: $VBANK_CONSENT_ID"
save_response "account_consents_request" "$VBANK_ACCOUNT_CONSENT" "vbank"

# Account Consents для SBANK
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
        "reason": "Мультибанковское приложение - агрегация финдеты",
        "requesting_bank": "'${REQUESTING_BANK}'",
        "requesting_bank_name": "Team 260"
    }')

SBANK_CONSENT_ID=$(echo "$SBANK_ACCOUNT_CONSENT" | jq -r '.data.consentId // .consentId')
log "✓ SBank Account Consent создан: $SBANK_CONSENT_ID"
save_response "account_consents_request" "$SBANK_ACCOUNT_CONSENT" "sbank"

# ============================================================================
# ШАГ 3: СБОР ДАННЫХ ПО СЧЕТАМ
# ============================================================================

log ""
log "================================"
log "ШАГ 3: СБОР ДАННЫХ ПО СЧЕТАМ"
log "================================"

# Получение списка счетов ABANK
log "Получаю счета ABank..."
ABANK_ACCOUNTS=$(curl -s -X GET "${ABANK_API_URL}/accounts?client_id=${CLIENT_USER}" \
    -H "Authorization: Bearer ${ABANK_TOKEN}" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
    -H "X-Consent-Id: ${ABANK_CONSENT_ID}")

save_response "accounts" "$ABANK_ACCOUNTS" "abank"

# Получение списка счетов VBANK
log "Получаю счета VBank..."
VBANK_ACCOUNTS=$(curl -s -X GET "${VBANK_API_URL}/accounts?client_id=${CLIENT_USER}" \
    -H "Authorization: Bearer ${VBANK_TOKEN}" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
    -H "X-Consent-Id: ${VBANK_CONSENT_ID}")

save_response "accounts" "$VBANK_ACCOUNTS" "vbank"

# Получение списка счетов SBANK
log "Получаю счета SBank..."
SBANK_ACCOUNTS=$(curl -s -X GET "${SBANK_API_URL}/accounts?client_id=${CLIENT_USER}" \
    -H "Authorization: Bearer ${SBANK_TOKEN}" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
    -H "X-Consent-Id: ${SBANK_CONSENT_ID}")

save_response "accounts" "$SBANK_ACCOUNTS" "sbank"

# Парсим account_id'ы для дальнейших операций
ABANK_ACCOUNT_IDS=$(echo "$ABANK_ACCOUNTS" | jq -r '.data[]?.account_id // .accounts[]?.id' 2>/dev/null)
VBANK_ACCOUNT_IDS=$(echo "$VBANK_ACCOUNTS" | jq -r '.data[]?.account_id // .accounts[]?.id' 2>/dev/null)
SBANK_ACCOUNT_IDS=$(echo "$SBANK_ACCOUNTS" | jq -r '.data[]?.account_id // .accounts[]?.id' 2>/dev/null)

# ============================================================================
# ШАГ 4: СБОР БАЛАНСОВ ПО КАЖДОМУ СЧЕТУ
# ============================================================================

log ""
log "================================"
log "ШАГ 4: СБОР БАЛАНСОВ"
log "================================"

# Balances ABANK
for ACCOUNT_ID in $ABANK_ACCOUNT_IDS; do
    [ -z "$ACCOUNT_ID" ] && continue
    log "Получаю баланс счета $ACCOUNT_ID (ABank)..."
    ABANK_BALANCE=$(curl -s -X GET "${ABANK_API_URL}/accounts/${ACCOUNT_ID}/balances" \
        -H "Authorization: Bearer ${ABANK_TOKEN}" \
        -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
        -H "X-Consent-Id: ${ABANK_CONSENT_ID}")
    
    save_response "balances_${ACCOUNT_ID}" "$ABANK_BALANCE" "abank"
done

# Balances VBANK
for ACCOUNT_ID in $VBANK_ACCOUNT_IDS; do
    [ -z "$ACCOUNT_ID" ] && continue
    log "Получаю баланс счета $ACCOUNT_ID (VBank)..."
    VBANK_BALANCE=$(curl -s -X GET "${VBANK_API_URL}/accounts/${ACCOUNT_ID}/balances" \
        -H "Authorization: Bearer ${VBANK_TOKEN}" \
        -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
        -H "X-Consent-Id: ${VBANK_CONSENT_ID}")
    
    save_response "balances_${ACCOUNT_ID}" "$VBANK_BALANCE" "vbank"
done

# Balances SBANK
for ACCOUNT_ID in $SBANK_ACCOUNT_IDS; do
    [ -z "$ACCOUNT_ID" ] && continue
    log "Получаю баланс счета $ACCOUNT_ID (SBank)..."
    SBANK_BALANCE=$(curl -s -X GET "${SBANK_API_URL}/accounts/${ACCOUNT_ID}/balances" \
        -H "Authorization: Bearer ${SBANK_TOKEN}" \
        -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
        -H "X-Consent-Id: ${SBANK_CONSENT_ID}")
    
    save_response "balances_${ACCOUNT_ID}" "$SBANK_BALANCE" "sbank"
done

# ============================================================================
# ШАГ 5: СБОР ИСТОРИИ ТРАНЗАКЦИЙ
# ============================================================================

log ""
log "================================"
log "ШАГ 5: СБОР ИСТОРИИ ТРАНЗАКЦИЙ"
log "================================"

# Transactions ABANK (с пагинацией)
for ACCOUNT_ID in $ABANK_ACCOUNT_IDS; do
    [ -z "$ACCOUNT_ID" ] && continue
    log "Получаю транзакции счета $ACCOUNT_ID (ABank)..."
    ABANK_TRANSACTIONS=$(curl -s -X GET "${ABANK_API_URL}/accounts/${ACCOUNT_ID}/transactions?page=1&limit=100" \
        -H "Authorization: Bearer ${ABANK_TOKEN}" \
        -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
        -H "X-Consent-Id: ${ABANK_CONSENT_ID}")
    
    save_response "transactions_${ACCOUNT_ID}" "$ABANK_TRANSACTIONS" "abank"
done

# Transactions VBANK
for ACCOUNT_ID in $VBANK_ACCOUNT_IDS; do
    [ -z "$ACCOUNT_ID" ] && continue
    log "Получаю транзакции счета $ACCOUNT_ID (VBank)..."
    VBANK_TRANSACTIONS=$(curl -s -X GET "${VBANK_API_URL}/accounts/${ACCOUNT_ID}/transactions?page=1&limit=100" \
        -H "Authorization: Bearer ${VBANK_TOKEN}" \
        -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
        -H "X-Consent-Id: ${VBANK_CONSENT_ID}")
    
    save_response "transactions_${ACCOUNT_ID}" "$VBANK_TRANSACTIONS" "vbank"
done

# Transactions SBANK
for ACCOUNT_ID in $SBANK_ACCOUNT_IDS; do
    [ -z "$ACCOUNT_ID" ] && continue
    log "Получаю транзакции счета $ACCOUNT_ID (SBank)..."
    SBANK_TRANSACTIONS=$(curl -s -X GET "${SBANK_API_URL}/accounts/${ACCOUNT_ID}/transactions?page=1&limit=100" \
        -H "Authorization: Bearer ${SBANK_TOKEN}" \
        -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
        -H "X-Consent-Id: ${SBANK_CONSENT_ID}")
    
    save_response "transactions_${ACCOUNT_ID}" "$SBANK_TRANSACTIONS" "sbank"
done

# ============================================================================
# ШАГ 6: СБОР ДАННЫХ ПО ПРОДУКТАМ И ДОГОВОРАМ
# ============================================================================

log ""
log "================================"
log "ШАГ 6: СБОР ДАННЫХ ПО ПРОДУКТАМ"
log "================================"

# Product Agreements ABANK
log "Получаю договоры по продуктам (ABank)..."
ABANK_PRODUCT_AGREEMENTS=$(curl -s -X GET "${ABANK_API_URL}/product-agreements?client_id=${CLIENT_USER}" \
    -H "Authorization: Bearer ${ABANK_TOKEN}" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}")

save_response "product_agreements" "$ABANK_PRODUCT_AGREEMENTS" "abank"

# Product Agreements VBANK
log "Получаю договоры по продуктам (VBank)..."
VBANK_PRODUCT_AGREEMENTS=$(curl -s -X GET "${VBANK_API_URL}/product-agreements?client_id=${CLIENT_USER}" \
    -H "Authorization: Bearer ${VBANK_TOKEN}" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}")

save_response "product_agreements" "$VBANK_PRODUCT_AGREEMENTS" "vbank"

# Product Agreements SBANK
log "Получаю договоры по продуктам (SBank)..."
SBANK_PRODUCT_AGREEMENTS=$(curl -s -X GET "${SBANK_API_URL}/product-agreements?client_id=${CLIENT_USER}" \
    -H "Authorization: Bearer ${SBANK_TOKEN}" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}")

save_response "product_agreements" "$SBANK_PRODUCT_AGREEMENTS" "sbank"

# ============================================================================
# ШАГ 7: СБОР КАТАЛОГА ПРОДУКТОВ
# ============================================================================

log ""
log "================================"
log "ШАГ 7: СБОР КАТАЛОГА ПРОДУКТОВ"
log "================================"

# Products ABANK
log "Получаю каталог продуктов (ABank)..."
ABANK_PRODUCTS=$(curl -s -X GET "${ABANK_API_URL}/products" \
    -H "Authorization: Bearer ${ABANK_TOKEN}")

save_response "products_catalog" "$ABANK_PRODUCTS" "abank"

# Products VBANK
log "Получаю каталог продуктов (VBank)..."
VBANK_PRODUCTS=$(curl -s -X GET "${VBANK_API_URL}/products" \
    -H "Authorization: Bearer ${VBANK_TOKEN}")

save_response "products_catalog" "$VBANK_PRODUCTS" "vbank"

# Products SBANK
log "Получаю каталог продуктов (SBank)..."
SBANK_PRODUCTS=$(curl -s -X GET "${SBANK_API_URL}/products" \
    -H "Authorization: Bearer ${SBANK_TOKEN}")

save_response "products_catalog" "$SBANK_PRODUCTS" "sbank"

# ============================================================================
# ШАГ 8: СБОР СОГЛАСИЙ (CONSENTS) ПО ПРОДУКТАМ
# ============================================================================

log ""
log "================================"
log "ШАГ 8: СБОР СОГЛАСИЙ ПО ПРОДУКТАМ"
log "================================"

# Product Agreement Consents ABANK
log "Получаю согласия по продуктам (ABank)..."
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
        "reason": "Мультибанковское приложение",
        "requesting_bank": "'${REQUESTING_BANK}'",
        "requesting_bank_name": "Team 260"
    }')

save_response "product_agreement_consents_request" "$ABANK_PRODUCT_CONSENTS" "abank"

# Product Agreement Consents VBANK
log "Получаю согласия по продуктам (VBank)..."
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
        "reason": "Мультибанковское приложение",
        "requesting_bank": "'${REQUESTING_BANK}'",
        "requesting_bank_name": "Team 260"
    }')

save_response "product_agreement_consents_request" "$VBANK_PRODUCT_CONSENTS" "vbank"

# Product Agreement Consents SBANK
log "Получаю согласия по продуктам (SBank)..."
SBANK_PRODUCT_CONSENTS=$(curl -s -X POST "${SBANK_API_URL}/product-agreement-consents/request" \
    -H "Authorization: Bearer ${SBANK_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "X-Requesting-Bank: ${REQUESTING_BANK}" \
    -d '{
        "client_id": "'${CLIENT_USER}'",
        "permissions": [
            "read_product_agreements",
            "open_product_agreements"
        ],
        "reason": "Мультибанковское приложение",
        "requesting_bank": "'${REQUESTING_BANK}'",
        "requesting_bank_name": "Team 260"
    }')

save_response "product_agreement_consents_request" "$SBANK_PRODUCT_CONSENTS" "sbank"

# ============================================================================
# ФИНАЛИЗАЦИЯ
# ============================================================================

log ""
log "================================"
log "✓ СБОР ДАННЫХ ЗАВЕРШЁН"
log "================================"
log "Все данные сохранены в директорию: ${OUTPUT_DIR}"
log "Время выполнения: $(date '+%Y-%m-%d %H:%M:%S')"
log ""
log "Структура собранных данных:"
log "  • Токены аутентификации для каждого банка"
log "  • Согласия (consents) на доступ к счетам и продуктам"
log "  • Список счетов клиента в каждом банке"
log "  • Балансы по всем счетам"
log "  • История транзакций (первые 100 на счету)"
log "  • Договоры по продуктам (кредиты, вклады, карты)"
log "  • Каталоги продуктов всех банков"
log ""
