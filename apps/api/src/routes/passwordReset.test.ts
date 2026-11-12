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

/** Pretends the reset links so far were requested `ms` ago (createdAt is immutable in Mongoose). */
async function ageResets(ms: number) {
  await PasswordReset.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - ms) } });
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
    expect(await PasswordReset.countDocuments()).toBe(0);
  });

  it('sends one email for two requests within a minute, still answering 204', async () => {
    await signUp(app, { email: 'quick@example.test' });
    await requestReset('quick@example.test');
    const before = mailer.sent.length;
    const second = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'quick@example.test' });
    expect(second.status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mailer.sent.length).toBe(before);
    expect(await PasswordReset.countDocuments()).toBe(1);

    await ageResets(61 * 1000);
    await requestReset('quick@example.test');
    expect(await PasswordReset.countDocuments()).toBe(2);
  });

  it('sends nothing for the sixth request within 24 hours', async () => {
    const { user } = await signUp(app, { email: 'many@example.test' });
    await PasswordReset.insertMany(
      Array.from({ length: 5 }, (_, index) => ({
        userId: user.id,
        tokenHash: `hash-${index}`,
        expiresAt: new Date(Date.now() + 60_000),
      })),
    );
    await ageResets(2 * 60 * 60 * 1000);
    const before = mailer.sent.length;
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'many@example.test' });
    expect(response.status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mailer.sent.length).toBe(before);
    expect(await PasswordReset.countDocuments()).toBe(5);

    // Resets older than a day no longer count.
    await ageResets(25 * 60 * 60 * 1000);
    await requestReset('many@example.test');
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
    const first = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'new-password-1' });
    expect(first.status).toBe(200);
    const again = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'new-password-2' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_TOKEN');
  });

  it('invalidates the other reset links of the user', async () => {
    await signUp(app, { email: 'mai@example.test' });
    const first = await requestReset('mai@example.test');
    await ageResets(2 * 60 * 1000);
    const second = await requestReset('mai@example.test');
    const used = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: first, password: 'new-password-1' });
    expect(used.status).toBe(200);
    const other = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: second, password: 'new-password-2' });
    expect(other.status).toBe(400);
    expect(other.body.error.code).toBe('INVALID_TOKEN');
  });

  it('lets only one of two concurrent resets with the same token succeed', async () => {
    await signUp(app, { email: 'binh@example.test' });
    const token = await requestReset('binh@example.test');
    const responses = await Promise.all(
      ['new-password-1', 'new-password-2'].map((password) =>
        request(app).post('/api/auth/reset-password').send({ token, password }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
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
