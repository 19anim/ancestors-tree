import { randomUUID } from 'node:crypto';
import { Session } from '../models/Session.ts';
import { hashToken, randomToken } from './tokens.ts';

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Two tabs refreshing at once send the same token; the second one is not an attack. */
export const CONCURRENT_REFRESH_WINDOW_MS = 10_000;

export type RotateResult =
  | { kind: 'rotated'; userId: string; token: string }
  | { kind: 'concurrent'; userId: string }
  | { kind: 'invalid' };

async function issue(userId: string, familyId: string, now: Date): Promise<string> {
  const token = randomToken(32);
  await Session.create({
    userId,
    familyId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
  });
  return token;
}

/** A new sign-in: a new family and its first refresh token. */
export function startSession(userId: string, now = new Date()): Promise<string> {
  return issue(userId, randomUUID(), now);
}

export async function rotateSession(token: string, now = new Date()): Promise<RotateResult> {
  const tokenHash = hashToken(token);
  // Claim the token atomically: only one request can rotate it.
  const claimed = await Session.findOneAndUpdate(
    { tokenHash, usedAt: null, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
  );
  if (claimed) {
    const userId = claimed.userId.toString();
    return { kind: 'rotated', userId, token: await issue(userId, claimed.familyId, now) };
  }

  const session = await Session.findOne({ tokenHash });
  if (!session || session.revokedAt || session.expiresAt <= now || !session.usedAt) {
    return { kind: 'invalid' };
  }
  if (now.getTime() - session.usedAt.getTime() <= CONCURRENT_REFRESH_WINDOW_MS) {
    return { kind: 'concurrent', userId: session.userId.toString() };
  }
  // An already-used token came back much later: it may have been stolen.
  await revokeFamily(session.familyId, now);
  return { kind: 'invalid' };
}

export async function revokeFamily(familyId: string, now = new Date()): Promise<void> {
  await Session.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: now } });
}

/** Sign-out: revokes the family of this token. Unknown tokens are ignored. */
export async function revokeSessionOf(token: string, now = new Date()): Promise<void> {
  const session = await Session.findOne({ tokenHash: hashToken(token) });
  if (session) await revokeFamily(session.familyId, now);
}

/** Signs a user out everywhere (password reset, account take-over defence). */
export async function revokeAllSessions(userId: string, now = new Date()): Promise<void> {
  await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: now } });
}
