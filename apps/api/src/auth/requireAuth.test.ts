import cookieParser from 'cookie-parser';
import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '../http/errorHandler.ts';
import { getLocals } from '../http/locals.ts';
import { createRequireAuth } from './requireAuth.ts';
import { createAccessTokens } from './tokens.ts';

const tokens = createAccessTokens('test-only-secret-with-at-least-32-chars');

const app = express();
app.use(cookieParser());
app.get('/private', createRequireAuth(tokens), (_req, res) => {
  res.json({ userId: getLocals(res).userId });
});
app.use(createErrorHandler(pino({ level: 'silent' })));

describe('requireAuth', () => {
  it('lets a valid access cookie through and exposes the user id', async () => {
    const token = await tokens.sign('64b7f0c2a1b2c3d4e5f60718');
    const response = await request(app).get('/private').set('Cookie', `at=${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: '64b7f0c2a1b2c3d4e5f60718' });
  });

  it('answers 401 without a valid access cookie', async () => {
    for (const cookie of [undefined, 'at=forged', 'other=1']) {
      const call = request(app).get('/private');
      const response = await (cookie ? call.set('Cookie', cookie) : call);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }
  });
});
