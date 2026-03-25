#!/bin/bash

# --- ИНТЕРАКТИВНЫЙ СКРИПТ НАСТРОЙКИ BOT4 ---
# Эта версия для порта 3004. Выполняет установку ключей и полный деплой.

echo "---------------------------------------------------"
echo "🤖 ИНТЕРАКТИВНАЯ НАСТРОЙКА BOT4"
echo "---------------------------------------------------"
echo "Ожидание инициализации терминала..."
sleep 1
read -t 1 -n 10000 discard # Очистка буфера

echo "Шаг 1: Введите BOT_TOKEN (от @BotFather)"
read -r BOT_TOKEN
echo "✅ Принято."
echo ""

echo "Шаг 2: Введите SUPABASE_URL"
read -r SUPABASE_URL
echo "✅ Принято."
echo ""

echo "Шаг 3: Введите SUPABASE_SERVICE_ROLE_KEY"
read -r SUPABASE_SERVICE_ROLE_KEY
echo "✅ Принято."
echo ""

echo "Шаг 4: Введите SUPABASE_ANON_KEY (для WebApp)"
read -r SUPABASE_ANON_KEY
echo "✅ Принято."
echo ""

echo "Шаг 5: Введите OPENROUTER_API_KEY"
read -r OPENROUTER_API_KEY
echo "✅ Принято."
echo ""

echo "Шаг 6: Введите WEBAPP_URL (например, https://medical.ticaretai.tr)"
read -r WEBAPP_URL
echo "✅ Принято."
echo ""

echo "---------------------------------------------------"
echo "📝 Записываю файлы .env для BOT4..."

mkdir -p bot webapp

# Создание bot/.env
cat <<EOF > bot/.env
BOT_TOKEN=$BOT_TOKEN
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY=$OPENROUTER_API_KEY
WEBAPP_URL=$WEBAPP_URL
PORT=3004
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
echo "⚙️ Запуск в PM2 под именем 'bot4'..."
pm2 delete bot4 2>/dev/null
pm2 start bot/index.js --name "bot4" --env PORT=3004
pm2 save

echo "---------------------------------------------------"
echo "✅ ГОТОВО! Бот4 настроен и запущен на порту 3004."
echo "Проверьте статус: pm2 status"
echo "---------------------------------------------------"
