import { EmailSchema, PasswordSchema, RegisterRequestSchema } from '@ancestors-tree/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import i18n from '../i18n';
import { zodErrorMap } from './formErrors';

const error = zodErrorMap(i18n.t);
const firstMessage = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe('zodErrorMap', () => {
  it('translates the issues of the shared schemas', () => {
    expect(firstMessage(EmailSchema.safeParse('lan', { error }))).toBe('Email chưa đúng định dạng');
    expect(firstMessage(PasswordSchema.safeParse('short', { error }))).toBe('Cần ít nhất 8 ký tự');
    expect(firstMessage(PasswordSchema.safeParse('ệ'.repeat(25), { error }))).toBe(
      'Mật khẩu quá dài (tối đa 72 byte)',
    );
    const missingName = RegisterRequestSchema.safeParse(
      { email: 'lan@example.test', password: 'long-enough', name: ' ' },
      { error },
    );
    expect(firstMessage(missingName)).toBe('Hãy điền mục này');
  });

  it('uses the message key a custom issue carries', () => {
    const schema = z
      .string()
      .superRefine((_, ctx) =>
        ctx.addIssue({ code: 'custom', params: { messageKey: 'dates.errors.yearOnly' } }),
      );
    expect(firstMessage(schema.safeParse('x', { error }))).toBe(
      'Chỉ biết năm? Hãy chọn “Chỉ biết năm”.',
    );
  });
});
