import { apiReference } from '@scalar/express-api-reference';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { createErrorHandler } from './http/errorHandler.ts';
import { notFoundHandler } from './http/notFound.ts';
import { createRouteRegistry, type RouteRegistry } from './http/routeRegistry.ts';
import { buildOpenApiDocument, type OpenApiDocument } from './openapi/document.ts';
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
  openApiDocument: OpenApiDocument;
}

export function createApp(options: AppOptions): CreatedApp {
  const api = createRouteRegistry({ validateResponses: options.validateResponses });
  registerHealthRoutes(api, { version: options.version });
  const openApiDocument = buildOpenApiDocument(api.openApi, { version: options.version });

  const app = express();
  app.disable('x-powered-by');
  // Mounted before helmet: the Scalar page loads its script from a CDN, which helmet's CSP would block.
  app.use('/api/docs', apiReference({ url: '/api/openapi.json' }));
  app.use(helmet());
  if (options.httpLogging) app.use(pinoHttp({ logger: options.logger }));
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/api', api.router);
  app.use(notFoundHandler);
  app.use(createErrorHandler(options.logger));

  return { app, api, openApiDocument };
}
