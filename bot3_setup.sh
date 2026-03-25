#!/bin/bash

# --- ИНТЕРАКТИВНЫЙ СКРИПТ НАСТРОЙКИ BOT3 ---
# Этот скрипт НЕ содержит ключей, поэтому его БЕЗОПАСНО хранить в Git.
# Вы просто вставляете ключи по просьбе скрипта.

echo "---------------------------------------------------"
echo "🤖 ИНТЕРАКТИВНАЯ НАСТРОЙКА BOT3 (Car & Transfer)..."
echo "---------------------------------------------------"

# 1. Запрос данных
echo "🔔 Пожалуйста, вставляйте значения и нажимайте Enter:"
read -p "1. BOT_TOKEN (от @BotFather): " BOT_TOKEN
read -p "2. SUPABASE_URL: " SUPABASE_URL
read -p "3. SUPABASE_SERVICE_ROLE_KEY: " SUPABASE_SERVICE_ROLE_KEY
read -p "4. SUPABASE_ANON_KEY (для WebApp): " SUPABASE_ANON_KEY
read -p "5. OPENROUTER_API_KEY (или OpenAI): " OPENROUTER_API_KEY
read -p "6. WEBAPP_URL (например, https://car.ticaretai.tr): " WEBAPP_URL

echo "---------------------------------------------------"
echo "📝 Запись .env файлов..."

mkdir -p bot webapp

# Создание bot/.env
cat <<EOF > bot/.env
BOT_TOKEN=$BOT_TOKEN
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY=$OPENROUTER_API_KEY
WEBAPP_URL=$WEBAPP_URL
PORT=3003
NODE_ENV=production
EOF

# Создание webapp/.env
cat <<EOF > webapp/.env
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
EOF

echo "✅ Файлы .env созданы."

# 2. Сборка фронтенда
echo "📦 Сборка WebApp (Vite)..."
cd webapp
npm install --include=dev --legacy-peer-deps
npm run build
cd ..

# 3. Установка зависимостей бота
echo "🤖 Установка зависимостей бота..."
cd bot
npm install
cd ..

# 4. Запуск в PM2
echo "⚙️ Запуск процесса в PM2..."
pm2 delete bot3 2>/dev/null
pm2 start bot/index.js --name "bot3" --env PORT=3003
pm2 save

echo "---------------------------------------------------"
echo "✅ ГОТОВО! Бот3 настроен и запущен на порту 3003."
echo "Проверьте статус командой: pm2 status"
echo "---------------------------------------------------"
