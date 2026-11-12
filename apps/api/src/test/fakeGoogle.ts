import { codeChallengeFor, type GoogleOAuthClient, type GoogleProfile } from '../auth/google.ts';

interface Authorization {
  state: string;
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface FakeGoogle extends GoogleOAuthClient {
  /** The profile Google "returns" for each authorization code. */
  readonly profiles: Map<string, GoogleProfile>;
  lastAuthorization?: Authorization;
}

/** Checks PKCE and nonce like Google would, so route tests prove they are passed through. */
export function createFakeGoogle(): FakeGoogle {
  const fake: FakeGoogle = {
    profiles: new Map(),
    authorizationUrl(input) {
      fake.lastAuthorization = input;
      return `https://accounts.google.test/auth?state=${input.state}`;
    },
    async exchangeCode({ code, codeVerifier, nonce, redirectUri }) {
      const last = fake.lastAuthorization;
      if (
        !last ||
        last.nonce !== nonce ||
        last.redirectUri !== redirectUri ||
        codeChallengeFor(codeVerifier) !== last.codeChallenge
      ) {
        throw new Error('PKCE, nonce or redirect URI mismatch');
      }
      const profile = fake.profiles.get(code);
      if (!profile) throw new Error('Unknown authorization code');
      return profile;
    },
  };
  return fake;
}
