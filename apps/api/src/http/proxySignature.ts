import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { AppError } from './AppError.ts';
import { maskUrl } from './logSerializers.ts';

/** Netlify's signed proxy adds it to every request it forwards (netlify.toml `signed`). */
export const PROXY_SIGNATURE_HEADER = 'x-nf-sign';

/**
 * How long after `exp` a token still counts. Netlify does not document the token's lifetime, and
 * Render can hold a request while the instance starts for as long as Netlify waits (26 s), so
 * 30 s covers that hold plus a few seconds of clock drift between the two hosts.
 */
export const CLOCK_SKEW_SECONDS = 30;

export type ProxySignatureFailure =
  'missing' | 'malformed' | 'algorithm' | 'signature' | 'issuer' | 'expired';

export type ProxySignatureResult =
  { ok: true } | { ok: false; reason: ProxySignatureFailure; secondsPastExp?: number };

function decodeObject(part: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Checks Netlify's x-nf-sign token (a compact JWS, HMAC SHA-256) with node:crypto only
 * (spec §12): HS256, a signature made with the shared secret, `iss` "netlify" and an `exp` that
 * has not passed (with CLOCK_SKEW_SECONDS of slack).
 */
export function verifyProxySignature(
  token: string | undefined,
  secret: string,
  nowSeconds: number,
): ProxySignatureResult {
  if (token === undefined || token === '') return { ok: false, reason: 'missing' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [headerPart = '', payloadPart = '', signaturePart = ''] = parts;

  const header = decodeObject(headerPart);
  if (header === undefined) return { ok: false, reason: 'malformed' };
  // Only HS256: the token never chooses the algorithm (no "none", no algorithm confusion).
  if (header.alg !== 'HS256') return { ok: false, reason: 'algorithm' };

  const expected = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest();
  const given = Buffer.from(signaturePart, 'base64url');
  // Buffer.from skips characters outside base64url, so the text must survive a round trip.
  if (
    given.toString('base64url') !== signaturePart ||
    given.length !== expected.length ||
    !timingSafeEqual(given, expected)
  ) {
    return { ok: false, reason: 'signature' };
  }

  const payload = decodeObject(payloadPart);
  if (payload === undefined || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.iss !== 'netlify') return { ok: false, reason: 'issuer' };
  if (nowSeconds > payload.exp + CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'expired', secondsPastExp: Math.round(nowSeconds - payload.exp) };
  }
  return { ok: true };
}

/** Render's health check and the uptime monitor call it without going through Netlify. */
function isHealthCheck(method: string, path: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  // Express routes ignore case and a trailing slash, so the exemption must too.
  return path.toLowerCase().replace(/\/+$/, '') === '/api/health';
}

export interface ProxySignatureCheckOptions {
  /** PROXY_SIGNATURE_SECRET, the same value as on Netlify. */
  secret: string;
  logger: Logger;
  /** Milliseconds since the epoch; tests pass a fixed clock. */
  now?: () => number;
}

/**
 * Refuses every request that did not come through Netlify's signed proxy, except the health
 * check (spec §12). Nobody can then call the Render URL directly with a forged
 * X-Forwarded-For, so the per-IP limits hold.
 */
export function createProxySignatureCheck({
  secret,
  logger,
  now = Date.now,
}: ProxySignatureCheckOptions): RequestHandler {
  return (req, _res, next) => {
    if (isHealthCheck(req.method, req.path)) {
      next();
      return;
    }
    const result = verifyProxySignature(
      req.get(PROXY_SIGNATURE_HEADER),
      secret,
      Math.floor(now() / 1000),
    );
    if (result.ok) {
      next();
      return;
    }
    // The reason only: never the header (a credential until it expires) or the secret.
    logger.warn(
      {
        reason: result.reason,
        ...(result.secondsPastExp === undefined ? {} : { secondsPastExp: result.secondsPastExp }),
        method: req.method,
        path: maskUrl(req.path),
        clientIp: req.ip,
      },
      'Refused a request that did not come through the Netlify proxy',
    );
    next(new AppError('FORBIDDEN', 'Requests must come through the web app'));
  };
}
