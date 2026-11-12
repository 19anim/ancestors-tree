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
    keyGenerator: (req) => `${req.baseUrl} ${ipKeyGenerator(req.ip ?? '')}`,
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
