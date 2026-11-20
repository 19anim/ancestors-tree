import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { netlifyClaims, signProxyToken, TEST_PROXY_SECRET } from '../test/proxySignature.ts';
import { createErrorHandler } from './errorHandler.ts';
import {
  CLOCK_SKEW_SECONDS,
  createProxySignatureCheck,
  PROXY_SIGNATURE_HEADER,
  verifyProxySignature,
} from './proxySignature.ts';

const NOW = 1_800_000_000;

describe('verifyProxySignature', () => {
  const verify = (token: string | undefined, now = NOW) =>
    verifyProxySignature(token, TEST_PROXY_SECRET, now);

  it("accepts Netlify's token", () => {
    expect(verify(signProxyToken(netlifyClaims(NOW)))).toEqual({ ok: true });
  });

  it('refuses a missing or malformed token', () => {
    expect(verify(undefined)).toEqual({ ok: false, reason: 'missing' });
    expect(verify('')).toEqual({ ok: false, reason: 'missing' });
    expect(verify('only.two')).toEqual({ ok: false, reason: 'malformed' });
    expect(verify('not-json.not-json.sig')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('accepts HS256 only', () => {
    for (const alg of ['none', 'HS512', 'RS256']) {
      const token = signProxyToken(netlifyClaims(NOW), { header: { alg } });
      expect(verify(token), alg).toEqual({ ok: false, reason: 'algorithm' });
    }
  });

  it('refuses a token signed with another secret, or changed after signing', () => {
    const other = signProxyToken(netlifyClaims(NOW), { secret: 'other-proxy-'.repeat(4) });
    expect(verify(other)).toEqual({ ok: false, reason: 'signature' });

    const [header, , signature] = signProxyToken(netlifyClaims(NOW)).split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify(netlifyClaims(NOW, { exp: NOW + 86_400 })),
    ).toString('base64url');
    expect(verify(`${header}.${forgedPayload}.${signature}`)).toEqual({
      ok: false,
      reason: 'signature',
    });
    // Characters outside base64url would be skipped by Buffer.from; they must not pass.
    expect(verify(`${signProxyToken(netlifyClaims(NOW))}!`)).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it('refuses another issuer and a token with no expiry', () => {
    expect(verify(signProxyToken(netlifyClaims(NOW, { iss: 'someone-else' })))).toEqual({
      ok: false,
      reason: 'issuer',
    });
    expect(verify(signProxyToken(netlifyClaims(NOW, { exp: undefined })))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it(`accepts a token up to ${CLOCK_SKEW_SECONDS} s after exp, and refuses it after that`, () => {
    const token = signProxyToken(netlifyClaims(NOW, { exp: NOW }));
    expect(verify(token, NOW + CLOCK_SKEW_SECONDS)).toEqual({ ok: true });
    expect(verify(token, NOW + CLOCK_SKEW_SECONDS + 1)).toEqual({
      ok: false,
      reason: 'expired',
      secondsPastExp: CLOCK_SKEW_SECONDS + 1,
    });
  });
});

interface LogEntry {
  level: number;
  msg: string;
  reason?: string;
}

function appWithCheck() {
  const entries: LogEntry[] = [];
  const lines: string[] = [];
  const logger = pino(
    { level: 'warn' },
    {
      write(line: string) {
        lines.push(line);
        entries.push(JSON.parse(line) as LogEntry);
      },
    },
  );
  const app = express();
  app.use(createProxySignatureCheck({ secret: TEST_PROXY_SECRET, logger, now: () => NOW * 1000 }));
  app.all('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.all('/api/things', (_req, res) => {
    res.status(204).end();
  });
  app.use(createErrorHandler(pino({ level: 'silent' })));
  return { app, entries, lines };
}

describe('createProxySignatureCheck', () => {
  it('lets a request signed by Netlify through', async () => {
    const { app } = appWithCheck();
    const response = await request(app)
      .post('/api/things')
      .set(PROXY_SIGNATURE_HEADER, signProxyToken(netlifyClaims(NOW)));
    expect(response.status).toBe(204);
  });

  it('refuses any other request with FORBIDDEN, and logs the reason only', async () => {
    const { app, entries, lines } = appWithCheck();
    const wrong = signProxyToken(netlifyClaims(NOW), { secret: 'other-proxy-'.repeat(4) });

    const unsigned = await request(app).get('/api/things');
    expect(unsigned.status).toBe(403);
    expect(unsigned.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Requests must come through the web app' },
    });
    const forged = await request(app).get('/api/things').set(PROXY_SIGNATURE_HEADER, wrong);
    expect(forged.status).toBe(403);

    expect(entries.map((entry) => entry.reason)).toEqual(['missing', 'signature']);
    const log = lines.join('');
    expect(log).not.toContain(wrong);
    expect(log).not.toContain(TEST_PROXY_SECRET);
  });

  it('exempts GET and HEAD /api/health only, for the health check and the uptime monitor', async () => {
    const { app } = appWithCheck();
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).head('/api/health')).status).toBe(200);
    expect((await request(app).get('/API/Health/')).status).toBe(200);
    expect((await request(app).post('/api/health')).status).toBe(403);
    expect((await request(app).get('/api/health-check')).status).toBe(403);
  });
});
