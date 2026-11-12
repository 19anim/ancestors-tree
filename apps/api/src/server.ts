import { pino } from 'pino';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });

const { app } = createApp({
  logger,
  version: config.APP_VERSION,
  validateResponses: config.NODE_ENV !== 'production',
  httpLogging: config.NODE_ENV !== 'test',
});

app.listen(config.PORT, () => {
  logger.info(`API listening on http://localhost:${config.PORT}`);
});
