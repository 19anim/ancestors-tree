import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessTokens, hashToken, randomToken } from './tokens.ts';

const SECRET = 'test-only-secret-with-at-least-32-chars';

afterEach(() => {
  vi.useRealTimers();
});

describe('randomToken and hashToken', () => {
  it('makes URL-safe tokens of the expected length', () => {
    expect(randomToken(24)).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(randomToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(24)).not.toBe(randomToken(24));
  });

  it('hashes tokens with SHA-256', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('access tokens', () => {
  const tokens = createAccessTokens(SECRET);

  it('round-trips the user id', async () => {
    const token = await tokens.sign('64b7f0c2a1b2c3d4e5f60718');
    expect(await tokens.verify(token)).toBe('64b7f0c2a1b2c3d4e5f60718');
  });

  it('rejects missing, malformed and foreign tokens', async () => {
    expect(await tokens.verify(undefined)).toBeUndefined();
    expect(await tokens.verify('not-a-jwt')).toBeUndefined();
    const foreign = await createAccessTokens('another-secret-with-at-least-32-chars').sign('u1');
    expect(await tokens.verify(foreign)).toBeUndefined();
  });

  it('expires after 15 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const token = await tokens.sign('u1');
    vi.setSystemTime(Date.now() + 14 * 60_000);
    expect(await tokens.verify(token)).toBe('u1');
    vi.setSystemTime(Date.now() + 2 * 60_000);
    expect(await tokens.verify(token)).toBeUndefined();
  });
});
