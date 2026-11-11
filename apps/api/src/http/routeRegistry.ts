import { OpenAPIRegistry, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import { ApiErrorBodySchema } from '@ancestors-tree/shared';
import { Router, type Request, type Response } from 'express';
import type { z } from 'zod';
import { AppError, zodIssuesToDetails } from './AppError.ts';

/**
 * The shared error schema, named so the OpenAPI generator emits it once under
 * components/schemas/ApiErrorBody and references it with $ref. Zod's native `.meta({ id })`
 * is used instead of `OpenAPIRegistry.register()`, which needs `extendZodWithOpenApi(z)` to run
 * before the schema is created (Zod 4 copies prototype methods onto each instance at
 * construction) — impossible here, because the shared package builds it first.
 */
const ErrorBodySchema = ApiErrorBodySchema.meta({ id: 'ApiErrorBody' });

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface HandlerResult {
  status: number;
  body?: unknown;
}

export interface RouteResponse {
  description: string;
  schema?: z.ZodType;
}

export interface HandlerContext<P, Q, B> {
  params: P;
  query: Q;
  body: B;
  req: Request;
  res: Response;
}

export interface RouteDefinition<
  P extends z.ZodObject = z.ZodObject,
  Q extends z.ZodObject = z.ZodObject,
  B extends z.ZodType = z.ZodType,
> {
  method: HttpMethod;
  /** Express-style path relative to /api, e.g. "/clans/:id". */
  path: string;
  summary: string;
  tags: string[];
  request?: { params?: P; query?: Q; body?: B };
  responses: Record<number, RouteResponse>;
  handler: (
    ctx: HandlerContext<z.output<P>, z.output<Q>, z.output<B>>,
  ) => HandlerResult | Promise<HandlerResult>;
}

export interface RegisteredRoute {
  method: HttpMethod;
  path: string;
  openApiPath: string;
}

export interface RouteRegistryOptions {
  /** Validate handler output against the declared response schema (on outside production). */
  validateResponses: boolean;
}

type RequestPart = 'params' | 'query' | 'body';

export function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
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

function assertResponseMatches(
  route: Pick<RouteDefinition, 'method' | 'path' | 'responses'>,
  result: HandlerResult,
): void {
  const label = `${route.method.toUpperCase()} ${route.path}`;
  const declared = route.responses[result.status];
  if (!declared) {
    throw new Error(`${label} returned undeclared status ${result.status}`);
  }
  if (declared.schema) {
    const parsed = declared.schema.safeParse(result.body);
    if (!parsed.success) {
      throw new Error(`${label} response does not match its schema: ${parsed.error.message}`);
    }
  }
}

function toOpenApiResponses(responses: Record<number, RouteResponse>): RouteConfig['responses'] {
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

export function createRouteRegistry(options: RouteRegistryOptions) {
  const router = Router();
  const openApi = new OpenAPIRegistry();
  const routes: RegisteredRoute[] = [];

  function define<P extends z.ZodObject, Q extends z.ZodObject, B extends z.ZodType>(
    route: RouteDefinition<P, Q, B>,
  ): void {
    if (routes.some((r) => r.method === route.method && r.path === route.path)) {
      throw new Error(`Route already defined: ${route.method.toUpperCase()} ${route.path}`);
    }
    const openApiPath = toOpenApiPath(route.path);
    routes.push({ method: route.method, path: route.path, openApiPath });

    const { params, query, body } = route.request ?? {};
    openApi.registerPath({
      method: route.method,
      path: openApiPath,
      summary: route.summary,
      tags: route.tags,
      request: {
        ...(params ? { params } : {}),
        ...(query ? { query } : {}),
        ...(body
          ? { body: { required: true, content: { 'application/json': { schema: body } } } }
          : {}),
      },
      responses: toOpenApiResponses(route.responses),
    });

    router[route.method](route.path, async (req, res) => {
      const result = await route.handler({
        params: parsePart(params, req.params, 'params') as z.output<P>,
        query: parsePart(query, req.query, 'query') as z.output<Q>,
        body: parsePart(body, req.body, 'body') as z.output<B>,
        req,
        res,
      });
      if (options.validateResponses) assertResponseMatches(route, result);
      if (result.body === undefined) {
        res.status(result.status).end();
      } else {
        res.status(result.status).json(result.body);
      }
    });
  }

  return { router, openApi, routes: routes as readonly RegisteredRoute[], define };
}

export type RouteRegistry = ReturnType<typeof createRouteRegistry>;
