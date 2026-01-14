# OzVPS Update System v3.0

Modern, streamlined update system with self-update capability and commit tracking.

## Features

### ✨ Modern UI
- Beautiful ASCII art banner with OzVPS branding
- Color-coded output (success ✓, warnings ⚠, errors ✗, info →)
- Progress bars for health checks
- Animated spinners for long-running tasks
- Step-by-step progress tracking (Step X/6)
- Clean status messages with timestamps

### 🔄 Self-Update Capability
The update script can update itself! Before updating your application:
- Checks GitHub for newer version of the update script
- Compares script versions (SCRIPT_VERSION variable)
- Prompts you to update the script first if newer version available
- Automatically restarts with new version after self-update
- Backs up old script before updating

### 🎯 Commit Tracking
Smart update detection to avoid unnecessary updates:
- Checks current commit hash from `.commit` file in installation directory
- Fetches latest commit hash from GitHub API
- Compares hashes to determine if update is needed
- Shows current and latest commit hashes (short format)
- Exits if already up-to-date (with option to force update)
- Saves new commit hash after successful update

### 🛡️ Safety Features
- Automatic backup before update (keeps last 5 backups)
- Pre-flight checks (disk space, PostgreSQL, Node.js, PM2)
- Configuration preservation (`.env`, `ecosystem.config.cjs`)
- Build verification (checks for `dist/index.cjs`)
- Automatic rollback if build fails
- Health check after restart (30-second timeout with progress bar)

### 📦 Clean Process
- Removes old files while preserving important data
- Installs dependencies silently
- Prunes dev dependencies after build
- Runs database migrations
- Cleans old backups automatically

## Usage

### Development Updates
```bash
# Standard update (checks for commits first)
sudo update-ozvps-dev

# The script will:
# 1. Check if script itself needs updating
# 2. Check for new commits
# 3. Exit if no updates (or prompt to force)
# 4. Backup current installation
# 5. Download and extract new code
# 6. Build application
# 7. Run migrations
# 8. Restart application
# 9. Verify health
```

### Production Updates
```bash
# Standard update (checks for commits first)
sudo update-ozvps

# Same process as dev, but uses main branch
```

### Force Update
If script detects you're already up-to-date but you want to update anyway:
```bash
# Run update command
sudo update-ozvps-dev

# When prompted "Force update anyway? [y/N]:"
# Press 'y' to proceed with forced update
```

## Version History

### v3.0.0 (Current)
- Complete rewrite with modern UI
- Added self-update capability
- Added commit tracking to avoid unnecessary updates
- Added progress bars and spinners
- Added automatic backup rotation (keeps last 5)
- Added health check with visual progress
- Added build verification and rollback
- Improved error handling and messages
- Added timestamp to completion message

### v2.0.0
- Added color output
- Improved error messages
- Added backup creation
- Added database migrations

### v1.0.0
- Initial version
- Basic update functionality

## Files

- `public/update-dev.sh` - Development update script (claude/dev-l5488 branch)
- `public/update-prod.sh` - Production update script (main branch)
- `update-ozvps-dev.sh` - Root copy of dev update script

## Installation

The update scripts are automatically installed by the install scripts:
- Dev: Installed to `/usr/local/bin/update-ozvps-dev`
- Prod: Installed to `/usr/local/bin/update-ozvps`

## How Commit Tracking Works

1. **First Update**: No `.commit` file exists, so script proceeds with update
2. **After Update**: Script saves latest commit hash to `/opt/ozvps-panel/.commit`
3. **Next Update**: Script reads `.commit` file and compares with GitHub
4. **If Same**: Shows "Already on latest version" and offers to force update
5. **If Different**: Shows current vs latest commit and proceeds with update
6. **After Success**: Updates `.commit` file with new hash

## How Self-Update Works

1. **Version Check**: Script fetches itself from GitHub
2. **Version Compare**: Extracts `SCRIPT_VERSION` from both local and remote
3. **If Newer**: Prompts to update script first
4. **If Yes**: Backs up current script, installs new one, and re-executes
5. **If No**: Continues with current version
6. **Then**: Proceeds with normal application update

## Output Example

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██████╗ ███████╗██╗   ██╗██████╗ ███████╗              ║
║  ██╔═══██╗╚══███╔╝██║   ██║██╔══██╗██╔════╝              ║
║  ██║   ██║  ███╔╝ ██║   ██║██████╔╝███████╗              ║
║  ██║   ██║ ███╔╝  ╚██╗ ██╔╝██╔═══╝ ╚════██║              ║
║  ╚██████╔╝███████╗ ╚████╔╝ ██║     ███████║              ║
║   ╚═════╝ ╚══════╝  ╚═══╝  ╚═╝     ╚══════╝              ║
║                                                           ║
║           Development Update System v3.0                 ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

Branch: claude/dev-l5488 | Repo: rorywood/ozvps
Script Version: 3.0.0

╭────────────────────────────────────────────────────────────╮
│ Step 0/6: Checking for Script Updates
╰────────────────────────────────────────────────────────────╯
→ Checking for newer version of update script...
✓ Script is up to date (v3.0.0)

→ Checking for new commits...
✓ New commits available!
  Current: abc1234
  Latest:  def5678

╭────────────────────────────────────────────────────────────╮
│ Step 1/6: Pre-flight Checks
╰────────────────────────────────────────────────────────────╯
→ Verifying system requirements...
✓ Disk space: 5000MB available
✓ PostgreSQL installed
✓ PostgreSQL is running
✓ Database configured
✓ Node.js v20.0.0 detected
✓ PM2 installed

... (continues through steps 2-6) ...

╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║                    ✓ Update Complete!                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

System Status:
  ► Application: Running
  ► Port: 3000
  ► Backup: /opt/ozvps-panel.backup.20260114_123456

Quick Commands:
  pm2 status              - View application status
  pm2 logs ozvps-panel    - View application logs
  pm2 restart ozvps-panel - Restart application
  pm2 monit               - Monitor resources

Completed at 2026-01-14 12:34:56
```

## Troubleshooting

### Update script says "Already on latest version" but I know there are updates
The commit file might be corrupted or out of sync. Force the update:
1. Run `sudo update-ozvps-dev`
2. When prompted, press `y` to force update

Or manually delete the commit file:
```bash
sudo rm /opt/ozvps-panel/.commit
sudo update-ozvps-dev
```

### Script update fails
If the script self-update fails, restore from backup:
```bash
sudo cp /usr/local/bin/update-ozvps-dev.backup /usr/local/bin/update-ozvps-dev
sudo chmod +x /usr/local/bin/update-ozvps-dev
```

### Build fails during update
The script automatically rolls back to the backup:
```bash
# Check the backup location from error message
ls -la /opt/ozvps-panel.backup.*

# Manual rollback if needed:
sudo rm -rf /opt/ozvps-panel
sudo mv /opt/ozvps-panel.backup.TIMESTAMP /opt/ozvps-panel
sudo pm2 restart ozvps-panel
```

### Application won't start after update
Check the logs:
```bash
pm2 logs ozvps-panel
```

Roll back to backup if needed:
```bash
sudo rm -rf /opt/ozvps-panel
sudo mv /opt/ozvps-panel.backup.TIMESTAMP /opt/ozvps-panel
sudo pm2 restart ozvps-panel
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/rorywood/ozvps/issues
- Check logs: `pm2 logs ozvps-panel`
- Check PM2 status: `pm2 status`
