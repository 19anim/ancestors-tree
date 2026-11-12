import { z } from 'zod';
import { IdSchema } from './common.ts';

/** bcrypt only reads the first 72 bytes of a password. */
const BCRYPT_MAX_BYTES = 72;

// Field schemas carry no custom messages: the web app translates issues by their code
// (shared/lib/formErrors.ts), and a schema-level message would override that translation.

export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const PasswordSchema = z
  .string()
  .min(8)
  .refine((value) => new TextEncoder().encode(value).length <= BCRYPT_MAX_BYTES, {
    params: { reason: 'passwordTooLong' },
  });

export const DisplayNameSchema = z.string().trim().min(1).max(80);

export const LocaleSchema = z.enum(['vi', 'en']);

/** A path inside the app to return to after signing in; never another site. */
export const ReturnToSchema = z
  .string()
  .max(500)
  .regex(/^\/(?![/\\])[^\s\\]*$/, 'Must be a path inside the app');

export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  name: DisplayNameSchema,
  locale: LocaleSchema.optional(),
});

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(1024),
});

export const ForgotPasswordRequestSchema = z.object({ email: EmailSchema });

export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(20).max(200),
  password: PasswordSchema,
});

export const UpdateMeRequestSchema = z
  .object({ name: DisplayNameSchema.optional(), locale: LocaleSchema.optional() })
  .refine((value) => value.name !== undefined || value.locale !== undefined, {
    message: 'Send at least one field to change',
  });

export const CurrentUserSchema = z.object({
  id: IdSchema,
  email: z.string(),
  name: z.string(),
  locale: LocaleSchema,
  hasPassword: z.boolean(),
  hasGoogle: z.boolean(),
});

export const AuthProvidersSchema = z.object({ google: z.boolean() });

export type Locale = z.infer<typeof LocaleSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export type UpdateMeRequest = z.infer<typeof UpdateMeRequestSchema>;
export type CurrentUser = z.infer<typeof CurrentUserSchema>;
export type AuthProviders = z.infer<typeof AuthProvidersSchema>;
