import { pino } from 'pino';
import { createMemoryMailer } from '../mail/mailer.ts';
import { createApp, type AppOptions, type CreatedApp } from '../app.ts';

/** The web origin tests use: the only origin allowed to send writes. */
export const TEST_ORIGIN = 'http://localhost:5173';

/** App options for tests: silent logs, docs on, rate limits too high to interfere. */
export function testAppOptions(overrides: Partial<AppOptions> = {}): AppOptions {
  return {
    logger: pino({ level: 'silent' }),
    version: '1.0.0-test',
    httpLogging: false,
    appOrigin: TEST_ORIGIN,
    trustProxyHops: 0,
    apiDocs: true,
    rateLimits: { auth: 1000, user: 1000 },
    // Cost 4 keeps bcrypt fast in tests; production uses BCRYPT_COST (12).
    auth: {
      jwtSecret: 'test-only-secret-with-at-least-32-chars',
      secureCookies: false,
      bcryptCost: 4,
    },
    mailer: createMemoryMailer(),
    ...overrides,
  };
}

export function createTestApp(overrides: Partial<AppOptions> = {}): CreatedApp {
  return createApp(testAppOptions(overrides));
}
