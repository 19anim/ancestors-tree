import { AuthProvidersSchema, ReturnToSchema } from '@ancestors-tree/shared';
import type { Logger } from 'pino';
import { z } from 'zod';
import { GOOGLE_STATE_COOKIE } from '../auth/cookieNames.ts';
import { clearGoogleStateCookie, googleStateCookie, readCookie } from '../auth/cookies.ts';
import { codeChallengeFor, type GoogleOAuthClient } from '../auth/google.ts';
import type { AuthService } from '../auth/service.ts';
import { randomToken } from '../auth/tokens.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';

const DEFAULT_RETURN_TO = '/clans';
const FAILURE_REDIRECT = '/login?error=google';

/** What the g_state cookie remembers between /start and /callback. */
const GoogleStateSchema = z.object({
  state: z.string(),
  nonce: z.string(),
  verifier: z.string(),
  returnTo: ReturnToSchema,
});
type GoogleState = z.infer<typeof GoogleStateSchema>;

function encodeState(value: GoogleState): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeState(raw: string | undefined): GoogleState | undefined {
  if (!raw) return undefined;
  try {
    const parsed = GoogleStateSchema.safeParse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

interface GoogleRouteDeps {
  google: GoogleOAuthClient | undefined;
  auth: AuthService;
  appOrigin: string;
  secureCookies: boolean;
  logger: Logger;
}

export function registerGoogleRoutes(api: RouteRegistry, deps: GoogleRouteDeps): void {
  // Through the web origin: the Netlify proxy (production) or the Vite proxy (development).
  const redirectUri = `${deps.appOrigin}/api/auth/google/callback`;

  api.define({
    method: 'get',
    path: '/auth/providers',
    summary: 'Which sign-in methods besides email and password are available',
    tags: ['Auth'],
    access: 'public',
    responses: { 200: { description: 'Available providers', schema: AuthProvidersSchema } },
    handler: () => ({ status: 200, body: { google: deps.google !== undefined } }),
  });

  api.define({
    method: 'get',
    path: '/auth/google/start',
    summary: 'Start Google sign-in (the browser navigates here)',
    tags: ['Auth'],
    access: 'public',
    request: { query: z.object({ returnTo: ReturnToSchema.optional() }) },
    responses: {
      302: {
        description: 'To Google, or back to /login when Google sign-in is off',
        redirect: true,
      },
    },
    handler: ({ query }) => {
      if (!deps.google) return { status: 302, redirect: FAILURE_REDIRECT };
      const saved: GoogleState = {
        state: randomToken(16),
        nonce: randomToken(16),
        verifier: randomToken(32),
        returnTo: query.returnTo ?? DEFAULT_RETURN_TO,
      };
      return {
        status: 302,
        redirect: deps.google.authorizationUrl({
          state: saved.state,
          nonce: saved.nonce,
          codeChallenge: codeChallengeFor(saved.verifier),
          redirectUri,
        }),
        cookies: [googleStateCookie(encodeState(saved), deps.secureCookies)],
      };
    },
  });

  api.define({
    method: 'get',
    path: '/auth/google/callback',
    summary: 'Google sends the browser back here',
    tags: ['Auth'],
    access: 'public',
    request: {
      query: z.object({
        code: z.string().max(2048).optional(),
        state: z.string().max(256).optional(),
        error: z.string().max(256).optional(),
      }),
    },
    responses: {
      302: {
        description: 'Signed in and back in the app, or to /login?error=google',
        redirect: true,
      },
    },
    handler: async ({ query, req }) => {
      const clearState = clearGoogleStateCookie(deps.secureCookies);
      const failure = { status: 302 as const, redirect: FAILURE_REDIRECT, cookies: [clearState] };
      const saved = decodeState(readCookie(req, GOOGLE_STATE_COOKIE));
      if (!deps.google || !saved || !query.code || query.error || query.state !== saved.state) {
        return failure;
      }
      try {
        const profile = await deps.google.exchangeCode({
          code: query.code,
          codeVerifier: saved.verifier,
          redirectUri,
          nonce: saved.nonce,
        });
        const { cookies } = await deps.auth.signInWithGoogle(profile);
        return { status: 302, redirect: saved.returnTo, cookies: [clearState, ...cookies] };
      } catch (error) {
        deps.logger.warn({ errorName: (error as Error).name }, 'Google sign-in failed');
        return failure;
      }
    },
  });
}
