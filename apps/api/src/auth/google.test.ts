import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { codeChallengeFor, createGoogleOAuthClient } from './google.ts';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const REDIRECT_URI = 'http://localhost:5173/api/auth/google/callback';

async function signingSetup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256' };
  return { privateKey, keys: createLocalJWKSet({ keys: [jwk] }) };
}

async function idToken(
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
  audience = CLIENT_ID,
  { issuer = 'https://accounts.google.com', expiresAt = '5m' as string | number } = {},
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject('google-123')
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(privateKey);
}

describe('Google OAuth client', () => {
  it('computes the PKCE S256 challenge (RFC 7636 appendix B)', () => {
    expect(codeChallengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('builds the authorization URL with state, nonce and PKCE', () => {
    const client = createGoogleOAuthClient({ clientId: CLIENT_ID, clientSecret: 'test-secret' });
    const url = new URL(
      client.authorizationUrl({
        state: 'st',
        nonce: 'no',
        codeChallenge: 'ch',
        redirectUri: REDIRECT_URI,
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state: 'st',
      nonce: 'no',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
  });

  it('exchanges the code and verifies the ID token', async () => {
    const { privateKey, keys } = await signingSetup();
    const token = await idToken(privateKey, {
      email: 'Lan@Gmail.example',
      email_verified: true,
      name: 'Nguyễn Thị Lan',
      nonce: 'no',
    });
    const fetchMock = vi.fn(async () => Response.json({ id_token: token }));
    const client = createGoogleOAuthClient({
      clientId: CLIENT_ID,
      clientSecret: 'test-secret',
      fetch: fetchMock,
      keys,
    });

    const profile = await client.exchangeCode({
      code: 'code-1',
      codeVerifier: 'verifier-1',
      redirectUri: REDIRECT_URI,
      nonce: 'no',
    });
    expect(profile).toEqual({
      googleId: 'google-123',
      email: 'lan@gmail.example',
      emailVerified: true,
      name: 'Nguyễn Thị Lan',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(init.body as URLSearchParams);
    expect(body.get('code_verifier')).toBe('verifier-1');
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('rejects a wrong nonce, a wrong audience and a failed exchange', async () => {
    const { privateKey, keys } = await signingSetup();
    const input = { code: 'c', codeVerifier: 'v', redirectUri: REDIRECT_URI, nonce: 'expected' };
    const clientWith = (response: Response) =>
      createGoogleOAuthClient({
        clientId: CLIENT_ID,
        clientSecret: 'test-secret',
        fetch: async () => response,
        keys,
      });

    const wrongNonce = await idToken(privateKey, { email: 'a@b.example', nonce: 'other' });
    await expect(
      clientWith(Response.json({ id_token: wrongNonce })).exchangeCode(input),
    ).rejects.toThrow(/nonce/);
    const wrongAudience = await idToken(
      privateKey,
      { email: 'a@b.example', nonce: 'expected' },
      'other',
    );
    await expect(
      clientWith(Response.json({ id_token: wrongAudience })).exchangeCode(input),
    ).rejects.toThrow(/aud/);
    await expect(
      clientWith(new Response('denied', { status: 400 })).exchangeCode(input),
    ).rejects.toThrow(/400/);
  });

  describe('ID token checks', () => {
    const input = { code: 'c', codeVerifier: 'v', redirectUri: REDIRECT_URI, nonce: 'expected' };
    const claims = { email: 'a@b.example', email_verified: true, nonce: 'expected' };
    const exchange = async (
      token: string,
      keys: Awaited<ReturnType<typeof signingSetup>>['keys'],
    ) =>
      createGoogleOAuthClient({
        clientId: CLIENT_ID,
        clientSecret: 'test-secret',
        fetch: async () => Response.json({ id_token: token }),
        keys,
      }).exchangeCode(input);

    it('rejects a token signed with a different key', async () => {
      const trusted = await signingSetup();
      const attacker = await signingSetup();
      const forged = await idToken(attacker.privateKey, claims);
      await expect(exchange(forged, trusted.keys)).rejects.toThrow(/signature/);
    });

    it('rejects an expired token', async () => {
      const { privateKey, keys } = await signingSetup();
      const expired = await idToken(privateKey, claims, CLIENT_ID, {
        expiresAt: Math.floor(Date.now() / 1000) - 60,
      });
      await expect(exchange(expired, keys)).rejects.toThrow(/exp/);
    });

    it('rejects a wrong issuer and accepts the bare accounts.google.com one', async () => {
      const { privateKey, keys } = await signingSetup();
      const wrong = await idToken(privateKey, claims, CLIENT_ID, {
        issuer: 'https://evil.example.test',
      });
      await expect(exchange(wrong, keys)).rejects.toThrow(/iss/);
      const bare = await idToken(privateKey, claims, CLIENT_ID, { issuer: 'accounts.google.com' });
      await expect(exchange(bare, keys)).resolves.toMatchObject({ googleId: 'google-123' });
    });

    it('rejects a missing or wrong nonce', async () => {
      const { privateKey, keys } = await signingSetup();
      const missing = await idToken(privateKey, { email: 'a@b.example' });
      await expect(exchange(missing, keys)).rejects.toThrow(/nonce/);
      const wrong = await idToken(privateKey, { ...claims, nonce: 'other' });
      await expect(exchange(wrong, keys)).rejects.toThrow(/nonce/);
    });

    it('reports an unverified or missing email_verified claim as unverified', async () => {
      const { privateKey, keys } = await signingSetup();
      const unverified = await idToken(privateKey, { ...claims, email_verified: false });
      expect((await exchange(unverified, keys)).emailVerified).toBe(false);
      const missing = await idToken(privateKey, { email: 'a@b.example', nonce: 'expected' });
      expect((await exchange(missing, keys)).emailVerified).toBe(false);
    });
  });
});
