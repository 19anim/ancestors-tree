import type { CurrentUser } from '@ancestors-tree/shared';
import type { UserDocument } from '../models/User.ts';

export function toCurrentUser(user: UserDocument): CurrentUser {
  return {
    id: user.id as string,
    email: user.email,
    name: user.name,
    locale: user.locale === 'en' ? 'en' : 'vi',
    hasPassword: Boolean(user.passwordHash),
    hasGoogle: Boolean(user.googleId),
  };
}
