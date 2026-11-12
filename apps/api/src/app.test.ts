import { HealthResponseSchema } from '@ancestors-tree/shared';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.ts';

const { app } = createApp({
  logger: pino({ level: 'silent' }),
  version: '9.9.9-test',
  httpLogging: false,
});

describe('createApp', () => {
  it('serves GET /api/health', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    const body = HealthResponseSchema.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('9.9.9-test');
    expect(body.database).toBe('disconnected');
  });

  it('returns NOT_FOUND JSON for unknown API routes', async () => {
    const response = await request(app).get('/api/nope');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('sets security headers', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
