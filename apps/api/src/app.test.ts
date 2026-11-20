import { HealthResponseSchema } from '@ancestors-tree/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from './test/app.ts';
import { netlifyClaims, signProxyToken, TEST_PROXY_SECRET } from './test/proxySignature.ts';

const { app } = createTestApp();

describe('createApp', () => {
  it('serves GET /api/health', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    const body = HealthResponseSchema.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0-test');
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

  it('blocks cross-site writes before routing', async () => {
    const response = await request(createTestApp().app)
      .post('/api/health')
      .set('Origin', 'https://evil.example.test');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('limits sign-in attempts per IP', async () => {
    const { app } = createTestApp({ rateLimits: { auth: 2, user: 1000 } });
    await request(app).post('/api/auth/login');
    await request(app).post('/api/auth/login');
    const response = await request(app).post('/api/auth/login');
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });

  it('trusts the configured number of proxies', () => {
    expect(createTestApp({ trustProxyHops: 2 }).app.get('trust proxy')).toBe(2);
  });

  it('serves the API docs only when enabled', async () => {
    expect((await request(createTestApp({ apiDocs: false }).app).get('/api/docs')).status).toBe(
      404,
    );
  });

  it('refuses requests that skip the Netlify proxy when a proxy secret is set', async () => {
    const { app } = createTestApp({ proxySignatureSecret: TEST_PROXY_SECRET });
    const unsigned = await request(app).get('/api/me');
    expect(unsigned.status).toBe(403);
    expect(unsigned.body.error.code).toBe('FORBIDDEN');

    const token = signProxyToken(netlifyClaims(Math.floor(Date.now() / 1000)));
    // Past the check: the route itself answers (signed out).
    const signed = await request(app).get('/api/me').set('x-nf-sign', token);
    expect(signed.status).toBe(401);
    expect(signed.body.error.code).toBe('UNAUTHENTICATED');

    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});
