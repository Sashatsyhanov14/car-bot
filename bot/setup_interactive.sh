#!/bin/bash
# bot/setup_interactive.sh

echo "--- Car Bot Environment Setup ---"
echo "Please enter the following values one by one:"

read -p "1. BOT_TOKEN: " BOT_TOKEN
read -p "2. OPENAI_API_KEY: " OPENAI_API_KEY
read -p "3. SUPABASE_URL: " SUPABASE_URL
read -p "4. SUPABASE_SERVICE_ROLE_KEY: " SUPABASE_SERVICE_ROLE_KEY
read -p "5. SUPABASE_ANON_KEY: " SUPABASE_ANON_KEY
read -p "6. WEBAPP_URL (e.g. https://tour.ticaretai.tr): " WEBAPP_URL
read -p "7. WEBHOOK_URL (same as above): " WEBHOOK_URL
read -p "8. PORT (press Enter for 3003): " PORT
PORT=${PORT:-3003}

cat <<EOF > bot/.env
BOT_TOKEN=$BOT_TOKEN
OPENAI_API_KEY=$OPENAI_API_KEY
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
WEBAPP_URL=$WEBAPP_URL
WEBHOOK_URL=$WEBHOOK_URL
PORT=$PORT
EOF

echo "---------------------------------"
echo "✅ .env file successfully created in 'bot' directory!"
echo "Now run: pm2 restart bot3"
