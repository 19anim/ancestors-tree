import type { RequestHandler } from 'express';
import { AppError } from '../http/AppError.ts';
import { getLocals } from '../http/locals.ts';
import { ACCESS_COOKIE } from './cookieNames.ts';
import { readCookie } from './cookies.ts';
import type { AccessTokens } from './tokens.ts';

/** The `signedIn` access level: a valid access cookie, else 401 (the web app then refreshes). */
export function createRequireAuth(tokens: AccessTokens): RequestHandler {
  return async (req, res, next) => {
    const userId = await tokens.verify(readCookie(req, ACCESS_COOKIE));
    if (!userId) throw new AppError('UNAUTHENTICATED', 'Sign in to continue');
    getLocals(res).userId = userId;
    next();
  };
}
