import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Session } from '../models/Session.ts';
import { User } from '../models/User.ts';
import { createTestApp } from '../test/app.ts';
import { useTestDatabase } from '../test/database.ts';
import { cookieValue, setCookies, signUp, TEST_PASSWORD } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();

describe('POST /api/auth/register', () => {
  it('creates the account, signs in and never returns the password hash', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: ' Lan@Example.TEST ',
      password: TEST_PASSWORD,
      name: 'Nguyễn Thị Lan',
      locale: 'en',
    });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.stringMatching(/^[a-f0-9]{24}$/),
      email: 'lan@example.test',
      name: 'Nguyễn Thị Lan',
      locale: 'en',
      hasPassword: true,
      hasGoogle: false,
    });

    const cookies = setCookies(response);
    expect(cookies.get('at')).toMatch(/Path=\/api;.*HttpOnly.*SameSite=Lax/);
    expect(cookies.get('rt')).toMatch(/Path=\/api\/auth;.*HttpOnly.*SameSite=Lax/);

    const stored = await User.findOne({ email: 'lan@example.test' });
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored?.emailVerifiedAt).toBeUndefined();
  });

  it('refuses an email that already has an account', async () => {
    await signUp(app, { email: 'tuan@example.test' });
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'TUAN@example.test', password: TEST_PASSWORD, name: 'Tuấn' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates the request', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'lan@example.test', password: 'short', name: 'Lan' });
    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('body.password');
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with the right password', async () => {
    await signUp(app, { email: 'hoa@example.test' });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'Hoa@example.test', password: TEST_PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.email).toBe('hoa@example.test');
    expect(setCookies(response).has('at')).toBe(true);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await signUp(app, { email: 'ha@example.test' });
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ha@example.test', password: 'wrong-password' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.test', password: 'wrong-password' });
    for (const response of [wrong, unknown]) {
      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Wrong email or password',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and renews both cookies', async () => {
    const { agent } = await signUp(app);
    const response = await agent.post('/api/auth/refresh');
    expect(response.status).toBe(204);
    const cookies = setCookies(response);
    expect(cookies.has('at')).toBe(true);
    expect(cookies.has('rt')).toBe(true);
    expect((await agent.get('/api/me')).status).toBe(200);
  });

  it('answers a second refresh with the same token right away without new cookies', async () => {
    const signedUp = await request(app)
      .post('/api/auth/register')
      .send({ email: 'tab@example.test', password: TEST_PASSWORD, name: 'Tab' });
    const oldToken = cookieValue(setCookies(signedUp).get('rt'));
    await request(app).post('/api/auth/refresh').set('Cookie', `rt=${oldToken}`);

    const second = await request(app).post('/api/auth/refresh').set('Cookie', `rt=${oldToken}`);
    expect(second.status).toBe(204);
    expect(second.headers['set-cookie']).toBeUndefined();
  });

  it('answers 401 and clears the cookies without a valid session', async () => {
    const response = await request(app).post('/api/auth/refresh').set('Cookie', 'rt=unknown');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(setCookies(response).get('at')).toMatch(/^at=;/);
    expect(setCookies(response).get('rt')).toMatch(/^rt=;/);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookies and ends the session', async () => {
    const signedUp = await request(app)
      .post('/api/auth/register')
      .send({ email: 'bye@example.test', password: TEST_PASSWORD, name: 'Bye' });
    const refreshToken = cookieValue(setCookies(signedUp).get('rt'));

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `rt=${refreshToken}`);
    expect(response.status).toBe(204);
    expect(setCookies(response).get('rt')).toMatch(/^rt=;/);

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `rt=${refreshToken}`);
    expect(refresh.status).toBe(401);
  });
});

describe('login throttle per email', () => {
  it('answers 429 after the budget for one email, whatever the IP', async () => {
    const limited = createTestApp({
      trustProxyHops: 1,
      rateLimits: { auth: 1000, user: 1000, loginEmail: 3 },
    }).app;
    await signUp(limited, { email: 'target@example.test' });
    const attempt = (email: string, ip: string) =>
      request(limited)
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email, password: 'wrong-password-here' });

    expect((await attempt('target@example.test', '10.0.0.1')).status).toBe(401);
    expect((await attempt(' Target@Example.TEST ', '10.0.0.2')).status).toBe(401);
    expect((await attempt('target@example.test', '10.0.0.3')).status).toBe(401);
    const blocked = await attempt('TARGET@example.test', '10.0.0.4');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    // The right password does not get through either, and other emails are unaffected.
    const right = await request(limited)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.0.0.5')
      .send({ email: 'target@example.test', password: TEST_PASSWORD });
    expect(right.status).toBe(429);
    expect((await attempt('other@example.test', '10.0.0.6')).status).toBe(401);
  });

  it('skips an over-long or invalid email without storing a key, and still answers 400', async () => {
    const limited = createTestApp({ rateLimits: { auth: 1000, user: 1000, loginEmail: 1 } }).app;
    const long = `${'a'.repeat(10_000)}@example.test`;
    for (const email of [long, long, 'not-an-email', 'not-an-email']) {
      const response = await request(limited)
        .post('/api/auth/login')
        .send({ email, password: 'whatever-password' });
      expect(response.status).toBe(400);
    }
  });

  it('does not count successful sign-ins', async () => {
    const limited = createTestApp({ rateLimits: { auth: 1000, user: 1000, loginEmail: 2 } }).app;
    await signUp(limited, { email: 'busy@example.test' });
    for (let i = 0; i < 4; i += 1) {
      const response = await request(limited)
        .post('/api/auth/login')
        .send({ email: 'busy@example.test', password: TEST_PASSWORD });
      expect(response.status).toBe(200);
    }
  });

  it('ignores requests without a string email', async () => {
    const limited = createTestApp({ rateLimits: { auth: 1000, user: 1000, loginEmail: 1 } }).app;
    for (let i = 0; i < 3; i += 1) {
      const response = await request(limited).post('/api/auth/login').send({ email: 5 });
      expect(response.status).toBe(400);
    }
  });
});

describe('signing in over an existing session', () => {
  it('revokes the refresh family of the old rt cookie', async () => {
    const { agent } = await signUp(app, { email: 'switch@example.test' });
    const oldRt = cookieValue(setCookies(await agent.post('/api/auth/refresh')).get('rt'));
    const other = await signUp(app, { email: 'second@example.test' });
    const response = await request(app)
      .post('/api/auth/login')
      .set('Cookie', `rt=${oldRt}`)
      .send({ email: 'second@example.test', password: TEST_PASSWORD });
    expect(response.status).toBe(200);
    expect(
      await Session.countDocuments({
        userId: (await User.findOne({ email: 'switch@example.test' }))?._id,
        revokedAt: null,
      }),
    ).toBe(0);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', `rt=${oldRt}`)).status).toBe(
      401,
    );
    // The new session is untouched.
    expect(
      (
        await request(app)
          .post('/api/auth/refresh')
          .set('Cookie', `rt=${cookieValue(setCookies(response).get('rt'))}`)
      ).status,
    ).toBe(204);
    expect(other.user.email).toBe('second@example.test');
  });
});
