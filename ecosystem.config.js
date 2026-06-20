module.exports = {
  apps: [
    {
      name: "ais-worker",
      script: "./worker/aisWorker.js",
      cwd: "/Users/macbook/Desktop/shipscout",
      restart_delay: 5000,
      max_restarts: 100,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      out_file: "/Users/macbook/Desktop/shipscout/logs/worker-out.log",
      error_file: "/Users/macbook/Desktop/shipscout/logs/worker-err.log",
      merge_logs: true,
    },
  ],
};
