'use strict';

const app = require('./app');
const config = require('./config');

const server = app.listen(config.port, () => {
  console.log(`devsecops-demo listening on http://localhost:${config.port} (${config.env})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
