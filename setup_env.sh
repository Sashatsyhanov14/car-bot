#!/bin/bash

# --- СКРИПТ СОЗДАНИЯ ENV ФАЙЛОВ ДЛЯ BOT3 ---

echo "📝 Создаем .env файлы для bot3..."

# 1. Бот / Сервер
cat <<EOF > bot/.env
BOT_TOKEN=7531351891:AAHj6pbNzo28Q12rwMvZs-pn5XQjJR8pQ0o
SUPABASE_URL=https://rbrzilmagmzvtpafidsa.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJicnppbG1hZ216dnRwYWZpZHNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM5MDQxMCwiZXhwIjoyMDg5OTY2NDEwfQ.JKX7Ot1U7BcB7WRTGqFXEH-115feSgPWBtXKhu9h_b0
OPENROUTER_API_KEY=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
WEBAPP_URL=https://car.ticaretai.tr
PORT=3003
NODE_ENV=production
EOF

# 2. WebApp (фронтенд)
cat <<EOF > webapp/.env
VITE_SUPABASE_URL=https://rbrzilmagmzvtpafidsa.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJicnppbG1hZ216dnRwYWZpZHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTA0MTAsImV4cCI6MjA4OTk2NjQxMH0.A_ntv3HK7YGYQsNGdHUTTL5Ti9_DgUQMx9S5asaD3QA
EOF

echo "✅ Файлы .env успешно созданы!"
chmod 600 bot/.env webapp/.env
