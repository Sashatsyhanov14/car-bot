#!/bin/bash
# migrate_env.sh
# Extracts Supabase credentials from bot/.env and applies them to webapp/.env

# Go to script directory
cd "$(dirname "$0")"

# Read keys (using grep and cut, xargs to trim whitespace)
URL=$(grep SUPABASE_URL bot/.env | cut -d '=' -f2 | xargs)
KEY=$(grep SUPABASE_ANON_KEY bot/.env | cut -d '=' -f2 | xargs)

if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "Error: Could not find SUPABASE_URL or SUPABASE_ANON_KEY in bot/.env"
  echo "Please make sure your bot/.env contains these variables."
  exit 1
fi

# Create webapp/.env
echo "VITE_SUPABASE_URL=$URL" > webapp/.env
echo "VITE_SUPABASE_ANON_KEY=$KEY" >> webapp/.env

echo "Keys migrated to webapp/.env!"
echo "Building webapp..."

# Run build
cd webapp && npm run build

echo "-----------------------------------"
echo "Build complete! Restart your bot: pm2 restart bot3"
