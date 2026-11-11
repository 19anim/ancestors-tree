import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';

const { app, api, openApiDocument } = createApp({
  logger: pino({ level: 'silent' }),
  version: '1.0.0-test',
  validateResponses: true,
  httpLogging: false,
});

function documentedOperations(): string[] {
  const operations: string[] = [];
  for (const [path, item] of Object.entries(openApiDocument.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      if (item?.[method]) operations.push(`${method} ${path}`);
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
