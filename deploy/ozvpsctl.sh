#!/bin/bash
set -e

INSTALL_DIR="/opt/ozvps"
ENV_FILE="$INSTALL_DIR/.env"
COMPOSE_FILE="$INSTALL_DIR/docker-compose.yml"
BACKUP_DIR="$INSTALL_DIR/backups"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load environment
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

# Validate required env vars
if [ -z "$GITHUB_USER" ] || [ -z "$GHCR_TOKEN" ] || [ -z "$DOCKER_IMAGE" ]; then
    echo -e "${RED}Error: Missing required environment variables.${NC}"
    echo "Please ensure GITHUB_USER, GHCR_TOKEN, and DOCKER_IMAGE are set in $ENV_FILE"
    exit 1
fi

cd "$INSTALL_DIR"

case "$1" in
    update)
        echo -e "${BLUE}Updating OzVPS Panel...${NC}"
        
        # Save current image ID for rollback
        CURRENT_IMAGE=$(docker inspect --format='{{.Image}}' ozvps-panel 2>/dev/null || echo "none")
        echo "$CURRENT_IMAGE" > "$INSTALL_DIR/.previous_image"
        
        # Login to GitHub Container Registry
        echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin
        
        # Stop and remove old containers
        echo -e "${YELLOW}Stopping old containers...${NC}"
        docker compose down --remove-orphans
        
        # Pull latest image
        echo -e "${YELLOW}Pulling latest image...${NC}"
        docker compose pull
        
        # Start with new image
        echo -e "${YELLOW}Starting new containers...${NC}"
        docker compose up -d
        
        # Aggressive cleanup - free disk space
        echo -e "${YELLOW}Cleaning up old Docker images and files...${NC}"
        
        # Remove ALL unused Docker images (not just 24h old)
        docker image prune -af 2>/dev/null || true
        
        # Remove unused containers, networks, images, and build cache
        docker system prune -af --volumes 2>/dev/null || true
        
        # Clean Docker build cache
        docker builder prune -af 2>/dev/null || true
        
        # Keep only last 5 database backups (reduced from 7)
        ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +6 | xargs -r rm
        
        # Clean old log files
        find /var/log -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
        find /var/log -name "*.gz" -type f -mtime +7 -delete 2>/dev/null || true
        
        # Clean journald logs
        journalctl --vacuum-time=3d 2>/dev/null || true
        
        # Clean apt/yum cache
        apt-get clean 2>/dev/null || true
        apt-get autoremove -y 2>/dev/null || true
        yum clean all 2>/dev/null || true
        
        echo -e "${GREEN}Update complete!${NC}"
        echo "Run './ozvpsctl.sh status' to check the application status."
        ;;
        
    rollback)
        echo -e "${YELLOW}Rolling back to previous version...${NC}"
        
        if [ ! -f "$INSTALL_DIR/.previous_image" ]; then
            echo -e "${RED}No previous version found to rollback to.${NC}"
            exit 1
        fi
        
        PREVIOUS_IMAGE=$(cat "$INSTALL_DIR/.previous_image")
        
        if [ "$PREVIOUS_IMAGE" = "none" ] || [ -z "$PREVIOUS_IMAGE" ]; then
            echo -e "${RED}No previous version found to rollback to.${NC}"
            exit 1
        fi
        
        # Stop current container
        docker compose down
        
        # Tag previous image as current and restart
        echo -e "${BLUE}Restoring previous version...${NC}"
        docker tag "$PREVIOUS_IMAGE" "$DOCKER_IMAGE"
        docker compose up -d
        
        echo -e "${GREEN}Rollback complete!${NC}"
        ;;
        
    logs)
        if [ "$2" = "-f" ] || [ "$2" = "--follow" ]; then
            docker compose logs -f
        else
            docker compose logs --tail=100
        fi
        ;;
        
    status)
        echo -e "${BLUE}OzVPS Panel Status${NC}"
        echo "================================"
        echo "Image: $DOCKER_IMAGE"
        echo ""
        docker compose ps
        echo ""
        echo -e "${BLUE}Container Health:${NC}"
        docker inspect --format='{{.Name}}: {{.State.Health.Status}}' ozvps-panel ozvps-postgres 2>/dev/null || echo "Containers not running"
        ;;
        
    backup-db)
        mkdir -p "$BACKUP_DIR"
        BACKUP_FILE="$BACKUP_DIR/ozvps_$(date +%Y%m%d_%H%M%S).sql"
        
        echo -e "${BLUE}Backing up database...${NC}"
        docker exec ozvps-postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_FILE"
        gzip "$BACKUP_FILE"
        
        echo -e "${GREEN}Backup saved to: ${BACKUP_FILE}.gz${NC}"
        
        # Keep only last 7 backups
        ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm
        ;;
        
    restore-db)
        if [ -z "$2" ]; then
            echo "Usage: ./ozvpsctl.sh restore-db <backup_file.sql.gz>"
            echo ""
            echo "Available backups:"
            ls -la "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No backups found"
            exit 1
        fi
        
        BACKUP_FILE="$2"
        if [ ! -f "$BACKUP_FILE" ]; then
            echo -e "${RED}Backup file not found: $BACKUP_FILE${NC}"
            exit 1
        fi
        
        echo -e "${YELLOW}Warning: This will overwrite the current database!${NC}"
        read -p "Are you sure? (yes/no): " confirm
        
        if [ "$confirm" = "yes" ]; then
            echo -e "${BLUE}Restoring database...${NC}"
            gunzip -c "$BACKUP_FILE" | docker exec -i ozvps-postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
            echo -e "${GREEN}Database restored successfully!${NC}"
        else
            echo "Restore cancelled."
        fi
        ;;
        
    restart)
        echo -e "${BLUE}Restarting OzVPS Panel...${NC}"
        docker compose restart
        echo -e "${GREEN}Restart complete!${NC}"
        ;;
        
    stop)
        echo -e "${YELLOW}Stopping OzVPS Panel...${NC}"
        docker compose down
        echo -e "${GREEN}Stopped.${NC}"
        ;;
        
    start)
        echo -e "${BLUE}Starting OzVPS Panel...${NC}"
        
        # Login to GitHub Container Registry
        echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin
        
        docker compose up -d
        echo -e "${GREEN}Started!${NC}"
        ;;
        
    cleanup)
        echo -e "${BLUE}Cleaning up disk space...${NC}"
        
        # Show disk usage before
        echo ""
        echo -e "${YELLOW}Current disk usage:${NC}"
        df -h / | tail -1
        echo ""
        
        # Remove ALL unused Docker images
        echo "Removing unused Docker images..."
        docker image prune -af 2>/dev/null || true
        
        # Remove unused containers, networks, and build cache
        echo "Removing unused Docker resources..."
        docker system prune -af 2>/dev/null || true
        
        # Clean Docker build cache
        echo "Cleaning Docker build cache..."
        docker builder prune -af 2>/dev/null || true
        
        # Clean dangling volumes (be careful - only removes unused)
        echo "Removing unused volumes..."
        docker volume prune -f 2>/dev/null || true
        
        # Keep only last 3 database backups
        echo "Removing old database backups..."
        ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +4 | xargs -r rm
        
        # Clean old log files (older than 3 days)
        echo "Cleaning old log files..."
        find /var/log -name "*.log" -type f -mtime +3 -delete 2>/dev/null || true
        find /var/log -name "*.gz" -type f -mtime +3 -delete 2>/dev/null || true
        
        # Clean journald logs
        journalctl --vacuum-time=2d 2>/dev/null || true
        
        # Clean package manager cache
        apt-get clean 2>/dev/null || true
        apt-get autoremove -y 2>/dev/null || true
        yum clean all 2>/dev/null || true
        
        # Clean temp files
        find /tmp -type f -mtime +1 -delete 2>/dev/null || true
        find /var/tmp -type f -mtime +7 -delete 2>/dev/null || true
        
        echo ""
        echo -e "${YELLOW}Disk usage after cleanup:${NC}"
        df -h / | tail -1
        echo ""
        echo -e "${GREEN}Cleanup complete!${NC}"
        ;;
        
    *)
        echo "OzVPS Panel Control Script"
        echo ""
        echo "Usage: ./ozvpsctl.sh <command>"
        echo ""
        echo "Commands:"
        echo "  update      Pull latest version and restart"
        echo "  rollback    Revert to previous version"
        echo "  logs        View application logs (add -f to follow)"
        echo "  status      Check container status"
        echo "  backup-db   Create database backup"
        echo "  restore-db  Restore database from backup"
        echo "  restart     Restart all services"
        echo "  start       Start all services"
        echo "  stop        Stop all services"
        echo "  cleanup     Free up disk space (removes old images, logs, caches)"
        ;;
esac
