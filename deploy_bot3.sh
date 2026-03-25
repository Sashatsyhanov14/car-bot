#!/bin/bash

# --- ИНСТРУКЦИЯ ПО РАЗВЕРТЫВАНИЮ BOT3 ---
# 1. Перейдите в папку проекта на сервере
# 2. Выполните: chmod +x deploy_bot3.sh
# 3. Запустите: ./deploy_bot3.sh

echo "🚀 Начинаем деплой bot3..."

# Сборка фронтенда
echo "📦 Собираем WebApp..."
cd webapp
npm install
npm run build
cd ..

# Установка зависимостей бота
echo "🤖 Установка зависимостей бота..."
cd bot
npm install
cd ..

# Перезапуск PM2
echo "🔄 Перезапуск PM2 конфигурации..."
pm2 startOrReload ecosystem.config.js --update-env

echo "✅ Деплой завершен! Проверьте статус: pm2 status"
echo "🌐 Бот 3 запущен на порту 3003."
