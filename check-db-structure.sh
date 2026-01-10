#!/bin/bash
# Check what's actually in the database

if [ -f ".env" ]; then
  source .env
fi

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set"
  exit 1
fi

echo "Checking database structure..."
echo ""

# Check if server_billing table exists and show its structure
psql "$DATABASE_URL" << 'EOSQL'
-- Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'server_billing'
) as table_exists;

-- Show table structure if it exists
\d server_billing

-- Show all indexes on the table
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'server_billing';
EOSQL
