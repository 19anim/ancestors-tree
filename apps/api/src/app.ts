import { apiReference } from '@scalar/express-api-reference';
import cookieParser from 'cookie-parser';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { serializeRequest, serializeResponse } from './http/logSerializers.ts';
import { createErrorHandler } from './http/errorHandler.ts';
import { notFoundHandler } from './http/notFound.ts';
import { createOriginCheck } from './http/originCheck.ts';
import { createProxySignatureCheck } from './http/proxySignature.ts';
import {
  AUTH_RATE_LIMITED_PATHS,
  createAuthRateLimit,
  createLoginEmailRateLimit,
  createUserRateLimit,
} from './http/rateLimits.ts';
import {
  createRouteRegistry,
  type AccessPolicies,
  type RouteRegistry,
} from './http/routeRegistry.ts';
import { buildOpenApiDocument, type OpenApiDocument } from './openapi/document.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { createRequireClanRole, createRequireExpectedUser } from './clans/access.ts';
import { registerClanRoutes } from './routes/clans.ts';
import { registerMemberRoutes } from './routes/members.ts';
import { registerInviteRoutes } from './routes/invites.ts';
import { registerTreeRoutes } from './routes/tree.ts';
import { registerHistoryRoutes } from './routes/history.ts';
import { registerPhotoRoutes } from './routes/photos.ts';
import { registerViewPreferenceRoutes } from './routes/viewPreference.ts';
import type { PhotoStore } from './photos/store.ts';
import type { ErrorReporter } from './monitoring/reporter.ts';
import { registerHealthRoutes } from './routes/health.ts';
import { registerMeRoutes } from './routes/me.ts';
import { createPasswordResets } from './auth/passwordResets.ts';
import type { Mailer } from './mail/mailer.ts';
import { registerPasswordResetRoutes } from './routes/passwordReset.ts';
import type { GoogleOAuthClient } from './auth/google.ts';
import { registerGoogleRoutes } from './routes/google.ts';
import { createPasswords } from './auth/passwords.ts';
import { createRequireAuth } from './auth/requireAuth.ts';
import { createAuthService } from './auth/service.ts';
import { createAccessTokens } from './auth/tokens.ts';

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
  /**
   * PROXY_SIGNATURE_SECRET: when set, every request except GET /api/health must carry Netlify's
   * x-nf-sign (spec §12). Production always sets it; development and tests usually do not.
   */
  proxySignatureSecret?: string;
  /** Serve the interactive reference at /api/docs (see apiDocsEnabled). */
  apiDocs: boolean;
  /**
   * Requests per minute: `auth` per IP and endpoint, `user` per signed-in user. `loginEmail`:
   * login attempts per email per 15 minutes (default 10).
   */
  rateLimits: { auth: number; user: number; loginEmail?: number };
  /** Sends password reset emails (createMailer). */
  mailer: Mailer;
  /** Google sign-in; off when GOOGLE_CLIENT_ID is not set. */
  google?: GoogleOAuthClient;
  /** Cloudinary (spec §12); undefined when CLOUDINARY_URL is not set. */
  photos?: PhotoStore;
  /** Unexpected errors (answered 500) go here: Sentry in production with a DSN. */
  errorReporter?: ErrorReporter;
  auth: {
    /** JWT_SECRET: signs the access tokens. */
    jwtSecret: string;
    /** Secure (HTTPS-only) cookies: on in production. */
    secureCookies: boolean;
    bcryptCost: number;
  };
}

export interface CreatedApp {
  app: Express;
  api: RouteRegistry;
  openApiDocument: OpenApiDocument;
}

export function createApp(options: AppOptions): CreatedApp {
  const tokens = createAccessTokens(options.auth.jwtSecret);
  const passwords = createPasswords(options.auth.bcryptCost);
  const auth = createAuthService({ tokens, passwords, secureCookies: options.auth.secureCookies });

  // One shared per-user budget across every protected route.
  const signedIn = [createRequireAuth(tokens), createUserRateLimit(options.rateLimits.user)];
  const policies: AccessPolicies = {
    signedIn,
    clanRole: (role, { expectedUser }) => [
      ...signedIn,
      ...(expectedUser ? [createRequireExpectedUser()] : []),
      createRequireClanRole(role),
    ],
  };

  const api = createRouteRegistry({ policies });
  registerHealthRoutes(api, { version: options.version });
  registerAuthRoutes(api, { auth });
  registerMeRoutes(api, { auth });
  const resets = createPasswordResets({
    mailer: options.mailer,
    appOrigin: options.appOrigin,
    passwords,
    logger: options.logger,
  });
  registerPasswordResetRoutes(api, { auth, resets, logger: options.logger });
  registerGoogleRoutes(api, {
    google: options.google,
    auth,
    appOrigin: options.appOrigin,
    secureCookies: options.auth.secureCookies,
    logger: options.logger,
  });
  registerClanRoutes(api, { photos: options.photos, logger: options.logger });
  registerMemberRoutes(api);
  registerInviteRoutes(api);
  registerTreeRoutes(api, { photos: options.photos, logger: options.logger });
  registerHistoryRoutes(api);
  registerPhotoRoutes(api, { photos: options.photos });
  registerViewPreferenceRoutes(api);
  const openApiDocument = buildOpenApiDocument(api.openApi, { version: options.version });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxyHops);
  // First, so every answer is logged, including the 403s of the proxy check.
  if (options.httpLogging)
    app.use(
      pinoHttp({
        logger: options.logger,
        serializers: { req: serializeRequest, res: serializeResponse },
        // The address after `trust proxy`, so a real deploy can confirm TRUST_PROXY_HOPS.
        customProps: (req) => ({ clientIp: (req as Request).ip }),
      }),
    );
  if (options.proxySignatureSecret !== undefined) {
    // Before anything that reads the request: only Netlify's proxy gets further.
    app.use(
      createProxySignatureCheck({ secret: options.proxySignatureSecret, logger: options.logger }),
    );
  }
  if (options.apiDocs) {
    // Mounted before helmet: the Scalar page loads its script from a CDN, which helmet's CSP
    // would block. Off in production by default, so it never runs next to real sessions.
    app.use('/api/docs', apiReference({ url: '/api/openapi.json', cdn: SCALAR_CDN }));
  }
  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createOriginCheck(options.appOrigin));
  app.use(AUTH_RATE_LIMITED_PATHS, createAuthRateLimit(options.rateLimits.auth));
  // After express.json: the key is the email in the body.
  app.use('/api/auth/login', createLoginEmailRateLimit(options.rateLimits.loginEmail ?? 10));
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/api', api.router);
  app.use(notFoundHandler);
  app.use(createErrorHandler(options.logger, options.errorReporter));

  return { app, api, openApiDocument };
}
