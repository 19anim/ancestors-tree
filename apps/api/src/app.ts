import { apiReference } from '@scalar/express-api-reference';
import cookieParser from 'cookie-parser';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { createErrorHandler } from './http/errorHandler.ts';
import { notFoundHandler } from './http/notFound.ts';
import { createOriginCheck } from './http/originCheck.ts';
import { AUTH_RATE_LIMITED_PATHS, createAuthRateLimit } from './http/rateLimits.ts';
import { createRouteRegistry, type RouteRegistry } from './http/routeRegistry.ts';
import { buildOpenApiDocument, type OpenApiDocument } from './openapi/document.ts';
import { registerHealthRoutes } from './routes/health.ts';

/** Pinned so a CDN release cannot change the page that runs next to the API. */
const SCALAR_CDN = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.78.1';

export interface AppOptions {
  logger: Logger;
  version: string;
  httpLogging: boolean;
  /** The web app's origin (APP_ORIGIN): the only origin allowed to send writes. */
  appOrigin: string;
  /** Proxies in front of the API (TRUST_PROXY_HOPS), so req.ip is the client's address. */
  trustProxyHops: number;
  /** Serve the interactive reference at /api/docs (see apiDocsEnabled). */
  apiDocs: boolean;
  /** Requests per minute: `auth` per IP and endpoint, `user` per signed-in user. */
  rateLimits: { auth: number; user: number };
}

export interface CreatedApp {
  app: Express;
  api: RouteRegistry;
  openApiDocument: OpenApiDocument;
}

/** Replaced in Task 7 (signedIn) and Task 10 (clan roles); until then nothing is protected. */
const notConfigured: RequestHandler = (_req, _res, next) => {
  next(new Error('Access policies are not configured yet'));
};

export function createApp(options: AppOptions): CreatedApp {
  const api = createRouteRegistry({
    policies: { signedIn: [notConfigured], clanRole: () => [notConfigured] },
  });
  registerHealthRoutes(api, { version: options.version });
  const openApiDocument = buildOpenApiDocument(api.openApi, { version: options.version });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxyHops);
  if (options.apiDocs) {
    // Mounted before helmet: the Scalar page loads its script from a CDN, which helmet's CSP
    // would block. Off in production by default, so it never runs next to real sessions.
    app.use('/api/docs', apiReference({ url: '/api/openapi.json', cdn: SCALAR_CDN }));
  }
  app.use(helmet());
  if (options.httpLogging) app.use(pinoHttp({ logger: options.logger }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createOriginCheck(options.appOrigin));
  app.use(AUTH_RATE_LIMITED_PATHS, createAuthRateLimit(options.rateLimits.auth));
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/api', api.router);
  app.use(notFoundHandler);
  app.use(createErrorHandler(options.logger));

  return { app, api, openApiDocument };
}
