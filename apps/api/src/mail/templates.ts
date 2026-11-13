import type { Locale } from '@ancestors-tree/shared';
import type { MailMessage } from './mailer.ts';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

const RESET_COPY = {
  vi: {
    subject: 'Đặt lại mật khẩu AncestorsTree',
    greeting: (name: string) => `Chào ${name},`,
    body: 'Có người (hy vọng là bạn) vừa yêu cầu đặt lại mật khẩu tài khoản AncestorsTree của bạn. Mở đường link dưới đây để chọn mật khẩu mới. Link chỉ dùng được một lần, trong 1 giờ.',
    action: 'Chọn mật khẩu mới',
    ignore: 'Nếu bạn không yêu cầu, hãy bỏ qua email này: mật khẩu của bạn vẫn giữ nguyên.',
  },
  en: {
    subject: 'Reset your AncestorsTree password',
    greeting: (name: string) => `Hi ${name},`,
    body: 'Someone (hopefully you) asked to reset the password of your AncestorsTree account. Open the link below to choose a new password. The link works once, for 1 hour.',
    action: 'Choose a new password',
    ignore: 'If you did not ask for this, ignore this email: your password stays the same.',
  },
} as const;

/** Emails are the one place the API writes user-facing text (spec §14): vi and en only. */
export function passwordResetEmail(input: {
  locale: Locale;
  name: string;
  link: string;
}): Omit<MailMessage, 'to'> {
  const copy = RESET_COPY[input.locale];
  const greeting = copy.greeting(input.name);
  return {
    subject: copy.subject,
    text: [greeting, '', copy.body, '', input.link, '', copy.ignore].join('\n'),
    html: [
      `<p>${escapeHtml(greeting)}</p>`,
      `<p>${escapeHtml(copy.body)}</p>`,
      `<p><a href="${escapeHtml(input.link)}">${escapeHtml(copy.action)}</a></p>`,
      `<p>${escapeHtml(copy.ignore)}</p>`,
    ].join('\n'),
  };
}
