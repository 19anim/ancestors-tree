import {
  ApiErrorBodySchema,
  CurrentUserSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
} from '@ancestors-tree/shared';
import { REFRESH_COOKIE } from '../auth/cookieNames.ts';
import { readCookie } from '../auth/cookies.ts';
import type { AuthService } from '../auth/service.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';

export function registerAuthRoutes(api: RouteRegistry, deps: { auth: AuthService }): void {
  api.define({
    method: 'post',
    path: '/auth/register',
    summary: 'Create an account with email and password, and sign in',
    tags: ['Auth'],
    access: 'public',
    request: { body: RegisterRequestSchema },
    responses: {
      201: { description: 'Signed in; session cookies set', schema: CurrentUserSchema },
    },
    handler: async ({ body, req }) => {
      const { user, cookies } = await deps.auth.register(body, readCookie(req, REFRESH_COOKIE));
      return { status: 201, body: user, cookies };
    },
  });

  api.define({
    method: 'post',
    path: '/auth/login',
    summary: 'Sign in with email and password',
    tags: ['Auth'],
    access: 'public',
    request: { body: LoginRequestSchema },
    responses: {
      200: { description: 'Signed in; session cookies set', schema: CurrentUserSchema },
    },
    handler: async ({ body, req }) => {
      const { user, cookies } = await deps.auth.login(body, readCookie(req, REFRESH_COOKIE));
      return { status: 200, body: user, cookies };
    },
  });

  api.define({
    method: 'post',
    path: '/auth/refresh',
    summary: 'Renew the session cookies with the refresh cookie',
    tags: ['Auth'],
    access: 'public',
    responses: {
      204: { description: 'New cookies set (none when another tab renewed them a moment ago)' },
      401: { description: 'No valid session; cookies cleared', schema: ApiErrorBodySchema },
    },
    handler: async ({ req }) => {
      const outcome = await deps.auth.refresh(readCookie(req, REFRESH_COOKIE));
      if (outcome.kind === 'rotated') return { status: 204, cookies: outcome.cookies };
      if (outcome.kind === 'concurrent') return { status: 204 };
      return {
        status: 401,
        body: {
          error: { code: 'UNAUTHENTICATED' as const, message: 'Session expired. Sign in again.' },
        },
        cookies: outcome.cookies,
      };
    },
  });

  api.define({
    method: 'post',
    path: '/auth/logout',
    summary: 'Sign out this device',
    tags: ['Auth'],
    access: 'public',
    responses: { 204: { description: 'Signed out; cookies cleared' } },
    handler: async ({ req }) => ({
      status: 204,
      cookies: await deps.auth.logout(readCookie(req, REFRESH_COOKIE)),
    }),
  });
}
