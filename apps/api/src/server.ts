import { pino } from 'pino';
import { createApp } from './app.ts';
import { apiDocsEnabled, loadConfig, requireSetting } from './config.ts';
import { connectDatabase, disconnectDatabase } from './db/connect.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig();
const logger = pino({
  level: config.LOG_LEVEL,
  // Session cookies are credentials: never write them to the logs.
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    censor: '[redacted]',
  },
});

try {
  await connectDatabase(requireSetting(config.MONGODB_URI, 'MONGODB_URI'));
} catch (error) {
  // Only the error name: driver messages can include parts of the connection string.
  logger.fatal(
    { errorName: (error as Error).name },
    'Could not connect to MongoDB (check MONGODB_URI and Atlas network access)',
  );
  process.exit(1);
}

const { app } = createApp({
  logger,
  version: config.APP_VERSION,
  httpLogging: config.NODE_ENV !== 'test',
  appOrigin: config.APP_ORIGIN,
  trustProxyHops: config.TRUST_PROXY_HOPS,
  apiDocs: apiDocsEnabled(config),
  rateLimits: { auth: 5, user: 300 },
});

const server = app.listen(config.PORT);

server.on('listening', () => {
  logger.info(`API listening on http://localhost:${config.PORT}`);
});

server.on('error', (error) => {
  logger.fatal({ err: error }, 'Could not start the HTTP server');
  process.exit(1);
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Shutting down');
  const forceExit = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();
  server.close((closeError) => {
    disconnectDatabase()
      .catch((error: unknown) => logger.error({ err: error }, 'Could not close MongoDB'))
      .finally(() => process.exit(closeError ? 1 : 0));
  });
  server.closeIdleConnections();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
