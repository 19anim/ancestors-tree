import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app.ts';

const { app, api, openApiDocument } = createTestApp();

function documentedOperations(): string[] {
  const operations: string[] = [];
  for (const [path, item] of Object.entries(openApiDocument.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      if (item?.[method]) operations.push(`${method} ${path}`);
    }
  }
  return operations.sort();
}

/**
 * The parts of an Express 5 router layer this test relies on. `methods` is not in
 * @types/express, so the shape is checked at runtime: if Express internals change, the
 * route-coverage tests fail loudly instead of passing vacuously.
 */
interface ExpressLayer {
  handle?: unknown;
  route?: { path?: unknown; methods?: unknown };
}

function layersOf(router: { stack?: unknown }, label: string): readonly ExpressLayer[] {
  expect(Array.isArray(router.stack), `${label}.stack must be an array`).toBe(true);
  return router.stack as readonly ExpressLayer[];
}

/** "method path" for every route layer (app.get, router.post, ...) on a router stack. */
function expressRoutes(router: { stack?: unknown }, label: string): string[] {
  const operations: string[] = [];
  for (const layer of layersOf(router, label)) {
    if (layer.route === undefined) continue;
    const { path, methods } = layer.route;
    expect(typeof path, `${label} route path must be a string`).toBe('string');
    expect(typeof methods, `${label} route methods must be an object`).toBe('object');
    for (const [method, enabled] of Object.entries(methods as Record<string, unknown>)) {
      if (enabled === true) operations.push(`${method} ${String(path)}`);
    }
  }
  return operations.sort();
}

describe('OpenAPI document', () => {
  it('documents exactly the registered routes (route coverage)', () => {
    const registered = api.routes.map((r) => `${r.method} ${r.openApiPath}`).sort();
    expect(registered.length).toBeGreaterThan(0);
    expect(documentedOperations()).toEqual(registered);
  });

  it('mounts on the API router exactly the routes declared with api.define', () => {
    const declared = api.routes.map((r) => `${r.method} ${r.path}`).sort();
    expect(declared.length).toBeGreaterThan(0);
    expect(expressRoutes(api.router, 'api.router')).toEqual(declared);
  });

  it('has no undocumented routes on the app itself', () => {
    // GET /api/openapi.json is the only allow-listed infrastructure route; /api/docs is
    // mounted with app.use and is middleware, not a route layer.
    expect(expressRoutes(app.router, 'app.router')).toEqual(['get /api/openapi.json']);
    // The only nested router mounted on the app is the API router.
    const nestedRouters = layersOf(app.router, 'app.router').filter(
      (layer) =>
        typeof layer.handle === 'function' && 'stack' in layer.handle && layer.route === undefined,
    );
    expect(nestedRouters.map((layer) => layer.handle)).toEqual([api.router]);
  });

  it('uses OpenAPI 3.1 with the /api server prefix', () => {
    expect(openApiDocument.openapi).toBe('3.1.0');
    expect(openApiDocument.info.version).toBe('1.0.0-test');
    expect(openApiDocument.servers).toEqual([{ url: '/api' }]);
  });

  it('registers the shared error schema as a component', () => {
    expect(openApiDocument.components?.schemas).toHaveProperty('ApiErrorBody');
  });

  it('serves the document at GET /api/openapi.json', async () => {
    const response = await request(app).get('/api/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
  });

  it('serves the interactive reference at GET /api/docs', async () => {
    const response = await request(app).get('/api/docs');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });
});
