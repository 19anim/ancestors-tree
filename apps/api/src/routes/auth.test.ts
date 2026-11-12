import request from 'supertest';
import { describe, expect, it } from 'vitest';
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
