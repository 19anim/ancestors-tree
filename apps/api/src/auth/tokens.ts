import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ISSUER = 'ancestors-tree-api';
const AUDIENCE = 'ancestors-tree-web';

/** `bytes` random bytes as URL-safe base64 (24 bytes → 32 characters, 32 → 43). */
export function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

/** Refresh and reset tokens are stored only as this hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface AccessTokens {
  sign(userId: string): Promise<string>;
  /** The user id, or undefined for a missing, expired, forged or malformed token. */
  verify(token: string | undefined): Promise<string | undefined>;
}

export function createAccessTokens(secret: string): AccessTokens {
  const key = new TextEncoder().encode(secret);
  return {
    sign: (userId) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
        .sign(key),
    async verify(token) {
      if (!token) return undefined;
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          issuer: ISSUER,
          audience: AUDIENCE,
        });
        return typeof payload.sub === 'string' ? payload.sub : undefined;
      } catch {
        return undefined;
      }
    },
  };
}
