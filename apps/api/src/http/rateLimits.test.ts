import express, { type RequestHandler } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from './errorHandler.ts';
import { getLocals } from './locals.ts';
import { createAuthRateLimit, createUserRateLimit } from './rateLimits.ts';

const ok: RequestHandler = (_req, res) => {
  res.status(204).end();
};

function finish(app: express.Express) {
  app.use(createErrorHandler(pino({ level: 'silent' })));
  return app;
}

describe('auth rate limit', () => {
  it('allows `limit` attempts per minute per IP and endpoint, then answers 429', async () => {
    const app = express();
    app.use(['/login', '/register'], createAuthRateLimit(2));
    app.post(['/login', '/register'], ok);
    finish(app);

    expect((await request(app).post('/login')).status).toBe(204);
    expect((await request(app).post('/login')).status).toBe(204);
    const blocked = await request(app).post('/login');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['ratelimit-policy']).toBeDefined();
    // Changing the case of the path does not open a new budget.
    expect((await request(app).post('/LOGIN')).status).toBe(429);
    // Another endpoint has its own budget.
    expect((await request(app).post('/register')).status).toBe(204);
  });
});

describe('user rate limit', () => {
  it('counts requests per signed-in user', async () => {
    const app = express();
    app.use((req, res, next) => {
      getLocals(res).userId = req.get('x-test-user');
      next();
    });
    app.use(createUserRateLimit(1));
    app.get('/me', ok);
    finish(app);

    expect((await request(app).get('/me').set('x-test-user', 'a')).status).toBe(204);
    expect((await request(app).get('/me').set('x-test-user', 'a')).status).toBe(429);
    expect((await request(app).get('/me').set('x-test-user', 'b')).status).toBe(204);
  });
});
