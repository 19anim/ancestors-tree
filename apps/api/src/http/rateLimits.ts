import { createHash } from 'node:crypto';
import { EmailSchema } from '@ancestors-tree/shared';
import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError } from './AppError.ts';
import { getLocals } from './locals.ts';

const ONE_MINUTE_MS = 60_000;

/** Sign-in and account-recovery endpoints, limited per IP (spec §12). */
export const AUTH_RATE_LIMITED_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

/** Per IP and per endpoint, so a few wrong passwords do not also block a password reset. */
export function createAuthRateLimit(limit: number): RequestHandler {
  return rateLimit({
    windowMs: ONE_MINUTE_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // ipKeyGenerator groups IPv6 addresses by /56, so one client cannot rotate addresses.
    // Lower-cased: Express routing ignores case, so /LOGIN must share the /login budget.
    keyGenerator: (req) => `${req.baseUrl.toLowerCase()} ${ipKeyGenerator(req.ip ?? '')}`,
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMITED', 'Too many attempts. Wait a minute and try again.'));
    },
  });
}

/** Per signed-in user; runs after requireAuth, which sets res.locals.userId. */
export function createUserRateLimit(limit: number): RequestHandler {
  return rateLimit({
    windowMs: ONE_MINUTE_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req, res) => getLocals(res).userId ?? ipKeyGenerator(req.ip ?? ''),
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMITED', 'Too many requests. Wait a minute and try again.'));
    },
  });
}

const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS;

/**
 * The key for a login request: a hash of the normalized email, or undefined when the body has
 * no valid email (the route answers 400). Bounded, so the store cannot grow with attacker input.
 */
function loginEmailKey(req: { body?: unknown }): string | undefined {
  const email = EmailSchema.safeParse((req.body as { email?: unknown } | undefined)?.email);
  return email.success ? createHash('sha256').update(email.data).digest('hex') : undefined;
}

/**
 * Per account, on top of the per-IP limit: guessing one password from many addresses still
 * runs out of attempts. Must run after the body is parsed. In memory: one API instance.
 */
export function createLoginEmailRateLimit(limit: number): RequestHandler {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Successful sign-ins do not use up the budget; only failures count.
    skipSuccessfulRequests: true,
    skip: (req) => loginEmailKey(req) === undefined,
    keyGenerator: (req) => loginEmailKey(req) ?? '',
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMITED', 'Too many attempts. Please try again later.'));
    },
  });
}
