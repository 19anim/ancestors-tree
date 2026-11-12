import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { hashToken } from '../auth/tokens.ts';
import { createMemoryMailer } from '../mail/mailer.ts';
import { PasswordReset } from '../models/PasswordReset.ts';
import { User } from '../models/User.ts';
import { createTestApp, TEST_ORIGIN } from '../test/app.ts';
import { useTestDatabase } from '../test/database.ts';
import { setCookies, signUp, TEST_PASSWORD } from '../test/users.ts';

useTestDatabase();

const mailer = createMemoryMailer();
const { app } = createTestApp({ mailer });

async function requestReset(email: string): Promise<string> {
  const before = mailer.sent.length;
  const response = await request(app).post('/api/auth/forgot-password').send({ email });
  expect(response.status).toBe(204);
  await vi.waitFor(() => expect(mailer.sent.length).toBe(before + 1));
  const text = mailer.sent.at(-1)?.text ?? '';
  const token = /#token=([\w-]+)/.exec(text)?.[1];
  if (!token) throw new Error('No reset link in the email');
  return token;
}

describe('POST /api/auth/forgot-password', () => {
  it('emails a reset link in the user language', async () => {
    await signUp(app, { email: 'lan@example.test', locale: 'en' });
    await requestReset('Lan@example.test');
    const email = mailer.sent.at(-1);
    expect(email?.to).toBe('lan@example.test');
    expect(email?.subject).toBe('Reset your AncestorsTree password');
    expect(email?.text).toContain(`${TEST_ORIGIN}/reset-password#token=`);
  });

  it('answers the same for an unknown email and sends nothing', async () => {
    const before = mailer.sent.length;
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.test' });
    expect(response.status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mailer.sent.length).toBe(before);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('sets the new password, verifies the email, signs out other devices and signs in', async () => {
    const { agent: oldDevice } = await signUp(app, { email: 'tuan@example.test' });
    const token = await requestReset('tuan@example.test');

    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'brand-new-password' });
    expect(response.status).toBe(200);
    expect(response.body.email).toBe('tuan@example.test');
    expect(setCookies(response).has('at')).toBe(true);

    expect((await oldDevice.post('/api/auth/refresh')).status).toBe(401);
    const oldPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tuan@example.test', password: TEST_PASSWORD });
    expect(oldPassword.status).toBe(401);
    const newPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tuan@example.test', password: 'brand-new-password' });
    expect(newPassword.status).toBe(200);
    expect((await User.findOne({ email: 'tuan@example.test' }))?.emailVerifiedAt).toBeInstanceOf(
      Date,
    );
  });

  it('works only once', async () => {
    await signUp(app, { email: 'hoa@example.test' });
    const token = await requestReset('hoa@example.test');
    await request(app).post('/api/auth/reset-password').send({ token, password: 'new-password-1' });
    const again = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'new-password-2' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired link', async () => {
    const { user } = await signUp(app);
    const token = 'x'.repeat(43);
    await PasswordReset.create({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() - 1000),
    });
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'brand-new-password' });
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });
});
