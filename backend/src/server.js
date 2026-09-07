'use strict';

const env = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const { connectRedis, disconnectRedis } = require('./config/redis');
const logger = require('./utils/logger');
const createApp = require('./app');

let server = null;
let shuttingDown = false;

const start = async () => {
  // MongoDB is required; Redis is best-effort (caching and locking degrade).
  await connectDatabase();
  await connectRedis();

  const app = createApp();

  server = app.listen(env.port, () => {
    logger.info(`Smart Parking API listening on port ${env.port} (${env.nodeEnv})`);
    logger.info(`API base: http://localhost:${env.port}${env.apiPrefix}`);
  });

  // Keep-alive slightly above a typical 60s proxy idle timeout so Nginx, not
  // Node, is the one to close idle connections.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  return server;
};

/** Finish in-flight requests, then release the database and cache handles. */
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received - shutting down gracefully`);

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out - forcing exit');
    process.exit(1);
  }, 15000);
  forceExit.unref();

  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectRedis();
    await disconnectDatabase();
    clearTimeout(forceExit);
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown:', err.message);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});

// An uncaught exception leaves the process in an unknown state, so exit and let
// the supervisor (Docker/systemd) restart it cleanly.
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err.stack || err.message);
  shutdown('uncaughtException');
});

if (require.main === module) {
  start().catch((err) => {
    logger.error('Failed to start server:', err.stack || err.message);
    process.exit(1);
  });
}

module.exports = { start, shutdown };
