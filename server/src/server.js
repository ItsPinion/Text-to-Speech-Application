/**
 * Entry point — binds the app to a port. All logic lives in app.js so tests
 * can import the app without opening a socket.
 */
const app = require('./app');
const config = require('./config');

// 0.0.0.0 so the API is reachable from containers/proxies, not just localhost.
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(
    `> TTS.SYS :: API gateway online on http://0.0.0.0:${config.port} [env=${config.env}]`
  );
});

// Graceful shutdown — stop accepting connections, drain, exit.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`> ${signal} received — shutting down API gateway...`);
    server.close(() => process.exit(0));
  });
}

module.exports = server;
