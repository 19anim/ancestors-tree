import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { User } from '../models/User.ts';
import { createTestApp, TEST_ORIGIN } from '../test/app.ts';
import { useTestDatabase } from '../test/database.ts';
import { createFakeGoogle } from '../test/fakeGoogle.ts';
import { setCookies, signUp, TEST_PASSWORD } from '../test/users.ts';

useTestDatabase();

const google = createFakeGoogle();
const { app } = createTestApp({ google });

const PROFILE = {
  googleId: 'google-1',
  email: 'lan@gmail.example',
  emailVerified: true,
  name: 'Nguyễn Thị Lan',
};

beforeEach(() => {
  google.profiles.clear();
  google.profiles.set('code-1', PROFILE);
});

/** Runs start → callback with one agent, as the browser would. */
async function signInWithGoogle(returnTo?: string) {
  const agent = request.agent(app);
  const start = await agent.get('/api/auth/google/start').query(returnTo ? { returnTo } : {});
  const state = google.lastAuthorization?.state;
  const callback = await agent.get('/api/auth/google/callback').query({ code: 'code-1', state });
  return { agent, start, callback };
}

describe('Google sign-in', () => {
  it('reports whether Google sign-in is configured', async () => {
    expect((await request(app).get('/api/auth/providers')).body).toEqual({ google: true });
    const without = createTestApp().app;
    expect((await request(without).get('/api/auth/providers')).body).toEqual({ google: false });
    const start = await request(without).get('/api/auth/google/start');
    expect(start.headers.location).toBe('/login?error=google');
  });

  it('redirects to Google with a short-lived state cookie', async () => {
    const response = await request(app).get('/api/auth/google/start');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      `https://accounts.google.test/auth?state=${google.lastAuthorization?.state}`,
    );
    expect(google.lastAuthorization?.redirectUri).toBe(`${TEST_ORIGIN}/api/auth/google/callback`);
    expect(setCookies(response).get('g_state')).toMatch(
      /Max-Age=600;.*Path=\/api\/auth\/google;.*HttpOnly.*SameSite=Lax/,
    );
  });

  it('creates a verified account, signs in and returns to the requested page', async () => {
    const { agent, callback } = await signInWithGoogle('/clans/abc');
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/clans/abc');
    const cookies = setCookies(callback);
    expect(cookies.has('at')).toBe(true);
    expect(cookies.get('g_state')).toMatch(/^g_state=;/);

    const me = await agent.get('/api/me');
    expect(me.body).toMatchObject({
      email: 'lan@gmail.example',
      hasGoogle: true,
      hasPassword: false,
    });
    expect((await User.findOne({ email: 'lan@gmail.example' }))?.emailVerifiedAt).toBeInstanceOf(
      Date,
    );
  });

  it('goes to the clans page by default and refuses outside return paths', async () => {
    expect((await signInWithGoogle()).callback.headers.location).toBe('/clans');
    const outside = await request(app)
      .get('/api/auth/google/start')
      .query({ returnTo: 'https://evil.example.test' });
    expect(outside.status).toBe(400);
  });

  it('fails safely on a wrong state, a missing state cookie or an unverified email', async () => {
    const agent = request.agent(app);
    await agent.get('/api/auth/google/start');
    const wrongState = await agent
      .get('/api/auth/google/callback')
      .query({ code: 'code-1', state: 'forged' });
    const noCookie = await request(app)
      .get('/api/auth/google/callback')
      .query({ code: 'code-1', state: google.lastAuthorization?.state });
    google.profiles.set('code-1', { ...PROFILE, emailVerified: false });
    const unverified = (await signInWithGoogle()).callback;
    const cancelled = await request(app)
      .get('/api/auth/google/callback')
      .query({ error: 'access_denied' });

    for (const response of [wrongState, noCookie, unverified, cancelled]) {
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login?error=google');
      expect(setCookies(response).has('at')).toBe(false);
    }
  });

  it('links to a verified account and keeps its password', async () => {
    await signUp(app, { email: 'lan@gmail.example' });
    await User.updateOne({ email: 'lan@gmail.example' }, { emailVerifiedAt: new Date() });
    await signInWithGoogle();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'lan@gmail.example', password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ hasGoogle: true, hasPassword: true });
  });

  it('takes over an unverified account: drops its password and signs it out', async () => {
    // Someone registered this email without proving they own it.
    const { agent: squatter } = await signUp(app, { email: 'lan@gmail.example' });
    await signInWithGoogle();

    expect((await squatter.post('/api/auth/refresh')).status).toBe(401);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'lan@gmail.example', password: TEST_PASSWORD });
    expect(login.status).toBe(401);
  });
});
