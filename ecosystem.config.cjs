module.exports = {
  apps: [{
    name: 'ozvps-panel',
    script: 'npm',
    args: 'start',
    cwd: '/opt/ozvps-panel',
    env: {
      NODE_ENV: 'development'
    },
    env_file: '/opt/ozvps-panel/.env',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    error_file: '/root/.pm2/logs/ozvps-panel-error.log',
    out_file: '/root/.pm2/logs/ozvps-panel-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
