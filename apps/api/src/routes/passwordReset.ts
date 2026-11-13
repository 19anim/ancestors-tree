import {
  CurrentUserSchema,
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
} from '@ancestors-tree/shared';
import { REFRESH_COOKIE } from '../auth/cookieNames.ts';
import { readCookie } from '../auth/cookies.ts';
import type { Logger } from 'pino';
import type { PasswordResets } from '../auth/passwordResets.ts';
import type { AuthService } from '../auth/service.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';

interface PasswordResetRouteDeps {
  auth: AuthService;
  resets: PasswordResets;
  logger: Logger;
}

export function registerPasswordResetRoutes(
  api: RouteRegistry,
  deps: PasswordResetRouteDeps,
): void {
  api.define({
    method: 'post',
    path: '/auth/forgot-password',
    summary: 'Email a password reset link',
    tags: ['Auth'],
    access: 'public',
    request: { body: ForgotPasswordRequestSchema },
    responses: { 204: { description: 'Always, whether or not the email has an account' } },
    handler: ({ body }) => {
      // Not awaited: neither the answer nor its timing may reveal whether the email has an account.
      void deps.resets.request(body.email).catch((error: unknown) => {
        deps.logger.error({ errorName: (error as Error).name }, 'Password reset email failed');
      });
      return { status: 204 };
    },
  });

  api.define({
    method: 'post',
    path: '/auth/reset-password',
    summary: 'Choose a new password with the emailed link, and sign in',
    tags: ['Auth'],
    access: 'public',
    request: { body: ResetPasswordRequestSchema },
    responses: {
      200: {
        description: 'Password changed; signed in on this device only',
        schema: CurrentUserSchema,
      },
    },
    handler: async ({ body, req }) => {
      const user = await deps.resets.reset(body.token, body.password);
      const signedIn = await deps.auth.signIn(user, readCookie(req, REFRESH_COOKIE));
      return { status: 200, body: signedIn.user, cookies: signedIn.cookies };
    },
  });
}
