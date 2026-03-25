#!/bin/bash

# --- ПОЛНЫЙ СКРИПТ УСТАНОВКИ И ДЕПЛОЯ BOT3 ---
# Инструкция:
# 1. Загрузите этот файл на сервер
# 2. chmod +x deploy_bot3.sh
# 3. ./deploy_bot3.sh

echo "---------------------------------------------------"
echo "🚀 Начинаем установку BOT3 (Car & Transfer)..."
echo "---------------------------------------------------"

# 1. Создание .env для сервера
echo "📝 Прописываем ключи в bot/.env..."
mkdir -p bot
cat <<EOF > bot/.env
BOT_TOKEN=7531351891:AAHj6pbNzo28Q12rwMvZs-pn5XQjJR8pQ0o
SUPABASE_URL=https://rbrzilmagmzvtpafidsa.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJicnppbG1hZ216dnRwYWZpZHNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM5MDQxMCwiZXhwIjoyMDg5OTY2NDEwfQ.JKX7Ot1U7BcB7WRTGqFXEH-115feSgPWBtXKhu9h_b0
OPENROUTER_API_KEY=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
WEBAPP_URL=https://car.ticaretai.tr
PORT=3003
NODE_ENV=production
EOF

# 2. Создание .env для WebApp
echo "📝 Прописываем ключи в webapp/.env..."
mkdir -p webapp
cat <<EOF > webapp/.env
VITE_SUPABASE_URL=https://rbrzilmagmzvtpafidsa.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJicnppbG1hZ216dnRwYWZpZHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTA0MTAsImV4cCI6MjA4OTk2NjQxMH0.A_ntv3HK7YGYQsNGdHUTTL5Ti9_DgUQMx9S5asaD3QA
EOF

echo "✅ Файлы .env созданы."

# 3. Сборка фронтенда
echo "📦 Сборка WebApp (Vite)..."
cd webapp
npm install --include=dev --legacy-peer-deps
npm run build
cd ..

# 4. Установка бота
echo "🤖 Установка зависимостей бота..."
cd bot
npm install
cd ..

# 5. Запуск в PM2
echo "⚙️ Запуск процесса в PM2..."
# Удаляем старый процесс если был
pm2 delete bot3 2>/dev/null 
# Запускаем новый
pm2 start bot/index.js --name "bot3" --env PORT=3003
pm2 save

echo "---------------------------------------------------"
echo "✅ ГОТОВО! Бот3 настроен и запущен на порту 3003."
echo "Проверьте статус командой: pm2 status"
echo "---------------------------------------------------"
