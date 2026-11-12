import type { Logger } from 'pino';
import { AppError } from '../http/AppError.ts';
import type { Mailer } from '../mail/mailer.ts';
import { passwordResetEmail } from '../mail/templates.ts';
import { PasswordReset } from '../models/PasswordReset.ts';
import { User, type UserDocument } from '../models/User.ts';
import type { Passwords } from './passwords.ts';
import { revokeAllSessions } from './sessions.ts';
import { hashToken, randomToken } from './tokens.ts';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
/** At most one reset email per minute and five per day for one account (mail quota, inbox spam). */
export const RESET_MIN_INTERVAL_MS = 60 * 1000;
export const RESET_MAX_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

interface PasswordResetDeps {
  mailer: Mailer;
  /** Links point at the web app. */
  appOrigin: string;
  passwords: Passwords;
  logger: Logger;
}

export function createPasswordResets({ mailer, appOrigin, passwords, logger }: PasswordResetDeps) {
  return {
    /** Emails a reset link when the email has an account; does nothing otherwise. */
    async request(email: string, now = new Date()): Promise<void> {
      const user = await User.findOne({ email });
      if (!user) return;
      // Silent, like every other answer: the caller must not learn that the account exists.
      const [recent, today] = await Promise.all([
        PasswordReset.exists({
          userId: user._id,
          createdAt: { $gt: new Date(now.getTime() - RESET_MIN_INTERVAL_MS) },
        }),
        PasswordReset.countDocuments({
          userId: user._id,
          createdAt: { $gt: new Date(now.getTime() - DAY_MS) },
        }),
      ]);
      if (recent || today >= RESET_MAX_PER_DAY) {
        logger.info({ reason: recent ? 'too soon' : 'daily limit' }, 'Password reset skipped');
        return;
      }
      const token = randomToken(32);
      await PasswordReset.create({
        userId: user._id,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      });
      // In the fragment, so the token never reaches server logs or Referer headers.
      const link = `${appOrigin}/reset-password#token=${token}`;
      await mailer.send({
        to: user.email,
        ...passwordResetEmail({
          locale: user.locale === 'en' ? 'en' : 'vi',
          name: user.name,
          link,
        }),
      });
    },

    /** Sets the password, marks the email verified and signs the user out everywhere. */
    async reset(token: string, password: string, now = new Date()): Promise<UserDocument> {
      const reset = await PasswordReset.findOneAndUpdate(
        { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: now } },
        { $set: { usedAt: now } },
      );
      const user = reset ? await User.findById(reset.userId) : null;
      if (!user) {
        throw new AppError('INVALID_TOKEN', 'This reset link is wrong, expired or already used');
      }
      user.passwordHash = await passwords.hash(password);
      // Opening the emailed link proves the user owns the email.
      user.emailVerifiedAt ??= now;
      await user.save();
      await Promise.all([
        revokeAllSessions(user.id as string, now),
        PasswordReset.updateMany({ userId: user._id, usedAt: null }, { $set: { usedAt: now } }),
      ]);
      return user;
    },
  };
}

export type PasswordResets = ReturnType<typeof createPasswordResets>;
