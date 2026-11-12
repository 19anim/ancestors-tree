import { describe, expect, it } from 'vitest';
import {
  clearGoogleStateCookie,
  clearSessionCookies,
  googleStateCookie,
  sessionCookies,
} from './cookies.ts';

describe('session cookies', () => {
  it('scopes the access cookie to /api and the refresh cookie to /api/auth', () => {
    const [access, refresh] = sessionCookies({
      accessToken: 'a',
      refreshToken: 'r',
      secure: true,
    });
    expect(access).toEqual({
      name: 'at',
      value: 'a',
      options: { httpOnly: true, sameSite: 'lax', secure: true, path: '/api', maxAge: 900_000 },
    });
    expect(refresh).toMatchObject({
      name: 'rt',
      value: 'r',
      options: { httpOnly: true, sameSite: 'lax', secure: true, path: '/api/auth' },
    });
    expect(refresh?.options.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('clears both cookies on the same paths', () => {
    expect(clearSessionCookies(false)).toEqual([
      {
        name: 'at',
        clear: true,
        options: { httpOnly: true, sameSite: 'lax', secure: false, path: '/api' },
      },
      {
        name: 'rt',
        clear: true,
        options: { httpOnly: true, sameSite: 'lax', secure: false, path: '/api/auth' },
      },
    ]);
  });

  it('keeps the Google state for 10 minutes on the Google routes only', () => {
    expect(googleStateCookie('s', false)).toEqual({
      name: 'g_state',
      value: 's',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/api/auth/google',
        maxAge: 600_000,
      },
    });
    expect(clearGoogleStateCookie(false)).toMatchObject({ name: 'g_state', clear: true });
  });
});
