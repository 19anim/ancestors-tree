import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.ts';
import { createMailer, createMemoryMailer, createResendMailer } from './mailer.ts';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

const MESSAGE = { to: 'lan@example.test', subject: 'Hi', text: 'Hello', html: '<p>Hello</p>' };

describe('mailers', () => {
  it('sends through Resend from MAIL_FROM', async () => {
    send.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await createResendMailer({ apiKey: 're_test', from: 'Tree <a@example.test>' }).send(MESSAGE);
    expect(send).toHaveBeenCalledWith({ from: 'Tree <a@example.test>', ...MESSAGE });
  });

  it('fails when Resend rejects the email', async () => {
    send.mockResolvedValueOnce({ data: null, error: { name: 'validation_error', message: 'x' } });
    await expect(
      createResendMailer({ apiKey: 're_test', from: 'a@example.test' }).send(MESSAGE),
    ).rejects.toThrow(/validation_error/);
  });

  it('writes emails to the log in development without a key', async () => {
    const logger = pino({ level: 'silent' });
    const info = vi.spyOn(logger, 'info');
    await createMailer(loadConfig({ NODE_ENV: 'test' }), logger).send(MESSAGE);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ to: MESSAGE.to, text: MESSAGE.text }),
      expect.stringContaining('RESEND_API_KEY'),
    );
  });

  it('never logs the email body in production without a key', async () => {
    const logger = pino({ level: 'silent' });
    const warn = vi.spyOn(logger, 'warn');
    const info = vi.spyOn(logger, 'info');
    const config = loadConfig({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://db.example.test/app',
      JWT_SECRET: 'test-only-secret-with-at-least-32-chars',
    });
    await createMailer(config, logger).send(MESSAGE);
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith({ subject: 'Hi' }, expect.any(String));
  });

  it('keeps emails in memory for tests', async () => {
    const mailer = createMemoryMailer();
    await mailer.send(MESSAGE);
    expect(mailer.sent).toEqual([MESSAGE]);
  });
});
