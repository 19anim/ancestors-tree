import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { createErrorHandler } from './http/errorHandler.ts';
import { notFoundHandler } from './http/notFound.ts';
import { createRouteRegistry, type RouteRegistry } from './http/routeRegistry.ts';
import { registerHealthRoutes } from './routes/health.ts';

export interface AppOptions {
  logger: Logger;
  version: string;
  validateResponses: boolean;
  httpLogging: boolean;
}

export interface CreatedApp {
  app: Express;
  api: RouteRegistry;
}

export function createApp(options: AppOptions): CreatedApp {
  const api = createRouteRegistry({ validateResponses: options.validateResponses });
  registerHealthRoutes(api, { version: options.version });

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  if (options.httpLogging) app.use(pinoHttp({ logger: options.logger }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', api.router);
  app.use(notFoundHandler);
  app.use(createErrorHandler(options.logger));

  return { app, api };
}
