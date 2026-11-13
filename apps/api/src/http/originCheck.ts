import type { RequestHandler } from 'express';
import { AppError } from './AppError.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Blocks cross-site writes, on top of SameSite=Lax cookies (spec §12). Browsers always send
 * `Origin` on a cross-site POST/PUT/PATCH/DELETE, so a write from any origin other than the web
 * app is rejected. Requests without `Origin` (curl, server-to-server) are not browser requests
 * and carry no cookies by accident.
 */
export function createOriginCheck(appOrigin: string): RequestHandler {
  return (req, _res, next) => {
    const origin = req.get('origin');
    if (SAFE_METHODS.has(req.method) || origin === undefined || origin === appOrigin) {
      next();
      return;
    }
    next(new AppError('FORBIDDEN', 'Cross-site request blocked'));
  };
}
