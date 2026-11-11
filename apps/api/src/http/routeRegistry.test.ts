import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createErrorHandler } from './errorHandler.ts';
import { notFoundHandler } from './notFound.ts';
import { createRouteRegistry, toOpenApiPath } from './routeRegistry.ts';

const EchoResponseSchema = z.object({ id: z.string(), name: z.string(), loud: z.boolean() });

function buildTestApp(validateResponses = true) {
  const api = createRouteRegistry({ validateResponses });

  api.define({
    method: 'post',
    path: '/echo/:id',
    summary: 'Echo the input back',
    tags: ['Test'],
    request: {
      params: z.object({ id: z.string().regex(/^[a-z]+$/) }),
      query: z.object({ loud: z.enum(['true', 'false']).optional() }),
      body: z.object({ name: z.string().min(1) }),
    },
    responses: { 200: { description: 'Echoed', schema: EchoResponseSchema } },
    handler: ({ params, query, body }) => ({
      status: 200,
      body: { id: params.id, name: body.name, loud: query.loud === 'true' },
    }),
  });

  api.define({
    method: 'get',
    path: '/broken',
    summary: 'Returns a body that violates its schema',
    tags: ['Test'],
    responses: { 200: { description: 'Should be an object', schema: EchoResponseSchema } },
    handler: () => ({ status: 200, body: { id: 1 } }),
  });

  api.define({
    method: 'delete',
    path: '/things/:id',
    summary: 'Delete a thing',
    tags: ['Test'],
    request: { params: z.object({ id: z.string() }) },
    responses: { 204: { description: 'Deleted' } },
    handler: () => ({ status: 204 }),
  });

  const app = express();
  app.use(express.json());
  app.use('/api', api.router);
  app.use(notFoundHandler);
  app.use(createErrorHandler(pino({ level: 'silent' })));
  return { app, api };
}

describe('toOpenApiPath', () => {
  it('converts Express params to OpenAPI params', () => {
    expect(toOpenApiPath('/clans/:clanId/persons/:personId')).toBe(
      '/clans/{clanId}/persons/{personId}',
    );
    expect(toOpenApiPath('/health')).toBe('/health');
  });
});

describe('createRouteRegistry', () => {
  it('passes parsed params, query and body to the handler', async () => {
    const { app } = buildTestApp();
    const response = await request(app).post('/api/echo/abc?loud=true').send({ name: 'Tư' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 'abc', name: 'Tư', loud: true });
  });

  it('rejects an invalid body with prefixed details', async () => {
    const { app } = buildTestApp();
    const response = await request(app).post('/api/echo/abc').send({ name: '' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toBe('Invalid request body');
    expect(response.body.error.details[0].path).toBe('body.name');
  });

  it('rejects invalid params', async () => {
    const { app } = buildTestApp();
    const response = await request(app).post('/api/echo/ABC').send({ name: 'x' });
    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('params.id');
  });

  it('rejects a missing body as a validation error', async () => {
    const { app } = buildTestApp();
    const response = await request(app).post('/api/echo/abc');
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Invalid request body');
  });

  it('fails with INTERNAL_ERROR when a response violates its schema', async () => {
    const { app } = buildTestApp(true);
    const response = await request(app).get('/api/broken');
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('skips response validation when disabled', async () => {
    const { app } = buildTestApp(false);
    const response = await request(app).get('/api/broken');
    expect(response.status).toBe(200);
  });

  it('sends an empty body for 204 responses', async () => {
    const { app } = buildTestApp();
    const response = await request(app).delete('/api/things/42');
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });

  it('records every route with its OpenAPI path', () => {
    const { api } = buildTestApp();
    expect(api.routes).toEqual([
      { method: 'post', path: '/echo/:id', openApiPath: '/echo/{id}' },
      { method: 'get', path: '/broken', openApiPath: '/broken' },
      { method: 'delete', path: '/things/:id', openApiPath: '/things/{id}' },
    ]);
  });

  it('refuses to define the same route twice', () => {
    const { api } = buildTestApp();
    expect(() =>
      api.define({
        method: 'get',
        path: '/broken',
        summary: 'Duplicate',
        tags: ['Test'],
        responses: { 200: { description: 'x' } },
        handler: () => ({ status: 200 }),
      }),
    ).toThrow('Route already defined: GET /broken');
  });
});
