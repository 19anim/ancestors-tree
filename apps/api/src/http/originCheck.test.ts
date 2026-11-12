import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from './errorHandler.ts';
import { createOriginCheck } from './originCheck.ts';

const APP_ORIGIN = 'https://app.example.test';

function appWithCheck() {
  const app = express();
  app.use(createOriginCheck(APP_ORIGIN));
  app.all('/thing', (_req, res) => {
    res.status(204).end();
  });
  app.use(createErrorHandler(pino({ level: 'silent' })));
  return app;
}

describe('origin check', () => {
  it('lets reads through from any origin', async () => {
    const response = await request(appWithCheck())
      .get('/thing')
      .set('Origin', 'https://evil.example.test');
    expect(response.status).toBe(204);
  });

  it('lets writes through from the web app and from clients that send no Origin', async () => {
    const app = appWithCheck();
    expect((await request(app).post('/thing').set('Origin', APP_ORIGIN)).status).toBe(204);
    expect((await request(app).delete('/thing')).status).toBe(204);
  });

  it('blocks writes from any other origin', async () => {
    const app = appWithCheck();
    for (const origin of [
      'https://evil.example.test',
      'null',
      'https://app.example.test.evil.test',
    ]) {
      const response = await request(app).post('/thing').set('Origin', origin);
      expect(response.status, origin).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
  });
});
