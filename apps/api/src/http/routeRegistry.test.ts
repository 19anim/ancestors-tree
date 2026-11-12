import express, { type RequestHandler } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildOpenApiDocument } from '../openapi/document.ts';
import { AppError } from './AppError.ts';
import { createErrorHandler } from './errorHandler.ts';
import { getLocals } from './locals.ts';
import {
  assertSupportedPath,
  createRouteRegistry,
  type AccessPolicies,
  type RouteRegistry,
} from './routeRegistry.ts';

const fakeSignIn: RequestHandler = (req, res, next) => {
  const userId = req.get('x-test-user');
  if (!userId) {
    next(new AppError('UNAUTHENTICATED', 'Sign in to continue'));
    return;
  }
  getLocals(res).userId = userId;
  next();
};

const policies: AccessPolicies = {
  signedIn: [fakeSignIn],
  clanRole: (role) => [
    fakeSignIn,
    (req, res, next) => {
      const locals = getLocals(res);
      locals.membership = { clanId: String(req.params.id), userId: locals.userId ?? '', role };
      next();
    },
  ],
};

function appWith(define: (api: RouteRegistry) => void) {
  const api = createRouteRegistry({ policies });
  define(api);
  const app = express();
  app.use(express.json());
  app.use(api.router);
  app.use(createErrorHandler(pino({ level: 'silent' })));
  return { app, api };
}

const ItemSchema = z.object({ id: z.string(), name: z.string() });

