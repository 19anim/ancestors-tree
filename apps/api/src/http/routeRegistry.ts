import { OpenAPIRegistry, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import { ApiErrorBodySchema, type ClanRole } from '@ancestors-tree/shared';
import {
  Router,
  type CookieOptions,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { z } from 'zod';
import { ACCESS_COOKIE } from '../auth/cookieNames.ts';
import { AppError, zodIssuesToDetails } from './AppError.ts';
import { getLocals, type ClanMembership } from './locals.ts';

/**
 * The shared error schema, named so the OpenAPI generator emits it once under
 * components/schemas/ApiErrorBody and references it with $ref. Zod's native `.meta({ id })`
 * is used instead of `OpenAPIRegistry.register()`, which needs `extendZodWithOpenApi(z)` to run
 * before the schema is created — impossible here, because the shared package builds it first.
 */
const ErrorBodySchema = ApiErrorBodySchema.meta({ id: 'ApiErrorBody' });

const SECURITY_SCHEME = 'sessionCookie';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Who may call a route. Every route must say it explicitly. */
export type Access = 'public' | 'signedIn' | { clanRole: ClanRole };

/** The middleware that enforces each access level (built by createApp). */
export interface AccessPolicies {
  signedIn: RequestHandler[];
  /** Must also authenticate: it runs instead of `signedIn`, not after it. */
  clanRole: (role: ClanRole) => RequestHandler[];
}

export type CookieInstruction =
  | { name: string; value: string; options: CookieOptions }
  | { name: string; clear: true; options: CookieOptions };

export interface RouteResponse {
  description: string;
  schema?: z.ZodType;
  /** The handler returns `{ status, redirect }` for this status. */
  redirect?: true;
}

type Responses = Record<number, RouteResponse>;

interface ResultExtras {
  cookies?: CookieInstruction[];
}

type ResultFor<S extends number, R> = R extends { redirect: true }
  ? { status: S; redirect: string } & ResultExtras
  : R extends { schema: infer Schema extends z.ZodType }
    ? { status: S; body: z.input<Schema> } & ResultExtras
    : { status: S; body?: undefined } & ResultExtras;

/** One of the declared responses, with a body typed by that response's schema. */
export type HandlerResult<R extends Responses> = {
  [S in keyof R & number]: ResultFor<S, R[S]>;
}[keyof R & number];

interface AnyResult extends ResultExtras {
  status: number;
  body?: unknown;
  redirect?: string;
}

export interface HandlerContext<P, Q, B> {
  params: P;
  query: Q;
  body: B;
  /** Read-only access to the request (cookies, IP, headers). Handlers never write to `res`. */
  req: Request;
  /** The signed-in user's id. Throws on a public route (a programming error). */
  userId: () => string;
  /** The caller's membership of the clan in `:id`. Throws unless the route needs a clan role. */
  membership: () => ClanMembership;
}

export interface RouteDefinition<
  P extends z.ZodObject,
  Q extends z.ZodObject,
  B extends z.ZodType,
  R extends Responses,
> {
  method: HttpMethod;
  /** Express-style path relative to /api: lowercase segments and :params only. */
  path: string;
  summary: string;
  tags: string[];
  access: Access;
  request?: { params?: P; query?: Q; body?: B };
  responses: R;
  handler: (
    ctx: HandlerContext<z.output<P>, z.output<Q>, z.output<B>>,
  ) => HandlerResult<NoInfer<R>> | Promise<HandlerResult<NoInfer<R>>>;
}

export interface RegisteredRoute {
  method: HttpMethod;
  path: string;
  openApiPath: string;
}

export interface RouteRegistryOptions {
  policies: AccessPolicies;
}

type RequestPart = 'params' | 'query' | 'body';

const SEGMENT = '(?:[a-z0-9-]+|:[a-zA-Z][a-zA-Z0-9]*)';
const PATH_PATTERN = new RegExp(`^(?:/${SEGMENT})+$`);

/** Express 5 wildcards (`*splat`) and optional groups (`{…}`) are not supported. */
export function assertSupportedPath(path: string): void {
  if (!PATH_PATTERN.test(path)) {
    throw new Error(
      `Unsupported route path "${path}": use lowercase segments and :params only (no wildcards, optional groups or trailing slash)`,
    );
  }
}

export function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9]+)/g, '{$1}');
}

/** Two routes clash when they differ only in parameter names. */
function routeKey(method: HttpMethod, path: string): string {
  return `${method} ${path.replace(/:[A-Za-z0-9]+/g, ':')}`;
}

