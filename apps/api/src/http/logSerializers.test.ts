import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app.ts';
import { useTestDatabase } from '../test/database.ts';
import { maskUrl } from './logSerializers.ts';

useTestDatabase();

describe('maskUrl', () => {
  it('masks invite tokens and strips sensitive queries only', () => {
    expect(maskUrl('/api/invites/abc123')).toBe('/api/invites/[token]');
    expect(maskUrl('/api/invites/abc123/accept')).toBe('/api/invites/[token]/accept');
    expect(maskUrl('/api/auth/google/callback?code=c&state=s')).toBe('/api/auth/google/callback');
    expect(maskUrl('/api/auth/google/start?returnTo=/join/t')).toBe('/api/auth/google/start');
    expect(maskUrl('/api/auth/reset-password?x=1')).toBe('/api/auth/reset-password');
    expect(maskUrl('/api/clans?page=2')).toBe('/api/clans?page=2');
  });
});

describe('request logging', () => {
  it('writes no invite token, OAuth code, returnTo, referer or redirect location', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => void lines.push(line) });
    const { app } = createTestApp({ logger, httpLogging: true });

    await request(app).get('/api/invites/secret-invite-token');
    await request(app)
      .post('/api/invites/secret-invite-token/accept')
      .set('Referer', 'http://localhost:5173/join/secret-invite-token');
    await request(app).get('/api/auth/google/callback?code=secret-code&state=secret-state');
    await request(app).get('/api/auth/google/start?returnTo=/join/secret-invite-token');

    const log = lines.join('');

    for (const secret of ['secret-invite-token', 'secret-code', 'secret-state']) {
      expect(log).not.toContain(secret);
    }
    const entries = lines.map((line) => JSON.parse(line)).filter((entry) => entry.req);
    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.req.url)).toEqual([
      '/api/invites/[token]',
      '/api/invites/[token]/accept',
      '/api/auth/google/callback',
      '/api/auth/google/start',
    ]);
    expect(entries[1].req.headers.referer).toBe('[redacted]');
    // The Google routes answer with a redirect, whatever the reason.
    const redirect = entries.find((entry) => entry.res.headers?.location !== undefined);
    expect(redirect?.res.headers.location).toBe('[redacted]');
  });
});
