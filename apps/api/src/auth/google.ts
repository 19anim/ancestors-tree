import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const MAX_NAME_LENGTH = 80;

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export interface GoogleOAuthClient {
  authorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;
  /** Exchanges the code; verifies the ID token's signature, issuer, audience, expiry and nonce. */
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    nonce: string;
  }): Promise<GoogleProfile>;
}

/** PKCE S256 challenge for a code verifier (RFC 7636). */
export function codeChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

const TokenResponseSchema = z.object({ id_token: z.string() });
const IdTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(3),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  nonce: z.string().optional(),
});

export interface GoogleClientOptions {
  clientId: string;
  clientSecret: string;
  /** Injected in tests. */
  fetch?: typeof fetch;
  /** Injected in tests; Google's published keys otherwise. */
  keys?: JWTVerifyGetKey;
}

export function createGoogleOAuthClient(options: GoogleClientOptions): GoogleOAuthClient {
  const fetchImpl = options.fetch ?? fetch;
  const keys = options.keys ?? createRemoteJWKSet(new URL(CERTS_URL));

  return {
    authorizationUrl({ state, nonce, codeChallenge, redirectUri }) {
      const url = new URL(AUTHORIZE_URL);
      url.search = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      return url.toString();
    },

    async exchangeCode({ code, codeVerifier, redirectUri, nonce }) {
      const response = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          code_verifier: codeVerifier,
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Google token endpoint answered ${response.status}`);
      const { id_token: idToken } = TokenResponseSchema.parse(await response.json());
      const { payload } = await jwtVerify(idToken, keys, {
        algorithms: ['RS256'],
        issuer: ISSUERS,
        audience: options.clientId,
      });
      const claims = IdTokenClaimsSchema.parse(payload);
      if (claims.nonce !== nonce) throw new Error('Google ID token nonce mismatch');
      const email = claims.email.trim().toLowerCase();
      const name = claims.name?.trim();
      return {
        googleId: claims.sub,
        email,
        emailVerified: claims.email_verified === true,
        name: (name ? name : (email.split('@')[0] ?? email)).slice(0, MAX_NAME_LENGTH),
      };
    },
  };
}
