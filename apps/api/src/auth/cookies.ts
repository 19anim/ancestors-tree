import type { CookieOptions, Request } from 'express';
import type { CookieInstruction } from '../http/routeRegistry.ts';
import { ACCESS_COOKIE, GOOGLE_STATE_COOKIE, REFRESH_COOKIE } from './cookieNames.ts';
import { REFRESH_TOKEN_TTL_MS } from './sessions.ts';
import { ACCESS_TOKEN_TTL_SECONDS } from './tokens.ts';

export const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;

function baseOptions(secure: boolean, path: string): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path };
}

export function readCookie(req: Request, name: string): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function sessionCookies(input: {
  accessToken: string;
  refreshToken: string;
  secure: boolean;
}): CookieInstruction[] {
  return [
    {
      name: ACCESS_COOKIE,
      value: input.accessToken,
      options: { ...baseOptions(input.secure, '/api'), maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000 },
    },
    {
      name: REFRESH_COOKIE,
      value: input.refreshToken,
      options: { ...baseOptions(input.secure, '/api/auth'), maxAge: REFRESH_TOKEN_TTL_MS },
    },
  ];
}

export function clearSessionCookies(secure: boolean): CookieInstruction[] {
  return [
    { name: ACCESS_COOKIE, clear: true, options: baseOptions(secure, '/api') },
    { name: REFRESH_COOKIE, clear: true, options: baseOptions(secure, '/api/auth') },
  ];
}

export function googleStateCookie(value: string, secure: boolean): CookieInstruction {
  return {
    name: GOOGLE_STATE_COOKIE,
    value,
    options: { ...baseOptions(secure, '/api/auth/google'), maxAge: GOOGLE_STATE_TTL_MS },
  };
}

export function clearGoogleStateCookie(secure: boolean): CookieInstruction {
  return {
    name: GOOGLE_STATE_COOKIE,
    clear: true,
    options: baseOptions(secure, '/api/auth/google'),
  };
}
