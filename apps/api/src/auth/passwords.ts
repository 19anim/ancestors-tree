import bcrypt from 'bcryptjs';
import { randomToken } from './tokens.ts';

/** Spec §12. Tests pass a lower cost to stay fast. */
export const BCRYPT_COST = 12;

export interface Passwords {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string | null | undefined): Promise<boolean>;
}

export function createPasswords(cost: number): Passwords {
  let dummyHash: Promise<string> | undefined;
  return {
    hash: (password) => bcrypt.hash(password, cost),
    async verify(password, hash) {
      if (!hash) {
        // Spend the same time as a real check, so the response time does not reveal
        // whether the email has an account with a password.
        dummyHash ??= bcrypt.hash(randomToken(16), cost);
        await bcrypt.compare(password, await dummyHash);
        return false;
      }
      return bcrypt.compare(password, hash);
    },
  };
}
