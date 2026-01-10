#!/bin/bash
# Quick debug - check if billing records exist

if [ -f ".env" ]; then
  source .env
fi

echo "Checking billing records in database..."
psql "$DATABASE_URL" << 'EOSQL'
-- Check server_billing table
SELECT COUNT(*) as total_records FROM server_billing;

-- Show all records
SELECT 
  virtfusion_server_id, 
  status, 
  next_bill_at, 
  monthly_price_cents,
  created_at
FROM server_billing 
ORDER BY created_at DESC;
EOSQL
