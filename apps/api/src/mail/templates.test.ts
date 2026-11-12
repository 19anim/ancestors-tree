import { describe, expect, it } from 'vitest';
import { passwordResetEmail } from './templates.ts';

const LINK = 'http://localhost:5173/reset-password#token=abc';

describe('password reset email', () => {
  it('is written in the user language and carries the link', () => {
    const vi = passwordResetEmail({ locale: 'vi', name: 'Lan', link: LINK });
    expect(vi.subject).toBe('Đặt lại mật khẩu AncestorsTree');
    expect(vi.text).toContain('Chào Lan,');
    expect(vi.text).toContain(LINK);

    const en = passwordResetEmail({ locale: 'en', name: 'Lan', link: LINK });
    expect(en.subject).toBe('Reset your AncestorsTree password');
    expect(en.html).toContain(`href="${LINK}"`);
  });

  it('escapes the name in the HTML version', () => {
    const email = passwordResetEmail({ locale: 'en', name: '<b>Lan</b>', link: LINK });
    expect(email.html).not.toContain('<b>Lan</b>');
    expect(email.html).toContain('&#60;b&#62;Lan&#60;/b&#62;');
  });
});
