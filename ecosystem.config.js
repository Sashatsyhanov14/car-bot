module.exports = {
  apps: [
    {
      name: 'car-bot',
      script: 'npm',
      args: 'start',
      cwd: './bot',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
    },
  ],
};
