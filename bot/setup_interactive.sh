#!/bin/bash
# bot/setup_interactive.sh

echo "--- Car Bot Environment Setup ---"
echo "Please enter the following values one by one:"

echo "1. BOT_TOKEN:"
read BOT_TOKEN
echo "2. OPENAI_API_KEY:"
read OPENAI_API_KEY
echo "3. SUPABASE_URL:"
read SUPABASE_URL
echo "4. SUPABASE_SERVICE_ROLE_KEY:"
read SUPABASE_SERVICE_ROLE_KEY
echo "5. SUPABASE_ANON_KEY:"
read SUPABASE_ANON_KEY
echo "6. WEBAPP_URL (например https://tour.ticaretai.tr):"
read WEBAPP_URL
echo "7. WEBHOOK_URL (то же самое):"
read WEBHOOK_URL
echo "8. PORT (нажми Enter для 3003):"
read PORT
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
