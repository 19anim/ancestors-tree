import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { Session } from '../models/Session.ts';
import { useTestDatabase } from '../test/database.ts';
import {
  CONCURRENT_REFRESH_WINDOW_MS,
  REFRESH_TOKEN_TTL_MS,
  revokeAllSessions,
  revokeFamily,
  revokeSessionOf,
  rotateSession,
  startSession,
} from './sessions.ts';
import { hashToken } from './tokens.ts';

useTestDatabase();

const userId = () => new Types.ObjectId().toString();
const later = (date: Date, ms: number) => new Date(date.getTime() + ms);

describe('refresh sessions', () => {
  it('stores only the hash of the token', async () => {
    const token = await startSession(userId());
    const stored = await Session.findOne();
    expect(stored?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('rotates a token into a new one for the same user', async () => {
    const user = userId();
    const first = await startSession(user);
    const result = await rotateSession(first);
    expect(result).toMatchObject({ kind: 'rotated', userId: user });
    if (result.kind !== 'rotated') throw new Error('expected rotation');
    expect(result.token).not.toBe(first);
    expect(await rotateSession(result.token)).toMatchObject({ kind: 'rotated', userId: user });
  });

  it('treats a second use within 10 seconds as another tab refreshing', async () => {
    const now = new Date();
    const token = await startSession(userId(), now);
    await rotateSession(token, now);
    const again = await rotateSession(token, later(now, CONCURRENT_REFRESH_WINDOW_MS - 1));
    expect(again.kind).toBe('concurrent');
  });

  it('revokes the whole family when an old token comes back later', async () => {
    const now = new Date();
    const token = await startSession(userId(), now);
    const rotated = await rotateSession(token, now);
    if (rotated.kind !== 'rotated') throw new Error('expected rotation');

    const replay = await rotateSession(token, later(now, CONCURRENT_REFRESH_WINDOW_MS + 1));
    expect(replay.kind).toBe('invalid');
    // The token the legitimate client holds is now dead too.
    expect((await rotateSession(rotated.token, later(now, 20_000))).kind).toBe('invalid');
  });

  it('rejects unknown and expired tokens', async () => {
    expect((await rotateSession('unknown-token')).kind).toBe('invalid');
    const now = new Date();
    const token = await startSession(userId(), now);
    expect((await rotateSession(token, later(now, REFRESH_TOKEN_TTL_MS + 1))).kind).toBe('invalid');
  });

  it('signs out one sign-in, or every sign-in of a user', async () => {
    const user = userId();
    const phone = await startSession(user);
    const laptop = await startSession(user);
    await revokeSessionOf(phone);
    expect((await rotateSession(phone)).kind).toBe('invalid');
    expect((await rotateSession(laptop)).kind).toBe('rotated');

    const tablet = await startSession(user);
    await revokeAllSessions(user);
    expect((await rotateSession(tablet)).kind).toBe('invalid');
  });
});

describe('rotation racing a revoke', () => {
  it('ends the new token when the family was revoked after the old one was claimed', async () => {
    const token = await startSession(userId());
    const family = (await Session.findOne())?.familyId ?? '';
    // The revoke lands between claiming the old token and storing the new one.
    const create = Session.create.bind(Session) as (...args: unknown[]) => Promise<unknown>;
    const spy = vi.spyOn(Session, 'create').mockImplementationOnce((async (...args: unknown[]) => {
      await revokeFamily(family);
      return create(...args);
    }) as never);
    try {
      expect(await rotateSession(token)).toEqual({ kind: 'invalid' });
    } finally {
      spy.mockRestore();
    }
    expect(await Session.countDocuments({ familyId: family, revokedAt: null })).toBe(0);
    expect(await Session.countDocuments({ familyId: family })).toBe(2);
  });
});
