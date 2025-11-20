#!/bin/bash
# Быстрый сброс базы данных без подтверждения

cd "$(dirname "$0")"

echo "🔄 Сброс базы данных..."
rm -f finpulse_consents.db
echo "yes" | python3 reset_database.py
echo "✅ Готово!"

