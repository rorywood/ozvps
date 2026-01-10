#!/bin/bash
# Diagnostic script for billing issues

echo "=== OzVPS Billing Diagnostic ==="
echo ""

# Check Stripe configuration
echo "1. Checking Stripe Configuration..."
if [ -f "/opt/ozvps-panel/.env" ]; then
    if grep -q "STRIPE_PUBLISHABLE_KEY=" /opt/ozvps-panel/.env && grep -q "STRIPE_SECRET_KEY=" /opt/ozvps-panel/.env; then
        PUBLISHABLE=$(grep "STRIPE_PUBLISHABLE_KEY=" /opt/ozvps-panel/.env | cut -d'=' -f2)
        SECRET=$(grep "STRIPE_SECRET_KEY=" /opt/ozvps-panel/.env | cut -d'=' -f2)

        if [ -n "$PUBLISHABLE" ] && [ -n "$SECRET" ]; then
            echo "   ✓ Stripe keys are configured"
            echo "   Publishable key: ${PUBLISHABLE:0:20}..."
            echo "   Secret key: ${SECRET:0:20}..."
        else
            echo "   ✗ Stripe keys are EMPTY in .env file"
            echo "   This will cause the blank card form issue!"
        fi
    else
        echo "   ✗ Stripe keys NOT FOUND in .env file"
        echo "   This will cause the blank card form issue!"
    fi
else
    echo "   ✗ .env file not found"
fi
echo ""

# Check database for recent transactions
echo "2. Checking Recent Transactions..."
PGPASSWORD=$(grep "DATABASE_URL=" /opt/ozvps-panel/.env | cut -d':' -f3 | cut -d'@' -f1) \
DB_NAME=$(grep "DATABASE_URL=" /opt/ozvps-panel/.env | rev | cut -d'/' -f1 | rev) \
DB_USER=$(grep "DATABASE_URL=" /opt/ozvps-panel/.env | cut -d'/' -f3 | cut -d':' -f1) \
DB_HOST=$(grep "DATABASE_URL=" /opt/ozvps-panel/.env | cut -d'@' -f2 | cut -d':' -f1) \
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT id, type, amount_cents, created_at FROM wallet_transactions ORDER BY created_at DESC LIMIT 5;" 2>/dev/null || echo "   ✗ Could not query database"
echo ""

# Check PM2 logs for errors
echo "3. Checking Recent PM2 Logs for Errors..."
pm2 logs ozvps-panel --lines 20 --nostream 2>/dev/null | grep -i "error\|stripe\|credit\|transaction" | tail -10 || echo "   No PM2 running or no relevant logs"
echo ""

# Check if webhook endpoint is accessible
echo "4. Checking Webhook Endpoint..."
curl -s -o /dev/null -w "   HTTP Status: %{http_code}\n" http://localhost:3000/api/webhooks/stripe || echo "   ✗ Could not reach webhook endpoint"
echo ""

echo "=== Diagnostic Complete ==="
echo ""
echo "Common Issues:"
echo "1. Blank Card Form:"
echo "   - Missing STRIPE_PUBLISHABLE_KEY in .env"
echo "   - Browser extension blocking Stripe"
echo ""
echo "2. Missing Transactions:"
echo "   - Webhook not receiving events from Stripe"
echo "   - Stripe webhook URL not configured correctly"
echo "   - Check Stripe dashboard > Developers > Webhooks"