describe('route registry', () => {
  it('validates params, query and body', async () => {
    const { app } = appWith((api) =>
      api.define({
        method: 'post',
        path: '/items/:id',
        summary: 'Create',
        tags: ['Test'],
        access: 'public',
        request: {
          params: z.object({ id: z.string().length(3) }),
          query: z.object({ dryRun: z.enum(['yes', 'no']).optional() }),
          body: z.object({ name: z.string().min(1) }),
        },
        responses: { 201: { description: 'Created', schema: ItemSchema } },
        handler: ({ params, body }) => ({ status: 201, body: { id: params.id, name: body.name } }),
      }),
    );
    const bad = await request(app).post('/items/abcd?dryRun=maybe').send({ name: '' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const good = await request(app).post('/items/abc').send({ name: 'Lan' });
    expect(good.status).toBe(201);
    expect(good.body).toEqual({ id: 'abc', name: 'Lan' });
  });

  it('sends only the fields the response schema declares', async () => {
    const { app } = appWith((api) =>
      api.define({
        method: 'get',
        path: '/items/:id',
        summary: 'Read',
        tags: ['Test'],
        access: 'public',
        request: { params: z.object({ id: z.string() }) },
        responses: { 200: { description: 'Item', schema: ItemSchema } },
        handler: ({ params }) => {
          const stored = { id: params.id, name: 'Lan', passwordHash: 'secret-hash' };
          return { status: 200, body: stored };
        },
      }),
    );
    const response = await request(app).get('/items/a1');
    expect(response.body).toEqual({ id: 'a1', name: 'Lan' });
  });

  it('turns a response that breaks its schema into a 500', async () => {
    const { app } = appWith((api) =>
      api.define({
        method: 'get',
        path: '/broken',
        summary: 'Broken',
        tags: ['Test'],
        access: 'public',
        responses: { 200: { description: 'Item', schema: ItemSchema } },
        handler: () => ({
          status: 200,
          body: { id: 'x' } as unknown as z.input<typeof ItemSchema>,
        }),
      }),
    );
    const response = await request(app).get('/broken');
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('sets and clears cookies, and never on a failed response', async () => {
    const { app } = appWith((api) => {
      api.define({
        method: 'post',
        path: '/session',
        summary: 'Cookies',
        tags: ['Test'],
        access: 'public',
        responses: { 204: { description: 'Done' } },
        handler: () => ({
          status: 204,
          cookies: [
            { name: 'at', value: 'token-1', options: { httpOnly: true, path: '/api' } },
            { name: 'old', clear: true, options: { path: '/' } },
          ],
        }),
      });
      api.define({
        method: 'post',
        path: '/session-broken',
        summary: 'Broken cookies',
        tags: ['Test'],
        access: 'public',
        responses: { 200: { description: 'Item', schema: ItemSchema } },
        handler: () => ({
          status: 200,
          body: { id: 1 } as unknown as z.input<typeof ItemSchema>,
          cookies: [{ name: 'at', value: 'token-2', options: { path: '/api' } }],
        }),
      });
    });
    const ok = await request(app).post('/session');
    expect(ok.status).toBe(204);
    const cookies = ok.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('at=token-1;') && c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('old=;'))).toBe(true);

    const broken = await request(app).post('/session-broken');
    expect(broken.status).toBe(500);
    expect(broken.headers['set-cookie']).toBeUndefined();
  });

  it('redirects', async () => {
    const { app } = appWith((api) =>
      api.define({
        method: 'get',
        path: '/go',
        summary: 'Redirect',
        tags: ['Test'],
        access: 'public',
        responses: { 302: { description: 'To the app', redirect: true } },
        handler: () => ({ status: 302, redirect: '/clans' }),
      }),
    );
    const response = await request(app).get('/go');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/clans');
  });

  it('runs the access policy of each route', async () => {
    const { app } = appWith((api) => {
      api.define({
        method: 'get',
        path: '/me',
        summary: 'Me',
        tags: ['Test'],
        access: 'signedIn',
        responses: { 200: { description: 'Me', schema: z.object({ userId: z.string() }) } },
        handler: ({ userId }) => ({ status: 200, body: { userId: userId() } }),
      });
      api.define({
        method: 'get',
        path: '/clans/:id',
        summary: 'Clan',
        tags: ['Test'],
        access: { clanRole: 'editor' },
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: { description: 'Role', schema: z.object({ role: z.string(), clanId: z.string() }) },
        },
        handler: ({ membership }) => ({
          status: 200,
          body: { role: membership().role, clanId: membership().clanId },
        }),
      });
    });
    expect((await request(app).get('/me')).status).toBe(401);
    expect((await request(app).get('/me').set('x-test-user', 'u1')).body).toEqual({ userId: 'u1' });
    expect((await request(app).get('/clans/c1').set('x-test-user', 'u1')).body).toEqual({
      role: 'editor',
      clanId: 'c1',
    });
  });

  it('fails loudly when a public route reads the user', async () => {
    const { app } = appWith((api) =>
      api.define({
        method: 'get',
        path: '/oops',
        summary: 'Oops',
        tags: ['Test'],
        access: 'public',
        responses: { 200: { description: 'Me', schema: z.object({ userId: z.string() }) } },
        handler: ({ userId }) => ({ status: 200, body: { userId: userId() } }),
      }),
    );
    expect((await request(app).get('/oops')).status).toBe(500);
  });

  it('rejects an undeclared status', async () => {
    const { app } = appWith((api) =>
      api.define({
        method: 'get',
        path: '/teapot',
        summary: 'Teapot',
        tags: ['Test'],
        access: 'public',
        responses: { 200: { description: 'OK' } },
        handler: () => ({ status: 418 }) as unknown as { status: 200 },
      }),
    );
    expect((await request(app).get('/teapot')).status).toBe(500);
  });

  it('accepts only lowercase segments and :params in paths', () => {
    expect(() => assertSupportedPath('/clans/:id/members/:userId')).not.toThrow();
    for (const path of ['/files/*splat', '/a{/:b}', '/Upper', 'no-slash', '/trailing/']) {
      expect(() => assertSupportedPath(path), path).toThrow(/Unsupported route path/);
    }
  });

  it('detects duplicate routes even when parameter names differ', () => {
    expect(() =>
      appWith((api) => {
        const route = {
          method: 'get' as const,
          summary: 'Dup',
          tags: ['Test'],
          access: 'public' as const,
          responses: { 204: { description: 'Done' } },
          handler: () => ({ status: 204 as const }),
        };
        api.define({ ...route, path: '/clans/:id' });
        api.define({ ...route, path: '/clans/:clanId' });
      }),
    ).toThrow(/Route already defined: GET \/clans\/:clanId/);
  });

  it('documents the session cookie on protected routes only', () => {
    const { api } = appWith((api) => {
      api.define({
        method: 'get',
        path: '/open',
        summary: 'Open',
        tags: ['Test'],
        access: 'public',
        responses: { 204: { description: 'Done' } },
        handler: () => ({ status: 204 }),
      });
      api.define({
        method: 'get',
        path: '/clans/:id',
        summary: 'Clan',
        tags: ['Test'],
        access: { clanRole: 'owner' },
        request: { params: z.object({ id: z.string() }) },
        responses: { 204: { description: 'Done' } },
        handler: () => ({ status: 204 }),
      });
    });
    const document = buildOpenApiDocument(api.openApi, { version: 'test' });
    expect(document.components?.securitySchemes).toHaveProperty('sessionCookie');
    expect(document.paths?.['/open']?.get?.security).toBeUndefined();
    const clan = document.paths?.['/clans/{id}']?.get;
    expect(clan?.security).toEqual([{ sessionCookie: [] }]);
    expect(clan?.description).toMatch(/owner role/);
  });
});
