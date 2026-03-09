module.exports = {
  apps: [
    {
      name: 'line-pay',
      cwd: '/root/line-pay-service',
      script: 'src/app.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/root/.pm2/logs/line-pay-error.log',
      out_file: '/root/.pm2/logs/line-pay-out.log',
      time: true
    }
  ]
};
