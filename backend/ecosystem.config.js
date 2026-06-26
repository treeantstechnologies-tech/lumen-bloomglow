// PM2 process config for the Glowbloom API (no Docker).
// Start with:  pm2 start ecosystem.config.js
// Each app on a shared EC2 should use a unique name + PORT.
module.exports = {
  apps: [
    {
      name: "glowbloom-api",
      script: "src/server.js",
      cwd: __dirname,              // loads backend/.env via dotenv
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 4000,               // Glowbloom uses 4000; give other apps 4001, 4002, ...
      },
    },
  ],
};
