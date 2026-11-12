import type { Logger } from 'pino';
import { Resend } from 'resend';
import type { Config } from '../config.ts';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export function createResendMailer(options: { apiKey: string; from: string }): Mailer {
  const resend = new Resend(options.apiKey);
  return {
    async send(message) {
      const { error } = await resend.emails.send({ from: options.from, ...message });
      // Only the error name: the message can echo the recipient.
      if (error) throw new Error(`Resend rejected the email: ${error.name}`);
    },
  };
}

/** Development without a key: the email, including its link, goes to the server log. */
export function createLogMailer(logger: Logger): Mailer {
  return {
    async send(message) {
      logger.info(
        { to: message.to, subject: message.subject, text: message.text },
        'Email not sent (RESEND_API_KEY is not set); its text is logged instead',
      );
    },
  };
}

/** Production without a key: links in emails are credentials, so nothing but a warning. */
export function createDisabledMailer(logger: Logger): Mailer {
  return {
    async send(message) {
      logger.warn({ subject: message.subject }, 'Email not sent: RESEND_API_KEY is not set');
    },
  };
}

export interface MemoryMailer extends Mailer {
  readonly sent: MailMessage[];
}

export function createMemoryMailer(): MemoryMailer {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

export function createMailer(
  config: Pick<Config, 'NODE_ENV' | 'RESEND_API_KEY' | 'MAIL_FROM'>,
  logger: Logger,
): Mailer {
  if (config.RESEND_API_KEY) {
    return createResendMailer({ apiKey: config.RESEND_API_KEY, from: config.MAIL_FROM });
  }
  return config.NODE_ENV === 'production' ? createDisabledMailer(logger) : createLogMailer(logger);
}
