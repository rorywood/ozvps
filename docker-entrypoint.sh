#!/bin/sh
set -e

echo "Running database migrations..."
npx drizzle-kit push --config=drizzle.config.cjs

echo "Starting OzVPS Panel..."
exec node dist/index.cjs
