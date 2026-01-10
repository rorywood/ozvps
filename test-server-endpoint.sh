#!/bin/bash
# Test what the servers API actually returns

if [ -f ".env" ]; then
  source .env
fi

echo "Testing /api/servers endpoint..."
echo ""

# Get the first server to see what data we're getting
curl -s http://localhost:3000/api/servers \
  -H "Cookie: connect.sid=YOUR_SESSION" \
  | python3 -m json.tool | head -100

echo ""
echo "Check if servers have billing data..."
