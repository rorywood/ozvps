#!/bin/bash
# OzVPS Database Backup Script
# Keeps last 5 backups, replacing oldest when limit reached

set -e

# Configuration
BACKUP_DIR="/var/backups/ozvps"
MAX_BACKUPS=5
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="ozvps_${DATE}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    # Try to load from .env file
    if [ -f /opt/ozvps/.env ]; then
        export $(grep -v '^#' /opt/ozvps/.env | xargs)
    fi
fi

if [ -z "$DATABASE_URL" ]; then
    echo "[$(date)] ERROR: DATABASE_URL not set"
    exit 1
fi

# Create backup
echo "[$(date)] Starting backup..."
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "[$(date)] Backup created: $BACKUP_FILE ($(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1))"
else
    echo "[$(date)] ERROR: Backup failed"
    exit 1
fi

# Remove old backups, keep only last MAX_BACKUPS
cd "$BACKUP_DIR"
BACKUP_COUNT=$(ls -1 ozvps_*.sql.gz 2>/dev/null | wc -l)

if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    REMOVE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
    echo "[$(date)] Removing $REMOVE_COUNT old backup(s)..."
    ls -1t ozvps_*.sql.gz | tail -n "$REMOVE_COUNT" | xargs rm -f
fi

echo "[$(date)] Backup complete. Current backups:"
ls -lh "$BACKUP_DIR"/ozvps_*.sql.gz 2>/dev/null || echo "  (none)"
