import { describe, expect, it } from 'vitest';
import {
  CurrentUserSchema,
  EmailSchema,
  LoginRequestSchema,
  PasswordSchema,
  RegisterRequestSchema,
  ReturnToSchema,
  UpdateMeRequestSchema,
} from './auth.ts';

describe('auth contracts', () => {
  it('normalizes emails', () => {
    expect(EmailSchema.parse('  Lan.Nguyen@Example.COM ')).toBe('lan.nguyen@example.com');
    expect(EmailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('keeps passwords between 8 characters and 72 bytes', () => {
    expect(PasswordSchema.safeParse('1234567').success).toBe(false);
    expect(PasswordSchema.safeParse('12345678').success).toBe(true);
    // 25 three-byte characters = 75 bytes: too long for bcrypt even though it is 25 characters.
    const tooLong = PasswordSchema.safeParse('ệ'.repeat(25));
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0]).toMatchObject({
      code: 'custom',
      params: { reason: 'passwordTooLong' },
    });
  });

  it('accepts a registration and defaults nothing silently', () => {
    const parsed = RegisterRequestSchema.parse({
      email: 'Lan@Example.com',
      password: 'mat-khau-dai',
      name: '  Nguyễn Thị Lan ',
    });
    expect(parsed).toEqual({
      email: 'lan@example.com',
      password: 'mat-khau-dai',
      name: 'Nguyễn Thị Lan',
    });
  });

  it('requires a password to sign in but not its strength', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
    expect(LoginRequestSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('accepts only relative return paths', () => {
    expect(ReturnToSchema.safeParse('/clans/abc').success).toBe(true);
    expect(ReturnToSchema.safeParse('//evil.example').success).toBe(false);
    expect(ReturnToSchema.safeParse('https://evil.example').success).toBe(false);
    expect(ReturnToSchema.safeParse('/\\evil.example').success).toBe(false);
  });

  it('needs at least one change to update the profile', () => {
    expect(UpdateMeRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdateMeRequestSchema.parse({ locale: 'en' })).toEqual({ locale: 'en' });
  });

  it('describes the current user without secrets', () => {
    const user = {
      id: '64b7f0c2a1b2c3d4e5f60718',
      email: 'lan@example.com',
      name: 'Lan',
      locale: 'vi',
      hasPassword: true,
      hasGoogle: false,
      passwordHash: 'should-be-stripped',
    };
    expect(CurrentUserSchema.parse(user)).not.toHaveProperty('passwordHash');
  });
});