function parsePart(schema: z.ZodType | undefined, value: unknown, part: RequestPart): unknown {
  if (!schema) return part === 'body' ? undefined : {};
  const parsed = schema.safeParse(value ?? {});
  if (!parsed.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Invalid request ${part}`,
      zodIssuesToDetails(parsed.error.issues, part),
    );
  }
  return parsed.data;
}

function accessMiddleware(access: Access, policies: AccessPolicies): RequestHandler[] {
  if (access === 'public') return [];
  if (access === 'signedIn') return policies.signedIn;
  return policies.clanRole(access.clanRole);
}

function describeAccess(access: Access): string | undefined {
  if (access === 'public') return undefined;
  if (access === 'signedIn') return 'Requires a signed-in user.';
  return `Requires the ${access.clanRole} role (or higher) in the clan.`;
}

function toOpenApiResponses(responses: Responses): RouteConfig['responses'] {
  const documented: RouteConfig['responses'] = {};
  for (const [status, response] of Object.entries(responses)) {
    documented[status] = {
      description: response.description,
      ...(response.schema ? { content: { 'application/json': { schema: response.schema } } } : {}),
    };
  }
  documented.default = {
    description: 'Error response (see docs/error-codes.md)',
    content: { 'application/json': { schema: ErrorBodySchema } },
  };
  return documented;
}

/** Validates the result first, then sets cookies, then sends: a failed response sets no cookie. */
function sendResult(res: Response, label: string, responses: Responses, result: AnyResult): void {
  const declared = responses[result.status];
  if (!declared) throw new Error(`${label} returned undeclared status ${result.status}`);

  let payload: unknown;
  if (declared.redirect) {
    if (typeof result.redirect !== 'string') {
      throw new Error(`${label} must return a redirect URL for status ${result.status}`);
    }
  } else if (declared.schema) {
    // Always parse: the client receives only the fields the schema declares.
    const parsed = declared.schema.safeParse(result.body);
    if (!parsed.success) {
      throw new Error(`${label} response does not match its schema: ${parsed.error.message}`);
    }
    payload = parsed.data;
  }

  for (const cookie of result.cookies ?? []) {
    if ('clear' in cookie) res.clearCookie(cookie.name, cookie.options);
    else res.cookie(cookie.name, cookie.value, cookie.options);
  }

  if (declared.redirect) res.redirect(result.status, result.redirect as string);
  else if (declared.schema) res.status(result.status).json(payload);
  else res.status(result.status).end();
}

export function createRouteRegistry(options: RouteRegistryOptions) {
  const router = Router();
  const openApi = new OpenAPIRegistry();
  const routes: RegisteredRoute[] = [];
  const keys = new Set<string>();

  openApi.registerComponent('securitySchemes', SECURITY_SCHEME, {
    type: 'apiKey',
    in: 'cookie',
    name: ACCESS_COOKIE,
  });

  function define<
    P extends z.ZodObject,
    Q extends z.ZodObject,
    B extends z.ZodType,
    const R extends Responses,
  >(route: RouteDefinition<P, Q, B, R>): void {
    const label = `${route.method.toUpperCase()} ${route.path}`;
    assertSupportedPath(route.path);
    const key = routeKey(route.method, route.path);
    if (keys.has(key)) throw new Error(`Route already defined: ${label}`);
    keys.add(key);

    const openApiPath = toOpenApiPath(route.path);
    routes.push({ method: route.method, path: route.path, openApiPath });

    const { params, query, body } = route.request ?? {};
    const description = describeAccess(route.access);
    openApi.registerPath({
      method: route.method,
      path: openApiPath,
      summary: route.summary,
      tags: route.tags,
      ...(description ? { description, security: [{ [SECURITY_SCHEME]: [] }] } : {}),
      request: {
        ...(params ? { params } : {}),
        ...(query ? { query } : {}),
        ...(body
          ? { body: { required: true, content: { 'application/json': { schema: body } } } }
          : {}),
      },
      responses: toOpenApiResponses(route.responses),
    });

    router[route.method](
      route.path,
      ...accessMiddleware(route.access, options.policies),
      async (req: Request, res: Response) => {
        const locals = getLocals(res);
        const result = await route.handler({
          params: parsePart(params, req.params, 'params') as z.output<P>,
          query: parsePart(query, req.query, 'query') as z.output<Q>,
          body: parsePart(body, req.body, 'body') as z.output<B>,
          req,
          userId: () => {
            if (!locals.userId) throw new Error(`${label} reads the user but is not protected`);
            return locals.userId;
          },
          membership: () => {
            if (!locals.membership) {
              throw new Error(`${label} reads a membership but does not require a clan role`);
            }
            return locals.membership;
          },
        });
        sendResult(res, label, route.responses, result as AnyResult);
      },
    );
  }

  return { router, openApi, routes: routes as readonly RegisteredRoute[], define };
}

export type RouteRegistry = ReturnType<typeof createRouteRegistry>;
