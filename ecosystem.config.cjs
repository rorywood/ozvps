module.exports = {
  apps: [
    {
      name: 'ozvps',
      script: 'npm',
      args: 'start',
      cwd: '/opt/ozvps-panel',
      env: {
        NODE_ENV: 'production'
      },
      env_file: '/opt/ozvps-panel/.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '/root/.pm2/logs/ozvps-error.log',
      out_file: '/root/.pm2/logs/ozvps-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'ozvps-admin',
      script: 'node',
      args: 'admin-dist/server.cjs',
      cwd: '/opt/ozvps-panel',
      env: {
        NODE_ENV: 'production',
        ADMIN_PORT: '5001'
      },
      env_file: '/opt/ozvps-panel/.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/root/.pm2/logs/ozvps-admin-error.log',
      out_file: '/root/.pm2/logs/ozvps-admin-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
