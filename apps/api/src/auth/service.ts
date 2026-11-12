import type {
  CurrentUser,
  LoginRequest,
  RegisterRequest,
  UpdateMeRequest,
} from '@ancestors-tree/shared';
import { AppError } from '../http/AppError.ts';
import type { CookieInstruction } from '../http/routeRegistry.ts';
import { User, type UserDocument } from '../models/User.ts';
import { clearSessionCookies, sessionCookies } from './cookies.ts';
import type { Passwords } from './passwords.ts';
import { revokeSessionOf, rotateSession, startSession } from './sessions.ts';
import type { AccessTokens } from './tokens.ts';
import { toCurrentUser } from './userDto.ts';

export interface SignedIn {
  user: CurrentUser;
  cookies: CookieInstruction[];
}

export type RefreshOutcome =
  | { kind: 'rotated'; cookies: CookieInstruction[] }
  | { kind: 'concurrent' }
  | { kind: 'signedOut'; cookies: CookieInstruction[] };

interface AuthServiceDeps {
  tokens: AccessTokens;
  passwords: Passwords;
  secureCookies: boolean;
}

const DUPLICATE_KEY = 11000;

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY
  );
}

const emailTaken = () => new AppError('EMAIL_TAKEN', 'An account with this email already exists');

export function createAuthService({ tokens, passwords, secureCookies }: AuthServiceDeps) {
  async function signIn(user: UserDocument): Promise<SignedIn> {
    const userId = user.id as string;
    const [accessToken, refreshToken] = await Promise.all([
      tokens.sign(userId),
      startSession(userId),
    ]);
    return {
      user: toCurrentUser(user),
      cookies: sessionCookies({ accessToken, refreshToken, secure: secureCookies }),
    };
  }

  async function findUser(userId: string): Promise<UserDocument> {
    const user = await User.findById(userId);
    // The access token outlived the account: treat it as signed out.
    if (!user) throw new AppError('UNAUTHENTICATED', 'Sign in to continue');
    return user;
  }

  return {
    signIn,

    async register(input: RegisterRequest): Promise<SignedIn> {
      if (await User.exists({ email: input.email })) throw emailTaken();
      const passwordHash = await passwords.hash(input.password);
      try {
        const user = await User.create({
          email: input.email,
          name: input.name,
          locale: input.locale ?? 'vi',
          passwordHash,
        });
        return await signIn(user);
      } catch (error) {
        // Two sign-ups with the same email at the same moment: the unique index decides.
        if (isDuplicateKey(error)) throw emailTaken();
        throw error;
      }
    },

    async login(input: LoginRequest): Promise<SignedIn> {
      const user = await User.findOne({ email: input.email });
      const valid = await passwords.verify(input.password, user?.passwordHash);
      if (!user || !valid) throw new AppError('INVALID_CREDENTIALS', 'Wrong email or password');
      return signIn(user);
    },

    async refresh(refreshToken: string | undefined): Promise<RefreshOutcome> {
      const signedOut: RefreshOutcome = {
        kind: 'signedOut',
        cookies: clearSessionCookies(secureCookies),
      };
      if (!refreshToken) return signedOut;
      const result = await rotateSession(refreshToken);
      if (result.kind === 'invalid') return signedOut;
      // Another tab already rotated this token; its response carries the new cookies.
      if (result.kind === 'concurrent') return { kind: 'concurrent' };
      const accessToken = await tokens.sign(result.userId);
      return {
        kind: 'rotated',
        cookies: sessionCookies({ accessToken, refreshToken: result.token, secure: secureCookies }),
      };
    },

    async logout(refreshToken: string | undefined): Promise<CookieInstruction[]> {
      if (refreshToken) await revokeSessionOf(refreshToken);
      return clearSessionCookies(secureCookies);
    },

    async getUser(userId: string): Promise<CurrentUser> {
      return toCurrentUser(await findUser(userId));
    },

    async updateProfile(userId: string, changes: UpdateMeRequest): Promise<CurrentUser> {
      const user = await findUser(userId);
      if (changes.name !== undefined) user.name = changes.name;
      if (changes.locale !== undefined) user.locale = changes.locale;
      await user.save();
      return toCurrentUser(user);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
