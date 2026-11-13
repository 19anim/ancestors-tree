# P3 Accounts & Clans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sample-only app with real accounts and family clans. The result must include:
- a MongoDB connection (Atlas in development and production, an in-memory replica set in tests), reported by `/api/health`;
- email + password sign-up and sign-in, Google sign-in, and password reset by email;
- sessions in cookies: a 15-minute JWT access token and a rotating 30-day refresh token;
- clans, memberships with roles (Owner / Editor / Viewer), invite links and role checks on every clan route;
- web pages for signing in, signing up, resetting a password, listing and creating clans, managing members and invites, and joining by link;
- every P1 carry-over item that must land before the first session cookie exists.

**Architecture:**
- **Database.** Mongoose 9 models live in `apps/api/src/models/`. `src/db/connect.ts` owns the shared connection. Tests start one `MongoMemoryReplSet` per test run (Vitest `globalSetup`) and give every test file its own database, so transactions work exactly as on Atlas.
- **Route registry v2.** Every route declares `access: 'public' | 'signedIn' | { clanRole }`. The registry turns this into middleware (injected by `createApp`), documents it in OpenAPI, types handler results against the declared response schemas, and always parses response bodies through those schemas, so fields such as `passwordHash` can never leak. Handlers never touch `res`: they return `{ status, body | redirect, cookies }`.
- **Auth.** `src/auth/` holds password hashing (bcryptjs, cost 12), JWT access tokens (jose, HS256), opaque refresh tokens stored as SHA-256 hashes with rotation and reuse detection, cookie settings and the `requireAuth` middleware. Google sign-in is an authorization-code flow with PKCE, `state` and `nonce` through a redirect, behind a `GoogleOAuthClient` interface (a fake in tests). Emails go through a `Mailer` interface: Resend when `RESEND_API_KEY` is set, the server log in development, a memory mailer in tests.
- **Clans.** `requireClanRole(role)` loads the caller's membership of `:id` (404 for non-members, 403 for a too-low role). Invites are multi-use links that expire after 7 days.
- **Web.** `apiClient` gains JSON bodies, abort signals, empty responses, a status-based fallback for unknown codes and one silent refresh on `401`. New features: `features/auth` (pages, `RequireAuth`, `UserMenu`) and `features/clans` (list, members, invites, settings, join). Forms use React Hook Form with the shared Zod schemas and a translated error map.

**Tech Stack:** Express 5, Mongoose 9.12, mongodb-memory-server 11.3, jose 6.2, bcryptjs 3.0, cookie-parser 1.4, express-rate-limit 8.7, Resend 6.38, React Hook Form 7.92 + @hookform/resolvers 7.0, React 19, React Router 8, TanStack Query 5, Vitest 5, Supertest 7, Playwright 1.65.

**Spec:** [`docs/superpowers/specs/2026-11-11-ancestors-tree-design.md`](../specs/2026-11-11-ancestors-tree-design.md) — §2 (accounts, clans), §3 (permissions), §5 (User, Clan, Membership, Invite), §7.2 (routes), §12 (security), §13.1 (errors), §14 (API reference), §15 (testing). Roadmap: [`2026-11-12-roadmap.md`](2026-11-12-roadmap.md) (P3 row and "Carry-over from the P1 review → P3").

**Decisions made with the user for P3**
- Email: Resend's free plan (3,000 emails/month). The code works without a key (the reset link goes to the server log in development); sending to anyone other than the Resend account owner needs a verified domain, which the user adds later without code changes.
- Google sign-in: a full-page redirect to Google (authorization-code flow). No Google script runs on our pages, so the CSP in `netlify.toml` stays unchanged.

## Global Constraints

**Repository and language**
- Node `>=24.0.0`, `"packageManager": "pnpm@11.17.0"`, TypeScript `~6.0.3` (do not upgrade). Use plain `pnpm` (not `rtk pnpm`).
- Everything in the repository is written in English (code, identifiers, comments, docs, commit messages).
- API source runs natively on Node (ADR 0002): relative imports end in `.ts`, and `erasableSyntaxOnly` forbids enums, namespaces with values and constructor parameter properties.
- Web imports are relative and have no file extension. Features import shared UI only through `src/shared/ui/index.ts` and other features only through their `index.ts`.
- Web user-facing text lives only in `apps/web/src/locales/{vi,en}.json` (Vietnamese default, English keys, identical key sets; `locales.test.ts` enforces it, including a translation for every error code). The only API-side user-facing text is email copy in `apps/api/src/mail/templates.ts` (vi and en).
- Run `pnpm format` before `pnpm check` (Prettier decides the final layout of the code in this plan).

**Secrets and privacy (never break these)**
- Never read, print or edit `apps/api/.env`; it holds the user's real secrets. Ask the controller when a step needs a value there.
- Tests never use Atlas, Resend or Google: they use `mongodb-memory-server`, the memory mailer and a fake Google client.
- Test fixtures must not look like real credentials: no `user:password@host` connection strings, no realistic API keys (GitHub secret scanning flags them). Use values such as `mongodb+srv://db.example.test/app`, `re_test`, `test-client.apps.googleusercontent.com`.
- Config errors never echo secret values. The pino logger redacts `req.headers.cookie`, `req.headers.authorization` and `res.headers["set-cookie"]`. Refresh and password-reset tokens are stored only as SHA-256 hashes. The reset token travels in the URL fragment.
- Members' emails are returned only to the clan Owner (and to the member themself).

**API rules**
- Every route declares `access`. Protected routes get their middleware from `AccessPolicies`; nothing is protected by convention alone.
- Handlers return `{ status, body }`, `{ status, redirect }` and optional `cookies`; they never write to `res`.
- Error responses use only codes from `ERROR_CODES`. Adding a code means: add it in `packages/shared/src/errors.ts`, translate it in both locale files, and run `pnpm docs:errors` to regenerate `docs/error-codes.md`.

**Exact values**
- Cookies: `at` (access, path `/api`, 15 minutes), `rt` (refresh, path `/api/auth`, 30 days), `g_state` (Google sign-in state, path `/api/auth/google`, 10 minutes). All `httpOnly`, `SameSite=Lax`, `Secure` when `NODE_ENV=production`.
- Access token: JWT HS256, issuer `ancestors-tree-api`, audience `ancestors-tree-web`, subject = user id, 15 minutes.
- Refresh token: `randomToken(32)`; rotation on every use; a token used again more than 10 seconds after its first use revokes its whole family; within 10 seconds it is treated as a concurrent refresh from another tab.
- Password reset link: single use, 1 hour, `${APP_ORIGIN}/reset-password#token=…`.
- Invite: `randomToken(24)` (32 URL-safe characters), multi-use, 7 days, role `editor` or `viewer`.
- bcrypt cost 12 (tests pass 4). Passwords 8 characters to 72 bytes. Display names 1–80 characters. Clan name 1–120, hometown ≤ 120, description ≤ 2,000.
- Rate limits: sign-in, sign-up, forgot-password and reset-password 5 per minute per IP; signed-in routes 300 per minute per user.

**Web rules (unchanged from P2)**
- Colors only from tokens; icons only from `lucide-react` with `strokeWidth={1.75}` and `aria-hidden="true"`; no emoji.
- Every control is keyboard-reachable with a visible focus outline; text contrast ≥ 4.5:1.
- Component tests use `const user = userEvent.setup()`.

**Tests and commits**
- TDD in every task: write the failing test, run it and see it fail, write the code, run it and see it pass.
- `pnpm check` passes at the end of every task. Tasks 13–15 also run `pnpm e2e`.
- One commit per task (more if a task says so), Conventional Commits, ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Human steps (the controller asks the user; implementers never do these)

1. **Before running the API locally after Task 1:** add `JWT_SECRET` to `apps/api/.env`. The user generates it with `openssl rand -base64 48` (or `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`). Tests do not need it.
2. **Before the manual Google check in Task 9 and before deploying:** create an OAuth client in Google Cloud (steps in Task 16, `docs/deployment.md` section 5) and put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `apps/api/.env` and in Render.
3. **Optional, any time:** create a Resend API key (`RESEND_API_KEY`) for real emails (Task 16, section 6).
4. **Before merging P3 to `main`:** set `MONGODB_URI` (database `/ancestors-tree`) in Render, because from P3 on the API refuses to start without it. `JWT_SECRET` is generated by Render (`render.yaml`).

## File Structure

```
packages/shared/src/
  errors.ts                  + INVALID_TOKEN, INVALID_CREDENTIALS, EMAIL_TAKEN
  api/common.ts              IdSchema
  api/auth.ts                email/password/name schemas, auth requests, CurrentUser, AuthProviders
  api/clans.ts               roles, clan/member/invite schemas
  api/health.ts              + database state
apps/api/
  scripts/e2e-server.ts      in-memory MongoDB + API for Playwright (Task 15)
  src/config.ts              new settings (APP_ORIGIN, JWT_SECRET, Google, Resend, proxy, docs)
  src/server.ts              connects MongoDB, graceful shutdown, listen errors, log redaction
  src/app.ts                 wires cookies, origin check, rate limits, auth, mail, Google, routes
  src/db/connect.ts          connect / state / disconnect
  src/test/                  globalSetup (replica set), database helper, test app, users, fake Google
  src/http/routeRegistry.ts  access levels, typed results, cookies, redirects, response parsing
  src/http/locals.ts         res.locals typing (userId, membership)
  src/http/originCheck.ts    rejects cross-site non-GET requests
  src/http/rateLimits.ts     auth (per IP) and user (per user) limiters
  src/auth/                  cookieNames, cookies, tokens, passwords, sessions, requireAuth, service, google, userDto
  src/mail/                  mailer (resend / log / disabled / memory), templates
  src/models/                User, Session, PasswordReset, Clan, Membership, Invite
  src/clans/                 access (requireClanRole), dto
  src/routes/                health, auth, passwordReset, google, me, clans, members, invites
apps/web/src/
  shared/lib/apiClient.ts    JSON bodies, signals, empty responses, status fallback, refresh on 401
  shared/lib/apiError.ts     + details
  shared/lib/formErrors.ts   translated Zod error map, server error → form
  test/api.ts                fetch mock for component tests
  features/auth/             api, pages (login, register, forgot, reset), RequireAuth, UserMenu, GoogleButton
  features/clans/            api, ClansPage, ClanMembersPage, InvitesPanel, ClanSettingsPage, JoinPage
  app/routes.tsx, AppShell.tsx
e2e/accounts.spec.ts         sign up → clan → invite → join (Task 15)
docs/                        spec EN+VI, ADR 0005, deployment.md, roadmap, error-codes.md (generated)
```

## Task order and dependencies

| Task | Builds on | Deliverable |
|---|---|---|
| 1 | — | Dependencies and validated configuration |
| 2 | 1 | MongoDB connection, test database, `/api/health` database state, graceful shutdown |
| 3 | — | Shared auth/clan contracts and three new error codes |
| 4 | 3 | Route registry v2 (access, typed results, cookies, redirects, response parsing, path checks) |
| 5 | 4 | HTTP hardening: cookies, origin check, rate limits, trust proxy, API docs off in production |
| 6 | 5 | Users, passwords, tokens, sessions, `requireAuth` |
| 7 | 6 | Register, sign in, refresh, sign out, `/me` |
| 8 | 7 | Password reset by email |
| 9 | 7 | Google sign-in |
| 10 | 6 | Clans and members API with role checks |
| 11 | 10 | Invites API |
| 12 | — | Web API client upgrade |
| 13 | 9, 12 | Web sign-in pages and session handling |
| 14 | 11, 13 | Web clan pages and invites |
| 15 | 14 | End-to-end flow against a real API |
| 16 | all | Docs: spec, ADR, deployment, roadmap |

---

### Task 1: API dependencies and configuration

**Files:**
- Modify: `apps/api/package.json`, `pnpm-lock.yaml` (through `pnpm add`)
- Modify: `apps/api/src/config.ts`
- Test: `apps/api/src/config.test.ts`
- Modify: `apps/api/.env.example`
- Modify: `render.yaml`

**Interfaces:**
- Produces: `loadConfig(env)` returning `Config` with `APP_ORIGIN: string`, `TRUST_PROXY_HOPS: number`, `API_DOCS?: 'on' | 'off'`, `MONGODB_URI?: string`, `JWT_SECRET?: string`, `GOOGLE_CLIENT_ID?: string`, `GOOGLE_CLIENT_SECRET?: string`, `RESEND_API_KEY?: string`, `MAIL_FROM: string` (plus the existing fields). `MONGODB_URI` and `JWT_SECRET` are guaranteed outside `NODE_ENV=test`.
- Produces: `requireSetting<T>(value: T | undefined, name: string): T` and `apiDocsEnabled(config: Config): boolean`.

- [ ] **Step 1: Add the API dependencies**

```bash
pnpm --filter @ancestors-tree/api add mongoose@^9.12.1 jose@^6.2.17 bcryptjs@^3.0.3 cookie-parser@^1.4.7 express-rate-limit@^8.7.4 resend@^6.38.0
pnpm --filter @ancestors-tree/api add -D mongodb-memory-server@^11.3.0 @types/cookie-parser@^1.4.10
```

If pnpm reports ignored build scripts for `mongodb-memory-server`, leave them ignored: the MongoDB binary is downloaded on first use (Task 2).

- [ ] **Step 2: Write the failing config tests**

Replace `apps/api/src/config.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { apiDocsEnabled, loadConfig, requireSetting } from './config.ts';

// Obviously fake values: credential-shaped fixtures get flagged by GitHub secret scanning.
const REQUIRED = {
  MONGODB_URI: 'mongodb+srv://db.example.test/ancestors-tree-dev?retryWrites=true',
  JWT_SECRET: 'test-only-secret-with-at-least-32-chars',
};

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

describe('loadConfig', () => {
  it('applies defaults in tests, where the database and secret are optional', () => {
    expect(loadConfig({ NODE_ENV: 'test' })).toEqual({
      NODE_ENV: 'test',
      PORT: 3000,
      LOG_LEVEL: 'info',
      APP_VERSION: '0.0.0-dev',
      APP_ORIGIN: 'http://localhost:5173',
      TRUST_PROXY_HOPS: 0,
      MAIL_FROM: 'AncestorsTree <onboarding@resend.dev>',
      CLOUDINARY_FOLDER: 'ancestors-tree/dev',
    });
  });

  it('requires MONGODB_URI and JWT_SECRET outside tests', () => {
    const message = messageOf(() => loadConfig({}));
    expect(message).toMatch(/MONGODB_URI is required/);
    expect(message).toMatch(/JWT_SECRET is required/);
    expect(loadConfig(REQUIRED).JWT_SECRET).toBe(REQUIRED.JWT_SECRET);
  });

  it('accepts every optional integration', () => {
    const config = loadConfig({
      ...REQUIRED,
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://ancestorstree.netlify.app',
      TRUST_PROXY_HOPS: '2',
      GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'test-google-secret',
      RESEND_API_KEY: 're_test',
      CLOUDINARY_URL: 'cloudinary://test-key:test-secret@example-cloud',
      CLOUDINARY_FOLDER: 'ancestors-tree/prod',
    });
    expect(config.TRUST_PROXY_HOPS).toBe(2);
    expect(config.GOOGLE_CLIENT_ID).toBe('test-client.apps.googleusercontent.com');
    expect(config.RESEND_API_KEY).toBe('re_test');
  });

  it('treats empty optional values as not set', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      MONGODB_URI: '',
      JWT_SECRET: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      RESEND_API_KEY: '',
      CLOUDINARY_URL: '',
    });
    expect(config.MONGODB_URI).toBeUndefined();
    expect(config.JWT_SECRET).toBeUndefined();
    expect(config.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(config.RESEND_API_KEY).toBeUndefined();
  });

  it('requires a database name in MONGODB_URI', () => {
    expect(() =>
      loadConfig({ ...REQUIRED, MONGODB_URI: 'mongodb+srv://db.example.test/?retryWrites=true' }),
    ).toThrow(/MONGODB_URI/);
  });

  it('rejects a short JWT_SECRET without echoing it', () => {
    const message = messageOf(() => loadConfig({ ...REQUIRED, JWT_SECRET: 'short-secret-value' }));
    expect(message).toMatch(/JWT_SECRET must be at least 32 characters/);
    expect(message).not.toContain('short-secret-value');
  });

  it('rejects a malformed CLOUDINARY_URL without echoing the secret', () => {
    const message = messageOf(() =>
      loadConfig({ NODE_ENV: 'test', CLOUDINARY_URL: 'https://top-secret-value@my-cloud' }),
    );
    expect(message).toMatch(/CLOUDINARY_URL/);
    expect(message).not.toContain('top-secret-value');
  });

  it('needs the Google client id and secret together', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'test', GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com' }),
    ).toThrow(/GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together/);
  });

  it('rejects an APP_ORIGIN with a path or trailing slash', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'test', APP_ORIGIN: 'https://ancestorstree.netlify.app/' }),
    ).toThrow(/APP_ORIGIN/);
  });

  it('rejects a CLOUDINARY_FOLDER with leading or trailing slashes', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', CLOUDINARY_FOLDER: '/ancestors-tree/' })).toThrow(
      /CLOUDINARY_FOLDER/,
    );
  });

  it('coerces PORT and keeps it in range', () => {
    expect(loadConfig({ NODE_ENV: 'test', PORT: '8080' }).PORT).toBe(8080);
    expect(() => loadConfig({ NODE_ENV: 'test', PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadConfig({ NODE_ENV: 'test', PORT: 'abc' })).toThrow(
      /Invalid environment variables/,
    );
  });
});

describe('apiDocsEnabled', () => {
  it('is on outside production unless turned off', () => {
    expect(apiDocsEnabled(loadConfig({ NODE_ENV: 'test' }))).toBe(true);
    expect(apiDocsEnabled(loadConfig({ NODE_ENV: 'test', API_DOCS: 'off' }))).toBe(false);
  });

  it('is off in production unless turned on', () => {
    expect(apiDocsEnabled(loadConfig({ ...REQUIRED, NODE_ENV: 'production' }))).toBe(false);
    expect(apiDocsEnabled(loadConfig({ ...REQUIRED, NODE_ENV: 'production', API_DOCS: 'on' }))).toBe(
      true,
    );
  });
});

describe('requireSetting', () => {
  it('returns a present value and names a missing one', () => {
    expect(requireSetting('x', 'NAME')).toBe('x');
    expect(() => requireSetting(undefined, 'MONGODB_URI')).toThrow(/MONGODB_URI is not set/);
  });
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `pnpm vitest run apps/api/src/config.test.ts`
Expected: FAIL (`apiDocsEnabled` and `requireSetting` are not exported; new settings are missing).

- [ ] **Step 4: Write the configuration**

Replace `apps/api/src/config.ts` with:

```ts
import { z } from 'zod';

/** An optional secret-bearing setting: empty means "not set", and errors never echo the value. */
function optionalSetting(pattern: RegExp, message: string) {
  return z
    .string()
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || pattern.test(value), { message });
}

function isOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    APP_VERSION: z.string().min(1).default('0.0.0-dev'),
    // The web app's origin: links in emails, the Google redirect URI and the origin check.
    APP_ORIGIN: z
      .string()
      .refine(isOrigin, {
        message:
          'APP_ORIGIN must be an origin such as https://ancestorstree.netlify.app (no path, no trailing slash)',
      })
      .default('http://localhost:5173'),
    // Proxies in front of the API: 0 locally, 2 on Render behind the Netlify proxy.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // Interactive docs at /api/docs; on by default outside production.
    API_DOCS: z.enum(['on', 'off']).optional(),
    MONGODB_URI: optionalSetting(
      /^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/,
      'MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string that names a database (…mongodb.net/ancestors-tree-dev?…)',
    ),
    JWT_SECRET: optionalSetting(
      /^\S{32,}$/,
      'JWT_SECRET must be at least 32 characters without spaces (generate one with: openssl rand -base64 48)',
    ),
    GOOGLE_CLIENT_ID: optionalSetting(
      /^[\w.-]+\.apps\.googleusercontent\.com$/,
      'GOOGLE_CLIENT_ID must end with .apps.googleusercontent.com (Google Cloud → APIs & Services → Credentials)',
    ),
    GOOGLE_CLIENT_SECRET: optionalSetting(
      /^\S{6,}$/,
      'GOOGLE_CLIENT_SECRET must be the client secret of the same OAuth client',
    ),
    RESEND_API_KEY: optionalSetting(/^re_\w+$/, 'RESEND_API_KEY must start with re_ (Resend → API Keys)'),
    MAIL_FROM: z.string().trim().min(3).default('AncestorsTree <onboarding@resend.dev>'),
    // Used from P6 (photo upload) on; optional until then.
    CLOUDINARY_URL: optionalSetting(
      /^cloudinary:\/\/[^:@/]+:[^@/]+@[\w-]+$/,
      'CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name> (copy "API environment variable" from the Cloudinary dashboard)',
    ),
    CLOUDINARY_FOLDER: z
      .string()
      .regex(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/, {
        message:
          'CLOUDINARY_FOLDER must be lowercase path segments without leading or trailing slashes (ancestors-tree/dev)',
      })
      .default('ancestors-tree/dev'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'test') {
      for (const key of ['MONGODB_URI', 'JWT_SECRET'] as const) {
        if (env[key] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required (see apps/api/.env.example)`,
          });
        }
      }
    }
    if ((env.GOOGLE_CLIENT_ID === undefined) !== (env.GOOGLE_CLIENT_SECRET === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CLIENT_SECRET'],
        message: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together, or neither',
      });
    }
  });

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** For settings the schema guarantees outside tests (MONGODB_URI, JWT_SECRET). */
export function requireSetting<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`${name} is not set`);
  return value;
}

export function apiDocsEnabled(config: Config): boolean {
  return config.API_DOCS ? config.API_DOCS === 'on' : config.NODE_ENV !== 'production';
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm vitest run apps/api/src/config.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 6: Document the new settings**

Replace `apps/api/.env.example` with:

```bash
# Copy to apps/api/.env for local development. Never commit the real file.
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
APP_VERSION=0.0.0-dev

# The web app's origin: links in emails, the Google redirect URI and the cross-site check.
APP_ORIGIN=http://localhost:5173

# Required outside tests. Database name after the host: ancestors-tree-dev locally.
MONGODB_URI=

# Required outside tests: signs the 15-minute access tokens.
# Generate one with: openssl rand -base64 48
JWT_SECRET=

# Optional: Google sign-in. Google Cloud → APIs & Services → Credentials → OAuth client ID
# (Web application). Authorized redirect URI for local development:
# http://localhost:5173/api/auth/google/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Optional: send emails (password reset) with Resend. Without a key, development writes the
# email (including the reset link) to the server log.
RESEND_API_KEY=
MAIL_FROM=AncestorsTree <onboarding@resend.dev>

# Number of proxies in front of the API: 0 locally, 2 on Render behind the Netlify proxy.
TRUST_PROXY_HOPS=0

# Interactive API docs at /api/docs: on by default outside production.
# API_DOCS=on

# Used from P6 (photo upload) on.
CLOUDINARY_URL=
CLOUDINARY_FOLDER=ancestors-tree/dev
```

Keep any explanatory comment lines the current file has for `MONGODB_URI` and `CLOUDINARY_URL` if they say more than the lines above; the variable names and order must match.

- [ ] **Step 7: Add the production settings to `render.yaml`**

In `render.yaml`, replace the `envVars:` list with:

```yaml
    envVars:
      - key: LOG_LEVEL
        value: info
      - key: APP_VERSION
        value: 0.1.0
      - key: APP_ORIGIN
        value: https://ancestorstree.netlify.app
      # Netlify proxy + Render load balancer. Verify req.ip in the P8 deploy review.
      - key: TRUST_PROXY_HOPS
        value: '2'
      - key: MAIL_FROM
        value: AncestorsTree <onboarding@resend.dev>
      - key: CLOUDINARY_FOLDER
        value: ancestors-tree/prod
      # Generated once by Render; rotating it signs everyone out.
      - key: JWT_SECRET
        generateValue: true
      # Secrets: entered in the Render dashboard (Environment), never committed.
      - key: MONGODB_URI
        sync: false
      - key: GOOGLE_CLIENT_ID
        sync: false
      - key: GOOGLE_CLIENT_SECRET
        sync: false
      - key: RESEND_API_KEY
        sync: false
      - key: CLOUDINARY_URL
        sync: false
```

- [ ] **Step 8: Run the full check and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/config.ts apps/api/src/config.test.ts apps/api/.env.example render.yaml
git commit -m "feat(api): add P3 dependencies and validated auth settings"
```

> Controller: after this task, ask the user to add `JWT_SECRET` to `apps/api/.env` (Human step 1) before anyone runs `pnpm dev`.

---

### Task 2: Database connection, test database and health

**Files:**
- Create: `apps/api/src/db/connect.ts`
- Test: `apps/api/src/db/connect.test.ts`
- Create: `apps/api/src/test/globalSetup.ts`, `apps/api/src/test/database.ts`
- Modify: `apps/api/vitest.config.ts`
- Modify: `packages/shared/src/api/health.ts`, `packages/shared/src/api/health.test.ts`
- Modify: `apps/api/src/routes/health.ts`, `apps/api/src/app.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/web/src/features/system/ServerStatus.tsx`, `ServerStatus.test.tsx`, `apps/web/src/locales/{vi,en}.json`, `e2e/design-system.spec.ts`

**Interfaces:**
- Produces: `connectDatabase(uri: string, options?: { dbName?: string }): Promise<void>`, `databaseState(): DatabaseState`, `disconnectDatabase(): Promise<void>`, `type DatabaseState = 'connected' | 'connecting' | 'disconnected'`.
- Produces (tests): `useTestDatabase(): void` — call at the top level of a test file; it connects to a fresh database before the file, empties every collection before each test, and drops the database after the file. `inject('mongoUri')` is typed.
- Produces (shared): `HealthResponseSchema` gains `database: 'connected' | 'connecting' | 'disconnected'`.

- [ ] **Step 1: Start one replica set per test run**

Create `apps/api/src/test/globalSetup.ts`:

```ts
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

/**
 * One in-memory replica set for the whole API test run (a replica set, so transactions work
 * as on Atlas). Each test file uses its own database on it (see useTestDatabase).
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  project.provide('mongoUri', replSet.getUri());
  return async () => {
    await replSet.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
```

Replace `apps/api/vitest.config.ts` with:

```ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/test/globalSetup.ts'],
    // The first run downloads the MongoDB binary.
    hookTimeout: 120_000,
    testTimeout: 20_000,
  },
});
```

- [ ] **Step 2: Write the database helper for tests**

Create `apps/api/src/test/database.ts`:

```ts
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../db/connect.ts';

/** Gives the calling test file its own empty database on the shared in-memory replica set. */
export function useTestDatabase(): void {
  beforeAll(async () => {
    await connectDatabase(inject('mongoUri'), { dbName: `test-${randomUUID()}` });
    // Build unique indexes before any test relies on them.
    await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
  });

  beforeEach(async () => {
    await Promise.all(
      Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
    );
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  });
}
```

- [ ] **Step 3: Write the failing connection test**

Create `apps/api/src/db/connect.test.ts`:

```ts
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../test/database.ts';
import { databaseState } from './connect.ts';

useTestDatabase();

describe('database connection', () => {
  it('reports a live connection', () => {
    expect(databaseState()).toBe('connected');
  });

  it('runs transactions (replica set)', async () => {
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await mongoose.connection.collection('probe').insertOne({ ok: true }, { session });
    });
    await session.endSession();
    expect(await mongoose.connection.collection('probe').countDocuments()).toBe(1);
  });
});
```

Run: `pnpm vitest run apps/api/src/db/connect.test.ts`
Expected: FAIL (`./connect.ts` does not exist). The first run also downloads the MongoDB binary.

- [ ] **Step 4: Write the connection module**

Create `apps/api/src/db/connect.ts`:

```ts
import mongoose from 'mongoose';

export type DatabaseState = 'connected' | 'connecting' | 'disconnected';

/** Connects the shared Mongoose connection; fails fast when the cluster cannot be reached. */
export async function connectDatabase(uri: string, options: { dbName?: string } = {}): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    ...(options.dbName ? { dbName: options.dbName } : {}),
  });
}

export function databaseState(): DatabaseState {
  // Mongoose ready states: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting.
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    default:
      return 'disconnected';
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
```

Run: `pnpm vitest run apps/api/src/db/connect.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Report the database in the health response (shared)**

Replace `packages/shared/src/api/health.ts` with:

```ts
import { z } from 'zod';

export const DatabaseStateSchema = z.enum(['connected', 'connecting', 'disconnected']);

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string().min(1),
  uptimeSeconds: z.number().nonnegative(),
  database: DatabaseStateSchema,
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
```

In `packages/shared/src/api/health.test.ts`, add `database: 'connected'` to both test objects, and add:

```ts
  it('rejects an unknown database state', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'ok',
      version: '1',
      uptimeSeconds: 1,
      database: 'sleeping',
    });
    expect(result.success).toBe(false);
  });
```

In `packages/shared/src/index.ts`, change the health export line to:

```ts
export { DatabaseStateSchema, HealthResponseSchema, type HealthResponse } from './api/health.ts';
```

- [ ] **Step 6: Report it from the API**

In `apps/api/src/routes/health.ts`, add `import { databaseState } from '../db/connect.ts';` and add `database: databaseState(),` after `uptimeSeconds` in the response body.

In `apps/api/src/app.test.ts`, extend the first test:

```ts
    expect(body.database).toBe('disconnected');
```

(No database is connected in that file.)

Run: `pnpm vitest run apps/api packages/shared`
Expected: PASS.

- [ ] **Step 7: Show a database problem in the web footer**

In `apps/web/src/locales/vi.json`, inside `system.serverStatus`, add after `"ok"`:

```json
      "databaseDown": "Máy chủ đang chạy (phiên bản {{version}}) nhưng chưa kết nối được cơ sở dữ liệu",
```

In `apps/web/src/locales/en.json`, same place:

```json
      "databaseDown": "The server is running (version {{version}}) but cannot reach the database",
```

In `apps/web/src/features/system/ServerStatus.test.tsx`, add `database: 'connected'` to the `healthy()` JSON body, and add this test inside the existing `describe`:

```tsx
  it('warns when the server cannot reach the database', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              status: 'ok',
              version: '1.4.0',
              uptimeSeconds: 12,
              database: 'disconnected',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    renderWithProviders(<ServerStatus />);
    const status = await screen.findByText(
      'Máy chủ đang chạy (phiên bản 1.4.0) nhưng chưa kết nối được cơ sở dữ liệu',
    );
    expect(status).toHaveAttribute('data-state', 'degraded');
  });
```

(Use the imports the file already has: `renderWithProviders`, `screen`, `vi`. If it renders through another helper, use that helper the same way the other tests do.)

Run: `pnpm vitest run apps/web/src/features/system`
Expected: FAIL on the new test.

In `apps/web/src/features/system/ServerStatus.tsx`:
- change the state type to `type ServerState = 'checking' | 'error' | 'degraded' | 'ok';`
- add `degraded: 'bg-stamp',` to `DOT`;
- replace the success branch with:

```tsx
  if (health.isSuccess) {
    if (health.data.database === 'connected') {
      state = 'ok';
      message = t('system.serverStatus.ok', { version: health.data.version });
    } else {
      state = 'degraded';
      message = t('system.serverStatus.databaseDown', { version: health.data.version });
    }
  } else if (health.isError && !health.isFetching) {
```

Run: `pnpm vitest run apps/web/src/features/system`
Expected: PASS.

In `e2e/design-system.spec.ts`, change the mocked health JSON to:

```ts
    route.fulfill({
      json: { status: 'ok', version: '0.1.0', uptimeSeconds: 1, database: 'connected' },
    }),
```

- [ ] **Step 8: Connect on startup, shut down gracefully, redact cookies in logs**

Replace `apps/api/src/server.ts` with:

```ts
import { pino } from 'pino';
import { createApp } from './app.ts';
import { loadConfig, requireSetting } from './config.ts';
import { connectDatabase, disconnectDatabase } from './db/connect.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig();
const logger = pino({
  level: config.LOG_LEVEL,
  // Session cookies are credentials: never write them to the logs.
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    censor: '[redacted]',
  },
});

try {
  await connectDatabase(requireSetting(config.MONGODB_URI, 'MONGODB_URI'));
} catch (error) {
  // Only the error name: driver messages can include parts of the connection string.
  logger.fatal(
    { errorName: (error as Error).name },
    'Could not connect to MongoDB (check MONGODB_URI and Atlas network access)',
  );
  process.exit(1);
}

const { app } = createApp({
  logger,
  version: config.APP_VERSION,
  validateResponses: config.NODE_ENV !== 'production',
  httpLogging: config.NODE_ENV !== 'test',
});

const server = app.listen(config.PORT);

server.on('listening', () => {
  logger.info(`API listening on http://localhost:${config.PORT}`);
});

server.on('error', (error) => {
  logger.fatal({ err: error }, 'Could not start the HTTP server');
  process.exit(1);
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Shutting down');
  const forceExit = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();
  server.close((closeError) => {
    disconnectDatabase()
      .catch((error: unknown) => logger.error({ err: error }, 'Could not close MongoDB'))
      .finally(() => process.exit(closeError ? 1 : 0));
  });
  server.closeIdleConnections();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
```

(`createApp`'s options change in Tasks 4–9; each of those tasks updates the `createApp({...})` call here.)

- [ ] **Step 9: Run the full check and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add apps/api packages/shared apps/web/src/features/system apps/web/src/locales e2e/design-system.spec.ts
git commit -m "feat(api): connect MongoDB, report it in health and shut down gracefully"
```

---

### Task 3: Shared contracts for accounts and clans

**Files:**
- Modify: `packages/shared/src/errors.ts`, `packages/shared/src/errors.test.ts`
- Create: `packages/shared/src/api/common.ts`, `packages/shared/src/api/auth.ts`, `packages/shared/src/api/clans.ts`
- Test: `packages/shared/src/api/auth.test.ts`, `packages/shared/src/api/clans.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/locales/{vi,en}.json` (error translations)
- Regenerate: `docs/error-codes.md`

**Interfaces:**
- Produces (errors): `INVALID_TOKEN` (400), `INVALID_CREDENTIALS` (401), `EMAIL_TAKEN` (409).
- Produces (`common.ts`): `IdSchema` (24 hex characters).
- Produces (`auth.ts`): `EmailSchema`, `PasswordSchema`, `DisplayNameSchema`, `LocaleSchema`, `ReturnToSchema`, `RegisterRequestSchema`, `LoginRequestSchema`, `ForgotPasswordRequestSchema`, `ResetPasswordRequestSchema`, `UpdateMeRequestSchema`, `CurrentUserSchema`, `AuthProvidersSchema`, and their `z.infer` types `RegisterRequest`, `LoginRequest`, `ForgotPasswordRequest`, `ResetPasswordRequest`, `UpdateMeRequest`, `CurrentUser`, `AuthProviders`, `Locale`.
- Produces (`clans.ts`): `ClanRoleSchema`, `InviteRoleSchema`, `CreateClanRequestSchema`, `UpdateClanRequestSchema`, `ClanSchema`, `ClanListSchema`, `MemberSchema`, `MemberListSchema`, `UpdateMemberRequestSchema`, `CreateInviteRequestSchema`, `InviteTokenSchema`, `InviteSchema`, `InviteListSchema`, `InvitePreviewSchema`, `AcceptInviteResponseSchema`, `hasRoleAtLeast(role, minimum)`, and types `ClanRole`, `InviteRole`, `Clan`, `Member`, `Invite`, `InvitePreview`, `AcceptInviteResponse`, `CreateClanRequest`, `UpdateClanRequest`.

- [ ] **Step 1: Write the failing error-code test**

In `packages/shared/src/errors.test.ts`, replace the expected list in "lists every code in a stable order" with:

```ts
    expect(ERROR_CODE_LIST).toEqual([
      'VALIDATION_ERROR',
      'INVALID_TOKEN',
      'UNAUTHENTICATED',
      'INVALID_CREDENTIALS',
      'FORBIDDEN',
      'NOT_FOUND',
      'EMAIL_TAKEN',
      'VERSION_CONFLICT',
      'RULE_VIOLATION',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
    ]);
```

Run: `pnpm vitest run packages/shared/src/errors.test.ts`
Expected: FAIL.

- [ ] **Step 2: Add the codes**

In `packages/shared/src/errors.ts`, insert into `ERROR_CODES` (keeping this order):

after `VALIDATION_ERROR`:

```ts
  INVALID_TOKEN: {
    status: 400,
    description: 'The link (password reset or invite) is wrong, has expired or was already used.',
    clientAction: 'Explain that the link no longer works and offer to get a new one.',
  },
```

after `UNAUTHENTICATED`:

```ts
  INVALID_CREDENTIALS: {
    status: 401,
    description: 'The email or password is wrong (the response never says which).',
    clientAction: 'Show the message on the sign-in form; do not redirect.',
  },
```

after `NOT_FOUND`:

```ts
  EMAIL_TAKEN: {
    status: 409,
    description: 'An account with this email already exists.',
    clientAction: 'Show the message next to the email field and offer sign-in or password reset.',
  },
```

Run: `pnpm vitest run packages/shared/src/errors.test.ts`
Expected: PASS.

Translate the codes. In `apps/web/src/locales/vi.json`, inside `"errors"`, add:

```json
    "INVALID_TOKEN": "Đường link này không dùng được nữa: link sai, đã hết hạn hoặc đã được dùng.",
    "INVALID_CREDENTIALS": "Email hoặc mật khẩu chưa đúng.",
    "EMAIL_TAKEN": "Email này đã có tài khoản. Hãy đăng nhập hoặc lấy lại mật khẩu.",
```

In `apps/web/src/locales/en.json`, inside `"errors"`, add:

```json
    "INVALID_TOKEN": "This link no longer works: it is wrong, expired or already used.",
    "INVALID_CREDENTIALS": "The email or password is wrong.",
    "EMAIL_TAKEN": "This email already has an account. Sign in or reset your password.",
```

Regenerate the error-code doc: `pnpm docs:errors`.

- [ ] **Step 3: Write the failing contract tests**

Create `packages/shared/src/api/auth.test.ts`:

```ts
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
    expect(tooLong.error?.issues[0]).toMatchObject({ code: 'custom', params: { reason: 'passwordTooLong' } });
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
```

Create `packages/shared/src/api/clans.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CreateClanRequestSchema,
  hasRoleAtLeast,
  InviteTokenSchema,
  MemberSchema,
  UpdateClanRequestSchema,
} from './clans.ts';

describe('clan contracts', () => {
  it('fills empty optional fields when creating a clan', () => {
    expect(CreateClanRequestSchema.parse({ name: ' Họ Nguyễn ' })).toEqual({
      name: 'Họ Nguyễn',
      hometown: '',
      description: '',
    });
    expect(CreateClanRequestSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('changes only the fields sent when updating a clan', () => {
    expect(UpdateClanRequestSchema.parse({ hometown: 'Nam Định' })).toEqual({
      hometown: 'Nam Định',
    });
    expect(UpdateClanRequestSchema.safeParse({}).success).toBe(false);
  });

  it('orders roles owner > editor > viewer', () => {
    expect(hasRoleAtLeast('owner', 'editor')).toBe(true);
    expect(hasRoleAtLeast('editor', 'editor')).toBe(true);
    expect(hasRoleAtLeast('viewer', 'editor')).toBe(false);
  });

  it('accepts 32-character URL-safe invite tokens only', () => {
    expect(InviteTokenSchema.safeParse('a'.repeat(32)).success).toBe(true);
    expect(InviteTokenSchema.safeParse('a'.repeat(31)).success).toBe(false);
    expect(InviteTokenSchema.safeParse(`${'a'.repeat(31)}/`).success).toBe(false);
  });

  it('allows a member without an email (hidden from non-owners)', () => {
    const member = {
      userId: '64b7f0c2a1b2c3d4e5f60718',
      name: 'Tuấn',
      role: 'viewer',
      joinedAt: '2026-11-13T08:00:00.000Z',
      isYou: false,
    };
    expect(MemberSchema.parse(member)).toEqual(member);
  });
});
```

Run: `pnpm vitest run packages/shared/src/api`
Expected: FAIL (modules do not exist).

- [ ] **Step 4: Write the contracts**

Create `packages/shared/src/api/common.ts`:

```ts
import { z } from 'zod';

/** A MongoDB ObjectId as 24 lowercase hex characters. */
export const IdSchema = z.string().regex(/^[a-f0-9]{24}$/, 'Must be a 24-character hex id');
```

Create `packages/shared/src/api/auth.ts`:

```ts
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
```

Create `packages/shared/src/api/clans.ts`:

```ts
import { z } from 'zod';
import { IdSchema } from './common.ts';

export const ClanRoleSchema = z.enum(['owner', 'editor', 'viewer']);
/** Roles an invite or a role change can grant; there is exactly one owner. */
export const InviteRoleSchema = z.enum(['editor', 'viewer']);

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 } as const;

export function hasRoleAtLeast(role: ClanRole, minimum: ClanRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

// No custom messages on form fields (see auth.ts).
const ClanNameSchema = z.string().trim().min(1).max(120);
const HometownSchema = z.string().trim().max(120);
const DescriptionSchema = z.string().trim().max(2000);
const DateTimeSchema = z.iso.datetime();

export const CreateClanRequestSchema = z.object({
  name: ClanNameSchema,
  hometown: HometownSchema.default(''),
  description: DescriptionSchema.default(''),
});

export const UpdateClanRequestSchema = z
  .object({
    name: ClanNameSchema.optional(),
    hometown: HometownSchema.optional(),
    description: DescriptionSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Send at least one field to change',
  });

export const ClanSchema = z.object({
  id: IdSchema,
  name: z.string(),
  hometown: z.string(),
  description: z.string(),
  /** The caller's role in this clan. */
  role: ClanRoleSchema,
  memberCount: z.number().int().min(1),
  createdAt: DateTimeSchema,
});
export const ClanListSchema = z.array(ClanSchema);

export const MemberSchema = z.object({
  userId: IdSchema,
  name: z.string(),
  /** Only for the clan owner, and for the member themself. */
  email: z.string().optional(),
  role: ClanRoleSchema,
  joinedAt: DateTimeSchema,
  isYou: z.boolean(),
});
export const MemberListSchema = z.array(MemberSchema);

export const UpdateMemberRequestSchema = z.object({ role: InviteRoleSchema });
export const CreateInviteRequestSchema = z.object({ role: InviteRoleSchema });

/** randomToken(24): 32 URL-safe base64 characters. */
export const InviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/, 'Not an invite token');

export const InviteSchema = z.object({
  id: IdSchema,
  token: InviteTokenSchema,
  role: InviteRoleSchema,
  createdByName: z.string(),
  createdAt: DateTimeSchema,
  expiresAt: DateTimeSchema,
});
export const InviteListSchema = z.array(InviteSchema);

export const InvitePreviewSchema = z.object({
  clanName: z.string(),
  role: InviteRoleSchema,
  invitedByName: z.string(),
  expiresAt: DateTimeSchema,
});

export const AcceptInviteResponseSchema = z.object({
  clanId: IdSchema,
  role: ClanRoleSchema,
  alreadyMember: z.boolean(),
});

export type ClanRole = z.infer<typeof ClanRoleSchema>;
export type InviteRole = z.infer<typeof InviteRoleSchema>;
export type CreateClanRequest = z.infer<typeof CreateClanRequestSchema>;
export type UpdateClanRequest = z.infer<typeof UpdateClanRequestSchema>;
export type Clan = z.infer<typeof ClanSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type Invite = z.infer<typeof InviteSchema>;
export type InvitePreview = z.infer<typeof InvitePreviewSchema>;
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponseSchema>;
```

Append to `packages/shared/src/index.ts`:

```ts
export { IdSchema } from './api/common.ts';
export {
  AuthProvidersSchema,
  CurrentUserSchema,
  DisplayNameSchema,
  EmailSchema,
  ForgotPasswordRequestSchema,
  LocaleSchema,
  LoginRequestSchema,
  PasswordSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
  ReturnToSchema,
  UpdateMeRequestSchema,
  type AuthProviders,
  type CurrentUser,
  type ForgotPasswordRequest,
  type Locale,
  type LoginRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
  type UpdateMeRequest,
} from './api/auth.ts';
export {
  AcceptInviteResponseSchema,
  ClanListSchema,
  ClanRoleSchema,
  ClanSchema,
  CreateClanRequestSchema,
  CreateInviteRequestSchema,
  hasRoleAtLeast,
  InviteListSchema,
  InvitePreviewSchema,
  InviteRoleSchema,
  InviteSchema,
  InviteTokenSchema,
  MemberListSchema,
  MemberSchema,
  UpdateClanRequestSchema,
  UpdateMemberRequestSchema,
  type AcceptInviteResponse,
  type Clan,
  type ClanRole,
  type CreateClanRequest,
  type Invite,
  type InvitePreview,
  type InviteRole,
  type Member,
  type UpdateClanRequest,
} from './api/clans.ts';
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm vitest run packages/shared apps/web/src/locales`
Expected: PASS.

- [ ] **Step 6: Run the full check and commit**

Run: `pnpm check`
Expected: PASS (`docs:errors:check` confirms the regenerated doc).

```bash
git add packages/shared apps/web/src/locales docs/error-codes.md
git commit -m "feat(shared): add account and clan contracts and three error codes"
```

---

### Task 4: Route registry v2

**Files:**
- Create: `apps/api/src/http/locals.ts`, `apps/api/src/auth/cookieNames.ts`
- Modify: `apps/api/src/http/routeRegistry.ts`
- Test: `apps/api/src/http/routeRegistry.test.ts` (rewrite)
- Modify: `apps/api/src/routes/health.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/app.test.ts`, `apps/api/src/openapi/openapi.test.ts`

**Interfaces:**
- Produces (`locals.ts`): `interface ClanMembership { clanId: string; userId: string; role: ClanRole }`, `interface RequestLocals { userId?: string; membership?: ClanMembership }`, `getLocals(res: Response): RequestLocals`.
- Produces (`cookieNames.ts`): `ACCESS_COOKIE = 'at'`, `REFRESH_COOKIE = 'rt'`, `GOOGLE_STATE_COOKIE = 'g_state'`.
- Produces (registry): `type Access = 'public' | 'signedIn' | { clanRole: ClanRole }`; `interface AccessPolicies { signedIn: RequestHandler[]; clanRole: (role: ClanRole) => RequestHandler[] }`; `type CookieInstruction`; `interface RouteResponse { description; schema?; redirect?: true }`; `type HandlerResult<R>`; `HandlerContext` with `params`, `query`, `body`, `req`, `userId(): string`, `membership(): ClanMembership`; `createRouteRegistry({ policies })` returning `{ router, openApi, routes, define }`; `assertSupportedPath(path)`.
- Changes: `createApp` no longer takes `validateResponses` (responses are always parsed).

- [ ] **Step 1: Add the locals and cookie names**

Create `apps/api/src/http/locals.ts`:

```ts
import type { ClanRole } from '@ancestors-tree/shared';
import type { Response } from 'express';

export interface ClanMembership {
  clanId: string;
  userId: string;
  role: ClanRole;
}

/** What access middleware stores on res.locals for the route handler. */
export interface RequestLocals {
  userId?: string;
  membership?: ClanMembership;
}

export function getLocals(res: Response): RequestLocals {
  return res.locals as RequestLocals;
}
```

Create `apps/api/src/auth/cookieNames.ts`:

```ts
/** Session cookies (spec §12). Values and options live in cookies.ts. */
export const ACCESS_COOKIE = 'at';
export const REFRESH_COOKIE = 'rt';
export const GOOGLE_STATE_COOKIE = 'g_state';
```

- [ ] **Step 2: Write the failing registry tests**

Replace `apps/api/src/http/routeRegistry.test.ts` with:

```ts
import express, { type RequestHandler } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildOpenApiDocument } from '../openapi/document.ts';
import { AppError } from './AppError.ts';
import { createErrorHandler } from './errorHandler.ts';
import { getLocals } from './locals.ts';
import {
  assertSupportedPath,
  createRouteRegistry,
  type AccessPolicies,
  type RouteRegistry,
} from './routeRegistry.ts';

const fakeSignIn: RequestHandler = (req, res, next) => {
  const userId = req.get('x-test-user');
  if (!userId) {
    next(new AppError('UNAUTHENTICATED', 'Sign in to continue'));
    return;
  }
  getLocals(res).userId = userId;
  next();
};

const policies: AccessPolicies = {
  signedIn: [fakeSignIn],
  clanRole: (role) => [
    fakeSignIn,
    (req, res, next) => {
      const locals = getLocals(res);
      locals.membership = { clanId: String(req.params.id), userId: locals.userId ?? '', role };
      next();
    },
  ],
};

function appWith(define: (api: RouteRegistry) => void) {
  const api = createRouteRegistry({ policies });
  define(api);
  const app = express();
  app.use(express.json());
  app.use(api.router);
  app.use(createErrorHandler(pino({ level: 'silent' })));
  return { app, api };
}

const ItemSchema = z.object({ id: z.string(), name: z.string() });

describe('route registry', () => {
  it('validates params, query and body', async () => {
    const { app } = appWith((api) =>
      api.define({
        method: 'post',
        path: '/items/:id',
        summary: 'Create',
        tags: ['Test'],
        access: 'public',
        request: {
          params: z.object({ id: z.string().length(3) }),
          query: z.object({ dryRun: z.enum(['yes', 'no']).optional() }),
          body: z.object({ name: z.string().min(1) }),
        },
        responses: { 201: { description: 'Created', schema: ItemSchema } },
        handler: ({ params, body }) => ({ status: 201, body: { id: params.id, name: body.name } }),
      }),
    );
    const bad = await request(app).post('/items/abcd?dryRun=maybe').send({ name: '' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const good = await request(app).post('/items/abc').send({ name: 'Lan' });
    expect(good.status).toBe(201);
    expect(good.body).toEqual({ id: 'abc', name: 'Lan' });
  });

  it('sends only the fields the response schema declares', async () => {
    const { app } = appWith((api) =>
      api.define({
        method: 'get',
        path: '/items/:id',
        summary: 'Read',
        tags: ['Test'],
        access: 'public',
        request: { params: z.object({ id: z.string() }) },
        responses: { 200: { description: 'Item', schema: ItemSchema } },
        handler: ({ params }) => {
          const stored = { id: params.id, name: 'Lan', passwordHash: 'secret-hash' };
          return { status: 200, body: stored };
        },
      }),
    );
    const response = await request(app).get('/items/a1');
    expect(response.body).toEqual({ id: 'a1', name: 'Lan' });
  });

  it('turns a response that breaks its schema into a 500', async () => {
    const { app } = appWith((api) =>
      api.define({
        method: 'get',
        path: '/broken',
        summary: 'Broken',
        tags: ['Test'],
        access: 'public',
        responses: { 200: { description: 'Item', schema: ItemSchema } },
        handler: () => ({ status: 200, body: { id: 'x' } as unknown as z.input<typeof ItemSchema> }),
      }),
    );
    const response = await request(app).get('/broken');
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('sets and clears cookies, and never on a failed response', async () => {
    const { app } = appWith((api) => {
      api.define({
        method: 'post',
        path: '/session',
        summary: 'Cookies',
        tags: ['Test'],
        access: 'public',
        responses: { 204: { description: 'Done' } },
        handler: () => ({
          status: 204,
          cookies: [
            { name: 'at', value: 'token-1', options: { httpOnly: true, path: '/api' } },
            { name: 'old', clear: true, options: { path: '/' } },
          ],
        }),
      });
      api.define({
        method: 'post',
        path: '/session-broken',
        summary: 'Broken cookies',
        tags: ['Test'],
        access: 'public',
        responses: { 200: { description: 'Item', schema: ItemSchema } },
        handler: () => ({
          status: 200,
          body: { id: 1 } as unknown as z.input<typeof ItemSchema>,
          cookies: [{ name: 'at', value: 'token-2', options: { path: '/api' } }],
        }),
      });
    });
    const ok = await request(app).post('/session');
    expect(ok.status).toBe(204);
    const cookies = ok.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('at=token-1;') && c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('old=;'))).toBe(true);

    const broken = await request(app).post('/session-broken');
    expect(broken.status).toBe(500);
    expect(broken.headers['set-cookie']).toBeUndefined();
  });

  it('redirects', async () => {
    const { app } = appWith((api) =>
      api.define({
        method: 'get',
        path: '/go',
        summary: 'Redirect',
        tags: ['Test'],
        access: 'public',
        responses: { 302: { description: 'To the app', redirect: true } },
        handler: () => ({ status: 302, redirect: '/clans' }),
      }),
    );
    const response = await request(app).get('/go');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/clans');
  });

  it('runs the access policy of each route', async () => {
    const { app } = appWith((api) => {
      api.define({
        method: 'get',
        path: '/me',
        summary: 'Me',
        tags: ['Test'],
        access: 'signedIn',
        responses: { 200: { description: 'Me', schema: z.object({ userId: z.string() }) } },
        handler: ({ userId }) => ({ status: 200, body: { userId: userId() } }),
      });
      api.define({
        method: 'get',
        path: '/clans/:id',
        summary: 'Clan',
        tags: ['Test'],
        access: { clanRole: 'editor' },
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: { description: 'Role', schema: z.object({ role: z.string(), clanId: z.string() }) },
        },
        handler: ({ membership }) => ({
          status: 200,
          body: { role: membership().role, clanId: membership().clanId },
        }),
      });
    });
    expect((await request(app).get('/me')).status).toBe(401);
    expect((await request(app).get('/me').set('x-test-user', 'u1')).body).toEqual({ userId: 'u1' });
    expect((await request(app).get('/clans/c1').set('x-test-user', 'u1')).body).toEqual({
      role: 'editor',
      clanId: 'c1',
    });
  });

  it('fails loudly when a public route reads the user', async () => {
    const { app } = appWith((api) =>
      api.define({
        method: 'get',
        path: '/oops',
        summary: 'Oops',
        tags: ['Test'],
        access: 'public',
        responses: { 200: { description: 'Me', schema: z.object({ userId: z.string() }) } },
        handler: ({ userId }) => ({ status: 200, body: { userId: userId() } }),
      }),
    );
    expect((await request(app).get('/oops')).status).toBe(500);
  });

  it('rejects an undeclared status', async () => {
    const { app } = appWith((api) =>
      api.define({
        method: 'get',
        path: '/teapot',
        summary: 'Teapot',
        tags: ['Test'],
        access: 'public',
        responses: { 200: { description: 'OK' } },
        handler: () => ({ status: 418 }) as unknown as { status: 200 },
      }),
    );
    expect((await request(app).get('/teapot')).status).toBe(500);
  });

  it('accepts only lowercase segments and :params in paths', () => {
    expect(() => assertSupportedPath('/clans/:id/members/:userId')).not.toThrow();
    for (const path of ['/files/*splat', '/a{/:b}', '/Upper', 'no-slash', '/trailing/']) {
      expect(() => assertSupportedPath(path), path).toThrow(/Unsupported route path/);
    }
  });

  it('detects duplicate routes even when parameter names differ', () => {
    expect(() =>
      appWith((api) => {
        const route = {
          method: 'get' as const,
          summary: 'Dup',
          tags: ['Test'],
          access: 'public' as const,
          responses: { 204: { description: 'Done' } },
          handler: () => ({ status: 204 as const }),
        };
        api.define({ ...route, path: '/clans/:id' });
        api.define({ ...route, path: '/clans/:clanId' });
      }),
    ).toThrow(/Route already defined: GET \/clans\/:clanId/);
  });

  it('documents the session cookie on protected routes only', () => {
    const { api } = appWith((api) => {
      api.define({
        method: 'get',
        path: '/open',
        summary: 'Open',
        tags: ['Test'],
        access: 'public',
        responses: { 204: { description: 'Done' } },
        handler: () => ({ status: 204 }),
      });
      api.define({
        method: 'get',
        path: '/clans/:id',
        summary: 'Clan',
        tags: ['Test'],
        access: { clanRole: 'owner' },
        request: { params: z.object({ id: z.string() }) },
        responses: { 204: { description: 'Done' } },
        handler: () => ({ status: 204 }),
      });
    });
    const document = buildOpenApiDocument(api.openApi, { version: 'test' });
    expect(document.components?.securitySchemes).toHaveProperty('sessionCookie');
    expect(document.paths?.['/open']?.get?.security).toBeUndefined();
    const clan = document.paths?.['/clans/{id}']?.get;
    expect(clan?.security).toEqual([{ sessionCookie: [] }]);
    expect(clan?.description).toMatch(/owner role/);
  });
});
```

Run: `pnpm vitest run apps/api/src/http/routeRegistry.test.ts`
Expected: FAIL (no `access`, `assertSupportedPath`, cookies or redirects yet).

- [ ] **Step 3: Rewrite the registry**

Replace `apps/api/src/http/routeRegistry.ts` with:

```ts
import { OpenAPIRegistry, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import { ApiErrorBodySchema, type ClanRole } from '@ancestors-tree/shared';
import { Router, type CookieOptions, type Request, type RequestHandler, type Response } from 'express';
import type { z } from 'zod';
import { ACCESS_COOKIE } from '../auth/cookieNames.ts';
import { AppError, zodIssuesToDetails } from './AppError.ts';
import { getLocals, type ClanMembership } from './locals.ts';

/**
 * The shared error schema, named so the OpenAPI generator emits it once under
 * components/schemas/ApiErrorBody and references it with $ref. Zod's native `.meta({ id })`
 * is used instead of `OpenAPIRegistry.register()`, which needs `extendZodWithOpenApi(z)` to run
 * before the schema is created — impossible here, because the shared package builds it first.
 */
const ErrorBodySchema = ApiErrorBodySchema.meta({ id: 'ApiErrorBody' });

const SECURITY_SCHEME = 'sessionCookie';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Who may call a route. Every route must say it explicitly. */
export type Access = 'public' | 'signedIn' | { clanRole: ClanRole };

/** The middleware that enforces each access level (built by createApp). */
export interface AccessPolicies {
  signedIn: RequestHandler[];
  /** Must also authenticate: it runs instead of `signedIn`, not after it. */
  clanRole: (role: ClanRole) => RequestHandler[];
}

export type CookieInstruction =
  | { name: string; value: string; options: CookieOptions }
  | { name: string; clear: true; options: CookieOptions };

export interface RouteResponse {
  description: string;
  schema?: z.ZodType;
  /** The handler returns `{ status, redirect }` for this status. */
  redirect?: true;
}

type Responses = Record<number, RouteResponse>;

interface ResultExtras {
  cookies?: CookieInstruction[];
}

type ResultFor<S extends number, R> = R extends { redirect: true }
  ? { status: S; redirect: string } & ResultExtras
  : R extends { schema: infer Schema extends z.ZodType }
    ? { status: S; body: z.input<Schema> } & ResultExtras
    : { status: S; body?: undefined } & ResultExtras;

/** One of the declared responses, with a body typed by that response's schema. */
export type HandlerResult<R extends Responses> = {
  [S in keyof R & number]: ResultFor<S, R[S]>;
}[keyof R & number];

interface AnyResult extends ResultExtras {
  status: number;
  body?: unknown;
  redirect?: string;
}

export interface HandlerContext<P, Q, B> {
  params: P;
  query: Q;
  body: B;
  /** Read-only access to the request (cookies, IP, headers). Handlers never write to `res`. */
  req: Request;
  /** The signed-in user's id. Throws on a public route (a programming error). */
  userId: () => string;
  /** The caller's membership of the clan in `:id`. Throws unless the route needs a clan role. */
  membership: () => ClanMembership;
}

export interface RouteDefinition<
  P extends z.ZodObject,
  Q extends z.ZodObject,
  B extends z.ZodType,
  R extends Responses,
> {
  method: HttpMethod;
  /** Express-style path relative to /api: lowercase segments and :params only. */
  path: string;
  summary: string;
  tags: string[];
  access: Access;
  request?: { params?: P; query?: Q; body?: B };
  responses: R;
  handler: (
    ctx: HandlerContext<z.output<P>, z.output<Q>, z.output<B>>,
  ) => HandlerResult<R> | Promise<HandlerResult<R>>;
}

export interface RegisteredRoute {
  method: HttpMethod;
  path: string;
  openApiPath: string;
}

export interface RouteRegistryOptions {
  policies: AccessPolicies;
}

type RequestPart = 'params' | 'query' | 'body';

const SEGMENT = '(?:[a-z0-9-]+|:[a-zA-Z][a-zA-Z0-9]*)';
const PATH_PATTERN = new RegExp(`^(?:/${SEGMENT})+$`);

/** Express 5 wildcards (`*splat`) and optional groups (`{…}`) are not supported. */
export function assertSupportedPath(path: string): void {
  if (!PATH_PATTERN.test(path)) {
    throw new Error(
      `Unsupported route path "${path}": use lowercase segments and :params only (no wildcards, optional groups or trailing slash)`,
    );
  }
}

export function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9]+)/g, '{$1}');
}

/** Two routes clash when they differ only in parameter names. */
function routeKey(method: HttpMethod, path: string): string {
  return `${method} ${path.replace(/:[A-Za-z0-9]+/g, ':')}`;
}

function parsePart(schema: z.ZodType | undefined, value: unknown, part: RequestPart): unknown {
  if (!schema) return part === 'body' ? undefined : {};
  const parsed = schema.safeParse(value ?? {});
  if (!parsed.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Invalid request ${part}`,
      zodIssuesToDetails(parsed.error.issues, part),
    );
  }
  return parsed.data;
}

function accessMiddleware(access: Access, policies: AccessPolicies): RequestHandler[] {
  if (access === 'public') return [];
  if (access === 'signedIn') return policies.signedIn;
  return policies.clanRole(access.clanRole);
}

function describeAccess(access: Access): string | undefined {
  if (access === 'public') return undefined;
  if (access === 'signedIn') return 'Requires a signed-in user.';
  return `Requires the ${access.clanRole} role (or higher) in the clan.`;
}

function toOpenApiResponses(responses: Responses): RouteConfig['responses'] {
  const documented: RouteConfig['responses'] = {};
  for (const [status, response] of Object.entries(responses)) {
    documented[status] = {
      description: response.description,
      ...(response.schema ? { content: { 'application/json': { schema: response.schema } } } : {}),
    };
  }
  documented.default = {
    description: 'Error response (see docs/error-codes.md)',
    content: { 'application/json': { schema: ErrorBodySchema } },
  };
  return documented;
}

/** Validates the result first, then sets cookies, then sends: a failed response sets no cookie. */
function sendResult(res: Response, label: string, responses: Responses, result: AnyResult): void {
  const declared = responses[result.status];
  if (!declared) throw new Error(`${label} returned undeclared status ${result.status}`);

  let payload: unknown;
  if (declared.redirect) {
    if (typeof result.redirect !== 'string') {
      throw new Error(`${label} must return a redirect URL for status ${result.status}`);
    }
  } else if (declared.schema) {
    // Always parse: the client receives only the fields the schema declares.
    const parsed = declared.schema.safeParse(result.body);
    if (!parsed.success) {
      throw new Error(`${label} response does not match its schema: ${parsed.error.message}`);
    }
    payload = parsed.data;
  }

  for (const cookie of result.cookies ?? []) {
    if ('clear' in cookie) res.clearCookie(cookie.name, cookie.options);
    else res.cookie(cookie.name, cookie.value, cookie.options);
  }

  if (declared.redirect) res.redirect(result.status, result.redirect as string);
  else if (declared.schema) res.status(result.status).json(payload);
  else res.status(result.status).end();
}

export function createRouteRegistry(options: RouteRegistryOptions) {
  const router = Router();
  const openApi = new OpenAPIRegistry();
  const routes: RegisteredRoute[] = [];
  const keys = new Set<string>();

  openApi.registerComponent('securitySchemes', SECURITY_SCHEME, {
    type: 'apiKey',
    in: 'cookie',
    name: ACCESS_COOKIE,
  });

  function define<
    P extends z.ZodObject,
    Q extends z.ZodObject,
    B extends z.ZodType,
    const R extends Responses,
  >(route: RouteDefinition<P, Q, B, R>): void {
    const label = `${route.method.toUpperCase()} ${route.path}`;
    assertSupportedPath(route.path);
    const key = routeKey(route.method, route.path);
    if (keys.has(key)) throw new Error(`Route already defined: ${label}`);
    keys.add(key);

    const openApiPath = toOpenApiPath(route.path);
    routes.push({ method: route.method, path: route.path, openApiPath });

    const { params, query, body } = route.request ?? {};
    const description = describeAccess(route.access);
    openApi.registerPath({
      method: route.method,
      path: openApiPath,
      summary: route.summary,
      tags: route.tags,
      ...(description ? { description, security: [{ [SECURITY_SCHEME]: [] }] } : {}),
      request: {
        ...(params ? { params } : {}),
        ...(query ? { query } : {}),
        ...(body
          ? { body: { required: true, content: { 'application/json': { schema: body } } } }
          : {}),
      },
      responses: toOpenApiResponses(route.responses),
    });

    router[route.method](
      route.path,
      ...accessMiddleware(route.access, options.policies),
      async (req: Request, res: Response) => {
        const locals = getLocals(res);
        const result = await route.handler({
          params: parsePart(params, req.params, 'params') as z.output<P>,
          query: parsePart(query, req.query, 'query') as z.output<Q>,
          body: parsePart(body, req.body, 'body') as z.output<B>,
          req,
          userId: () => {
            if (!locals.userId) throw new Error(`${label} reads the user but is not protected`);
            return locals.userId;
          },
          membership: () => {
            if (!locals.membership) {
              throw new Error(`${label} reads a membership but does not require a clan role`);
            }
            return locals.membership;
          },
        });
        sendResult(res, label, route.responses, result as AnyResult);
      },
    );
  }

  return { router, openApi, routes: routes as readonly RegisteredRoute[], define };
}

export type RouteRegistry = ReturnType<typeof createRouteRegistry>;
```

Run: `pnpm vitest run apps/api/src/http/routeRegistry.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 4: Update the health route and the app**

In `apps/api/src/routes/health.ts`, add `access: 'public',` after `tags: ['System'],`.

In `apps/api/src/app.ts`:
- remove `validateResponses` from `AppOptions`;
- add `import type { RequestHandler } from 'express';` (merge with the existing express import);
- add, above `createApp`:

```ts
/** Replaced in Task 6 (signedIn) and Task 10 (clan roles); until then nothing is protected. */
const notConfigured: RequestHandler = (_req, _res, next) => {
  next(new Error('Access policies are not configured yet'));
};
```

- create the registry with `createRouteRegistry({ policies: { signedIn: [notConfigured], clanRole: () => [notConfigured] } })`.

In `apps/api/src/server.ts`, `apps/api/src/app.test.ts` and `apps/api/src/openapi/openapi.test.ts`, delete the `validateResponses` option from every `createApp({...})` call.

- [ ] **Step 5: Run the full check and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add apps/api/src
git commit -m "feat(api): route registry with access levels, typed results, cookies and redirects"
```

---

### Task 5: HTTP hardening

**Files:**
- Create: `apps/api/src/http/originCheck.ts`, `apps/api/src/http/rateLimits.ts`
- Test: `apps/api/src/http/originCheck.test.ts`, `apps/api/src/http/rateLimits.test.ts`
- Create: `apps/api/src/test/app.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/app.test.ts`, `apps/api/src/openapi/openapi.test.ts`

**Interfaces:**
- Consumes: `AppError` (`http/AppError.ts`), `getLocals` (Task 4), `apiDocsEnabled(config)` (Task 1).
- Produces: `createOriginCheck(appOrigin: string): RequestHandler`; `AUTH_RATE_LIMITED_PATHS`; `createAuthRateLimit(limit: number): RequestHandler`; `createUserRateLimit(limit: number): RequestHandler`.
- Produces: `AppOptions` = `{ logger: Logger; version: string; httpLogging: boolean; appOrigin: string; trustProxyHops: number; apiDocs: boolean; rateLimits: { auth: number; user: number } }`.
- Produces (tests): `TEST_ORIGIN = 'http://localhost:5173'`, `testAppOptions(overrides?: Partial<AppOptions>): AppOptions`, `createTestApp(overrides?: Partial<AppOptions>): CreatedApp`. Later tasks add fields to `testAppOptions`; every API test builds its app through `createTestApp`.

- [ ] **Step 1: Write the failing origin-check test**

Create `apps/api/src/http/originCheck.test.ts`:

```ts
import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from './errorHandler.ts';
import { createOriginCheck } from './originCheck.ts';

const APP_ORIGIN = 'https://app.example.test';

function appWithCheck() {
  const app = express();
  app.use(createOriginCheck(APP_ORIGIN));
  app.all('/thing', (_req, res) => {
    res.status(204).end();
  });
  app.use(createErrorHandler(pino({ level: 'silent' })));
  return app;
}

describe('origin check', () => {
  it('lets reads through from any origin', async () => {
    const response = await request(appWithCheck()).get('/thing').set('Origin', 'https://evil.example.test');
    expect(response.status).toBe(204);
  });

  it('lets writes through from the web app and from clients that send no Origin', async () => {
    const app = appWithCheck();
    expect((await request(app).post('/thing').set('Origin', APP_ORIGIN)).status).toBe(204);
    expect((await request(app).delete('/thing')).status).toBe(204);
  });

  it('blocks writes from any other origin', async () => {
    const app = appWithCheck();
    for (const origin of ['https://evil.example.test', 'null', 'https://app.example.test.evil.test']) {
      const response = await request(app).post('/thing').set('Origin', origin);
      expect(response.status, origin).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
  });
});
```

Run: `pnpm vitest run apps/api/src/http/originCheck.test.ts`
Expected: FAIL (`./originCheck.ts` does not exist).

- [ ] **Step 2: Write the origin check**

Create `apps/api/src/http/originCheck.ts`:

```ts
import type { RequestHandler } from 'express';
import { AppError } from './AppError.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Blocks cross-site writes, on top of SameSite=Lax cookies (spec §12). Browsers always send
 * `Origin` on a cross-site POST/PUT/PATCH/DELETE, so a write from any origin other than the web
 * app is rejected. Requests without `Origin` (curl, server-to-server) are not browser requests
 * and carry no cookies by accident.
 */
export function createOriginCheck(appOrigin: string): RequestHandler {
  return (req, _res, next) => {
    const origin = req.get('origin');
    if (SAFE_METHODS.has(req.method) || origin === undefined || origin === appOrigin) {
      next();
      return;
    }
    next(new AppError('FORBIDDEN', 'Cross-site request blocked'));
  };
}
```

Run: `pnpm vitest run apps/api/src/http/originCheck.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Write the failing rate-limit test**

Create `apps/api/src/http/rateLimits.test.ts`:

```ts
import express, { type RequestHandler } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from './errorHandler.ts';
import { getLocals } from './locals.ts';
import { createAuthRateLimit, createUserRateLimit } from './rateLimits.ts';

const ok: RequestHandler = (_req, res) => {
  res.status(204).end();
};

function finish(app: express.Express) {
  app.use(createErrorHandler(pino({ level: 'silent' })));
  return app;
}

describe('auth rate limit', () => {
  it('allows `limit` attempts per minute per IP and endpoint, then answers 429', async () => {
    const app = express();
    app.use(['/login', '/register'], createAuthRateLimit(2));
    app.post(['/login', '/register'], ok);
    finish(app);

    expect((await request(app).post('/login')).status).toBe(204);
    expect((await request(app).post('/login')).status).toBe(204);
    const blocked = await request(app).post('/login');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['ratelimit-policy']).toBeDefined();
    // Another endpoint has its own budget.
    expect((await request(app).post('/register')).status).toBe(204);
  });
});

describe('user rate limit', () => {
  it('counts requests per signed-in user', async () => {
    const app = express();
    app.use((req, res, next) => {
      getLocals(res).userId = req.get('x-test-user');
      next();
    });
    app.use(createUserRateLimit(1));
    app.get('/me', ok);
    finish(app);

    expect((await request(app).get('/me').set('x-test-user', 'a')).status).toBe(204);
    expect((await request(app).get('/me').set('x-test-user', 'a')).status).toBe(429);
    expect((await request(app).get('/me').set('x-test-user', 'b')).status).toBe(204);
  });
});
```

Run: `pnpm vitest run apps/api/src/http/rateLimits.test.ts`
Expected: FAIL (`./rateLimits.ts` does not exist).

- [ ] **Step 4: Write the rate limits**

Create `apps/api/src/http/rateLimits.ts`:

```ts
import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError } from './AppError.ts';
import { getLocals } from './locals.ts';

const ONE_MINUTE_MS = 60_000;

/** Sign-in and account-recovery endpoints, limited per IP (spec §12). */
export const AUTH_RATE_LIMITED_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

/** Per IP and per endpoint, so a few wrong passwords do not also block a password reset. */
export function createAuthRateLimit(limit: number): RequestHandler {
  return rateLimit({
    windowMs: ONE_MINUTE_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // ipKeyGenerator groups IPv6 addresses by /56, so one client cannot rotate addresses.
    keyGenerator: (req) => `${req.baseUrl} ${ipKeyGenerator(req.ip ?? '')}`,
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMITED', 'Too many attempts. Wait a minute and try again.'));
    },
  });
}

/** Per signed-in user; runs after requireAuth, which sets res.locals.userId. */
export function createUserRateLimit(limit: number): RequestHandler {
  return rateLimit({
    windowMs: ONE_MINUTE_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req, res) => getLocals(res).userId ?? ipKeyGenerator(req.ip ?? ''),
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMITED', 'Too many requests. Wait a minute and try again.'));
    },
  });
}
```

Run: `pnpm vitest run apps/api/src/http/rateLimits.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the test app helper**

Create `apps/api/src/test/app.ts`:

```ts
import { pino } from 'pino';
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
    ...overrides,
  };
}

export function createTestApp(overrides: Partial<AppOptions> = {}): CreatedApp {
  return createApp(testAppOptions(overrides));
}
```

- [ ] **Step 6: Write the failing app tests**

In `apps/api/src/app.test.ts`, build the app with `createTestApp()` from `./test/app.ts` (remove the local `createApp({...})` call and the `pino` import if unused), and add:

```ts
  it('blocks cross-site writes before routing', async () => {
    const response = await request(createTestApp().app)
      .post('/api/health')
      .set('Origin', 'https://evil.example.test');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('limits sign-in attempts per IP', async () => {
    const { app } = createTestApp({ rateLimits: { auth: 2, user: 1000 } });
    await request(app).post('/api/auth/login');
    await request(app).post('/api/auth/login');
    const response = await request(app).post('/api/auth/login');
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });

  it('trusts the configured number of proxies', () => {
    expect(createTestApp({ trustProxyHops: 2 }).app.get('trust proxy')).toBe(2);
  });

  it('serves the API docs only when enabled', async () => {
    expect((await request(createTestApp({ apiDocs: false }).app).get('/api/docs')).status).toBe(404);
  });
```

In `apps/api/src/openapi/openapi.test.ts`, replace the `createApp({...})` call with `const { app, api, openApiDocument } = createTestApp();` (import from `../test/app.ts`; drop the `pino` and `createApp` imports).

Run: `pnpm vitest run apps/api`
Expected: FAIL (`createApp` does not accept the new options yet; the new tests fail).

- [ ] **Step 7: Wire the hardening into the app**

Replace `apps/api/src/app.ts` with:

```ts
import { apiReference } from '@scalar/express-api-reference';
import cookieParser from 'cookie-parser';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { createErrorHandler } from './http/errorHandler.ts';
import { notFoundHandler } from './http/notFound.ts';
import { createOriginCheck } from './http/originCheck.ts';
import { AUTH_RATE_LIMITED_PATHS, createAuthRateLimit } from './http/rateLimits.ts';
import { createRouteRegistry, type RouteRegistry } from './http/routeRegistry.ts';
import { buildOpenApiDocument, type OpenApiDocument } from './openapi/document.ts';
import { registerHealthRoutes } from './routes/health.ts';

/** Pinned so a CDN release cannot change the page that runs next to the API. */
const SCALAR_CDN = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.78.1';

export interface AppOptions {
  logger: Logger;
  version: string;
  httpLogging: boolean;
  /** The web app's origin (APP_ORIGIN): the only origin allowed to send writes. */
  appOrigin: string;
  /** Proxies in front of the API (TRUST_PROXY_HOPS), so req.ip is the client's address. */
  trustProxyHops: number;
  /** Serve the interactive reference at /api/docs (see apiDocsEnabled). */
  apiDocs: boolean;
  /** Requests per minute: `auth` per IP and endpoint, `user` per signed-in user. */
  rateLimits: { auth: number; user: number };
}

export interface CreatedApp {
  app: Express;
  api: RouteRegistry;
  openApiDocument: OpenApiDocument;
}

/** Replaced in Task 7 (signedIn) and Task 10 (clan roles); until then nothing is protected. */
const notConfigured: RequestHandler = (_req, _res, next) => {
  next(new Error('Access policies are not configured yet'));
};

export function createApp(options: AppOptions): CreatedApp {
  const api = createRouteRegistry({
    policies: { signedIn: [notConfigured], clanRole: () => [notConfigured] },
  });
  registerHealthRoutes(api, { version: options.version });
  const openApiDocument = buildOpenApiDocument(api.openApi, { version: options.version });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxyHops);
  if (options.apiDocs) {
    // Mounted before helmet: the Scalar page loads its script from a CDN, which helmet's CSP
    // would block. Off in production by default, so it never runs next to real sessions.
    app.use('/api/docs', apiReference({ url: '/api/openapi.json', cdn: SCALAR_CDN }));
  }
  app.use(helmet());
  if (options.httpLogging) app.use(pinoHttp({ logger: options.logger }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createOriginCheck(options.appOrigin));
  app.use(AUTH_RATE_LIMITED_PATHS, createAuthRateLimit(options.rateLimits.auth));
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/api', api.router);
  app.use(notFoundHandler);
  app.use(createErrorHandler(options.logger));

  return { app, api, openApiDocument };
}
```

In `apps/api/src/server.ts`, add `apiDocsEnabled` to the `./config.ts` import and replace the `createApp({...})` call with:

```ts
const { app } = createApp({
  logger,
  version: config.APP_VERSION,
  httpLogging: config.NODE_ENV !== 'test',
  appOrigin: config.APP_ORIGIN,
  trustProxyHops: config.TRUST_PROXY_HOPS,
  apiDocs: apiDocsEnabled(config),
  rateLimits: { auth: 5, user: 300 },
});
```

- [ ] **Step 8: Run the tests and watch them pass**

Run: `pnpm vitest run apps/api`
Expected: PASS.

- [ ] **Step 9: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/api/src
git commit -m "feat(api): cookie parsing, origin check, rate limits, trust proxy and docs switch"
```

---

### Task 6: Users, passwords, tokens and sessions

**Files:**
- Create: `apps/api/src/models/User.ts`, `apps/api/src/models/Session.ts`
- Create: `apps/api/src/auth/passwords.ts`, `apps/api/src/auth/tokens.ts`, `apps/api/src/auth/sessions.ts`, `apps/api/src/auth/cookies.ts`, `apps/api/src/auth/requireAuth.ts`
- Test: `apps/api/src/auth/passwords.test.ts`, `tokens.test.ts`, `sessions.test.ts`, `cookies.test.ts`, `requireAuth.test.ts`

**Interfaces:**
- Consumes: `ACCESS_COOKIE`, `REFRESH_COOKIE`, `GOOGLE_STATE_COOKIE` (Task 4), `CookieInstruction` (Task 4), `getLocals` (Task 4), `useTestDatabase` (Task 2).
- Produces (models): `User`, `type UserDocument`; `Session`.
- Produces (`passwords.ts`): `BCRYPT_COST = 12`; `interface Passwords { hash(password: string): Promise<string>; verify(password: string, hash: string | null | undefined): Promise<boolean> }`; `createPasswords(cost: number): Passwords`.
- Produces (`tokens.ts`): `ACCESS_TOKEN_TTL_SECONDS = 900`; `randomToken(bytes: number): string`; `hashToken(token: string): string`; `interface AccessTokens { sign(userId: string): Promise<string>; verify(token: string | undefined): Promise<string | undefined> }`; `createAccessTokens(secret: string): AccessTokens`.
- Produces (`sessions.ts`): `REFRESH_TOKEN_TTL_MS`, `CONCURRENT_REFRESH_WINDOW_MS = 10_000`; `type RotateResult`; `startSession(userId: string, now?: Date): Promise<string>`; `rotateSession(token: string, now?: Date): Promise<RotateResult>`; `revokeFamily(familyId: string, now?: Date)`; `revokeSessionOf(token: string, now?: Date)`; `revokeAllSessions(userId: string, now?: Date)`.
- Produces (`cookies.ts`): `GOOGLE_STATE_TTL_MS`; `readCookie(req: Request, name: string): string | undefined`; `sessionCookies({ accessToken, refreshToken, secure })`; `clearSessionCookies(secure)`; `googleStateCookie(value, secure)`; `clearGoogleStateCookie(secure)` — all return `CookieInstruction` values.
- Produces (`requireAuth.ts`): `createRequireAuth(tokens: AccessTokens): RequestHandler` (sets `res.locals.userId`, else `UNAUTHENTICATED`).

- [ ] **Step 1: Write the models**

Create `apps/api/src/models/User.ts`:

```ts
import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    locale: { type: String, enum: ['vi', 'en'], default: 'vi', required: true },
    /** bcrypt hash; absent for Google-only accounts. Never sent to clients (see CurrentUser). */
    passwordHash: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    /** Set once the user proves they own the email: Google sign-in or a password reset link. */
    emailVerifiedAt: { type: Date },
  },
  { timestamps: true },
);

export type UserDocument = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);
```

Create `apps/api/src/models/Session.ts`:

```ts
import { model, Schema } from 'mongoose';

/** One refresh token. Rotation creates a new Session in the same family (spec §12). */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Every token issued from one sign-in shares a family; reusing an old one revokes it. */
    familyId: { type: String, required: true, index: true },
    /** SHA-256 of the token: a database leak does not leak live tokens. */
    tokenHash: { type: String, required: true, unique: true },
    /** MongoDB deletes the document after this date (TTL index). */
    expiresAt: { type: Date, required: true, expires: 0 },
    usedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Session = model('Session', sessionSchema);
```

- [ ] **Step 2: Write the failing password and token tests**

Create `apps/api/src/auth/passwords.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createPasswords } from './passwords.ts';

// Cost 4 keeps tests fast; production uses BCRYPT_COST (12).
const passwords = createPasswords(4);

describe('passwords', () => {
  it('hashes with bcrypt and verifies the right password only', async () => {
    const hash = await passwords.hash('mat-khau-dai');
    expect(hash).toMatch(/^\$2[aby]\$04\$/);
    expect(hash).not.toContain('mat-khau-dai');
    expect(await passwords.verify('mat-khau-dai', hash)).toBe(true);
    expect(await passwords.verify('mat-khau-sai', hash)).toBe(false);
  });

  it('rejects accounts without a password', async () => {
    expect(await passwords.verify('anything', undefined)).toBe(false);
    expect(await passwords.verify('anything', null)).toBe(false);
  });
});
```

Create `apps/api/src/auth/tokens.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessTokens, hashToken, randomToken } from './tokens.ts';

const SECRET = 'test-only-secret-with-at-least-32-chars';

afterEach(() => {
  vi.useRealTimers();
});

describe('randomToken and hashToken', () => {
  it('makes URL-safe tokens of the expected length', () => {
    expect(randomToken(24)).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(randomToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(24)).not.toBe(randomToken(24));
  });

  it('hashes tokens with SHA-256', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('access tokens', () => {
  const tokens = createAccessTokens(SECRET);

  it('round-trips the user id', async () => {
    const token = await tokens.sign('64b7f0c2a1b2c3d4e5f60718');
    expect(await tokens.verify(token)).toBe('64b7f0c2a1b2c3d4e5f60718');
  });

  it('rejects missing, malformed and foreign tokens', async () => {
    expect(await tokens.verify(undefined)).toBeUndefined();
    expect(await tokens.verify('not-a-jwt')).toBeUndefined();
    const foreign = await createAccessTokens('another-secret-with-at-least-32-chars').sign('u1');
    expect(await tokens.verify(foreign)).toBeUndefined();
  });

  it('expires after 15 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const token = await tokens.sign('u1');
    vi.setSystemTime(Date.now() + 14 * 60_000);
    expect(await tokens.verify(token)).toBe('u1');
    vi.setSystemTime(Date.now() + 2 * 60_000);
    expect(await tokens.verify(token)).toBeUndefined();
  });
});
```

Run: `pnpm vitest run apps/api/src/auth`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Write passwords and tokens**

Create `apps/api/src/auth/tokens.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ISSUER = 'ancestors-tree-api';
const AUDIENCE = 'ancestors-tree-web';

/** `bytes` random bytes as URL-safe base64 (24 bytes → 32 characters, 32 → 43). */
export function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

/** Refresh and reset tokens are stored only as this hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface AccessTokens {
  sign(userId: string): Promise<string>;
  /** The user id, or undefined for a missing, expired, forged or malformed token. */
  verify(token: string | undefined): Promise<string | undefined>;
}

export function createAccessTokens(secret: string): AccessTokens {
  const key = new TextEncoder().encode(secret);
  return {
    sign: (userId) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
        .sign(key),
    async verify(token) {
      if (!token) return undefined;
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          issuer: ISSUER,
          audience: AUDIENCE,
        });
        return typeof payload.sub === 'string' ? payload.sub : undefined;
      } catch {
        return undefined;
      }
    },
  };
}
```

Create `apps/api/src/auth/passwords.ts`:

```ts
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
```

Run: `pnpm vitest run apps/api/src/auth`
Expected: PASS (7 tests).

- [ ] **Step 4: Write the failing session tests**

Create `apps/api/src/auth/sessions.test.ts`:

```ts
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Session } from '../models/Session.ts';
import { useTestDatabase } from '../test/database.ts';
import {
  CONCURRENT_REFRESH_WINDOW_MS,
  REFRESH_TOKEN_TTL_MS,
  revokeAllSessions,
  revokeSessionOf,
  rotateSession,
  startSession,
} from './sessions.ts';
import { hashToken } from './tokens.ts';

useTestDatabase();

const userId = () => new Types.ObjectId().toString();
const later = (date: Date, ms: number) => new Date(date.getTime() + ms);

describe('refresh sessions', () => {
  it('stores only the hash of the token', async () => {
    const token = await startSession(userId());
    const stored = await Session.findOne();
    expect(stored?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('rotates a token into a new one for the same user', async () => {
    const user = userId();
    const first = await startSession(user);
    const result = await rotateSession(first);
    expect(result).toMatchObject({ kind: 'rotated', userId: user });
    if (result.kind !== 'rotated') throw new Error('expected rotation');
    expect(result.token).not.toBe(first);
    expect(await rotateSession(result.token)).toMatchObject({ kind: 'rotated', userId: user });
  });

  it('treats a second use within 10 seconds as another tab refreshing', async () => {
    const now = new Date();
    const token = await startSession(userId(), now);
    await rotateSession(token, now);
    const again = await rotateSession(token, later(now, CONCURRENT_REFRESH_WINDOW_MS - 1));
    expect(again.kind).toBe('concurrent');
  });

  it('revokes the whole family when an old token comes back later', async () => {
    const now = new Date();
    const token = await startSession(userId(), now);
    const rotated = await rotateSession(token, now);
    if (rotated.kind !== 'rotated') throw new Error('expected rotation');

    const replay = await rotateSession(token, later(now, CONCURRENT_REFRESH_WINDOW_MS + 1));
    expect(replay.kind).toBe('invalid');
    // The token the legitimate client holds is now dead too.
    expect((await rotateSession(rotated.token, later(now, 20_000))).kind).toBe('invalid');
  });

  it('rejects unknown and expired tokens', async () => {
    expect((await rotateSession('unknown-token')).kind).toBe('invalid');
    const now = new Date();
    const token = await startSession(userId(), now);
    expect((await rotateSession(token, later(now, REFRESH_TOKEN_TTL_MS + 1))).kind).toBe('invalid');
  });

  it('signs out one sign-in, or every sign-in of a user', async () => {
    const user = userId();
    const phone = await startSession(user);
    const laptop = await startSession(user);
    await revokeSessionOf(phone);
    expect((await rotateSession(phone)).kind).toBe('invalid');
    expect((await rotateSession(laptop)).kind).toBe('rotated');

    const tablet = await startSession(user);
    await revokeAllSessions(user);
    expect((await rotateSession(tablet)).kind).toBe('invalid');
  });
});
```

Run: `pnpm vitest run apps/api/src/auth/sessions.test.ts`
Expected: FAIL (`./sessions.ts` does not exist).

- [ ] **Step 5: Write the sessions**

Create `apps/api/src/auth/sessions.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { Session } from '../models/Session.ts';
import { hashToken, randomToken } from './tokens.ts';

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Two tabs refreshing at once send the same token; the second one is not an attack. */
export const CONCURRENT_REFRESH_WINDOW_MS = 10_000;

export type RotateResult =
  | { kind: 'rotated'; userId: string; token: string }
  | { kind: 'concurrent'; userId: string }
  | { kind: 'invalid' };

async function issue(userId: string, familyId: string, now: Date): Promise<string> {
  const token = randomToken(32);
  await Session.create({
    userId,
    familyId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
  });
  return token;
}

/** A new sign-in: a new family and its first refresh token. */
export function startSession(userId: string, now = new Date()): Promise<string> {
  return issue(userId, randomUUID(), now);
}

export async function rotateSession(token: string, now = new Date()): Promise<RotateResult> {
  const tokenHash = hashToken(token);
  // Claim the token atomically: only one request can rotate it.
  const claimed = await Session.findOneAndUpdate(
    { tokenHash, usedAt: null, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
  );
  if (claimed) {
    const userId = claimed.userId.toString();
    return { kind: 'rotated', userId, token: await issue(userId, claimed.familyId, now) };
  }

  const session = await Session.findOne({ tokenHash });
  if (!session || session.revokedAt || session.expiresAt <= now || !session.usedAt) {
    return { kind: 'invalid' };
  }
  if (now.getTime() - session.usedAt.getTime() <= CONCURRENT_REFRESH_WINDOW_MS) {
    return { kind: 'concurrent', userId: session.userId.toString() };
  }
  // An already-used token came back much later: it may have been stolen.
  await revokeFamily(session.familyId, now);
  return { kind: 'invalid' };
}

export async function revokeFamily(familyId: string, now = new Date()): Promise<void> {
  await Session.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: now } });
}

/** Sign-out: revokes the family of this token. Unknown tokens are ignored. */
export async function revokeSessionOf(token: string, now = new Date()): Promise<void> {
  const session = await Session.findOne({ tokenHash: hashToken(token) });
  if (session) await revokeFamily(session.familyId, now);
}

/** Signs a user out everywhere (password reset, account take-over defence). */
export async function revokeAllSessions(userId: string, now = new Date()): Promise<void> {
  await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: now } });
}
```

Run: `pnpm vitest run apps/api/src/auth/sessions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Write the failing cookie and requireAuth tests**

Create `apps/api/src/auth/cookies.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clearGoogleStateCookie,
  clearSessionCookies,
  googleStateCookie,
  sessionCookies,
} from './cookies.ts';

describe('session cookies', () => {
  it('scopes the access cookie to /api and the refresh cookie to /api/auth', () => {
    const [access, refresh] = sessionCookies({
      accessToken: 'a',
      refreshToken: 'r',
      secure: true,
    });
    expect(access).toEqual({
      name: 'at',
      value: 'a',
      options: { httpOnly: true, sameSite: 'lax', secure: true, path: '/api', maxAge: 900_000 },
    });
    expect(refresh).toMatchObject({
      name: 'rt',
      value: 'r',
      options: { httpOnly: true, sameSite: 'lax', secure: true, path: '/api/auth' },
    });
    expect(refresh?.options.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('clears both cookies on the same paths', () => {
    expect(clearSessionCookies(false)).toEqual([
      { name: 'at', clear: true, options: { httpOnly: true, sameSite: 'lax', secure: false, path: '/api' } },
      {
        name: 'rt',
        clear: true,
        options: { httpOnly: true, sameSite: 'lax', secure: false, path: '/api/auth' },
      },
    ]);
  });

  it('keeps the Google state for 10 minutes on the Google routes only', () => {
    expect(googleStateCookie('s', false)).toEqual({
      name: 'g_state',
      value: 's',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/api/auth/google',
        maxAge: 600_000,
      },
    });
    expect(clearGoogleStateCookie(false)).toMatchObject({ name: 'g_state', clear: true });
  });
});
```

Create `apps/api/src/auth/requireAuth.test.ts`:

```ts
import cookieParser from 'cookie-parser';
import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '../http/errorHandler.ts';
import { getLocals } from '../http/locals.ts';
import { createRequireAuth } from './requireAuth.ts';
import { createAccessTokens } from './tokens.ts';

const tokens = createAccessTokens('test-only-secret-with-at-least-32-chars');

const app = express();
app.use(cookieParser());
app.get('/private', createRequireAuth(tokens), (_req, res) => {
  res.json({ userId: getLocals(res).userId });
});
app.use(createErrorHandler(pino({ level: 'silent' })));

describe('requireAuth', () => {
  it('lets a valid access cookie through and exposes the user id', async () => {
    const token = await tokens.sign('64b7f0c2a1b2c3d4e5f60718');
    const response = await request(app).get('/private').set('Cookie', `at=${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: '64b7f0c2a1b2c3d4e5f60718' });
  });

  it('answers 401 without a valid access cookie', async () => {
    for (const cookie of [undefined, 'at=forged', 'other=1']) {
      const call = request(app).get('/private');
      const response = await (cookie ? call.set('Cookie', cookie) : call);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }
  });
});
```

Run: `pnpm vitest run apps/api/src/auth`
Expected: FAIL (`./cookies.ts` and `./requireAuth.ts` do not exist).

- [ ] **Step 7: Write cookies and requireAuth**

Create `apps/api/src/auth/cookies.ts`:

```ts
import type { CookieOptions, Request } from 'express';
import type { CookieInstruction } from '../http/routeRegistry.ts';
import { ACCESS_COOKIE, GOOGLE_STATE_COOKIE, REFRESH_COOKIE } from './cookieNames.ts';
import { REFRESH_TOKEN_TTL_MS } from './sessions.ts';
import { ACCESS_TOKEN_TTL_SECONDS } from './tokens.ts';

export const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;

function baseOptions(secure: boolean, path: string): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path };
}

export function readCookie(req: Request, name: string): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function sessionCookies(input: {
  accessToken: string;
  refreshToken: string;
  secure: boolean;
}): CookieInstruction[] {
  return [
    {
      name: ACCESS_COOKIE,
      value: input.accessToken,
      options: { ...baseOptions(input.secure, '/api'), maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000 },
    },
    {
      name: REFRESH_COOKIE,
      value: input.refreshToken,
      options: { ...baseOptions(input.secure, '/api/auth'), maxAge: REFRESH_TOKEN_TTL_MS },
    },
  ];
}

export function clearSessionCookies(secure: boolean): CookieInstruction[] {
  return [
    { name: ACCESS_COOKIE, clear: true, options: baseOptions(secure, '/api') },
    { name: REFRESH_COOKIE, clear: true, options: baseOptions(secure, '/api/auth') },
  ];
}

export function googleStateCookie(value: string, secure: boolean): CookieInstruction {
  return {
    name: GOOGLE_STATE_COOKIE,
    value,
    options: { ...baseOptions(secure, '/api/auth/google'), maxAge: GOOGLE_STATE_TTL_MS },
  };
}

export function clearGoogleStateCookie(secure: boolean): CookieInstruction {
  return { name: GOOGLE_STATE_COOKIE, clear: true, options: baseOptions(secure, '/api/auth/google') };
}
```

Create `apps/api/src/auth/requireAuth.ts`:

```ts
import type { RequestHandler } from 'express';
import { AppError } from '../http/AppError.ts';
import { getLocals } from '../http/locals.ts';
import { ACCESS_COOKIE } from './cookieNames.ts';
import { readCookie } from './cookies.ts';
import type { AccessTokens } from './tokens.ts';

/** The `signedIn` access level: a valid access cookie, else 401 (the web app then refreshes). */
export function createRequireAuth(tokens: AccessTokens): RequestHandler {
  return async (req, res, next) => {
    const userId = await tokens.verify(readCookie(req, ACCESS_COOKIE));
    if (!userId) throw new AppError('UNAUTHENTICATED', 'Sign in to continue');
    getLocals(res).userId = userId;
    next();
  };
}
```

(Express 5 passes a rejected promise from middleware to the error handler.)

Run: `pnpm vitest run apps/api/src/auth`
Expected: PASS.

- [ ] **Step 8: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/api/src/models apps/api/src/auth
git commit -m "feat(api): user and session models, password hashing, tokens and requireAuth"
```

---

### Task 7: Register, sign in, refresh, sign out and `/me`

**Files:**
- Create: `apps/api/src/auth/userDto.ts`, `apps/api/src/auth/service.ts`
- Create: `apps/api/src/routes/auth.ts`, `apps/api/src/routes/me.ts`
- Create: `apps/api/src/test/users.ts`
- Test: `apps/api/src/routes/auth.test.ts`, `apps/api/src/routes/me.test.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/test/app.ts`

**Interfaces:**
- Consumes: everything Task 6 produces; shared `RegisterRequestSchema`, `LoginRequestSchema`, `UpdateMeRequestSchema`, `CurrentUserSchema`, `ApiErrorBodySchema`.
- Produces: `AppOptions.auth: { jwtSecret: string; secureCookies: boolean; bcryptCost: number }`.
- Produces: `toCurrentUser(user: UserDocument): CurrentUser`.
- Produces: `createAuthService({ tokens, passwords, secureCookies })` returning `AuthService` with `signIn(user)`, `register(input)`, `login(input)`, `refresh(refreshToken)`, `logout(refreshToken)`, `getUser(userId)`, `updateProfile(userId, changes)`; `interface SignedIn { user: CurrentUser; cookies: CookieInstruction[] }`; `type RefreshOutcome`.
- Produces (routes): `POST /api/auth/register` (201), `POST /api/auth/login` (200), `POST /api/auth/refresh` (204/401), `POST /api/auth/logout` (204), `GET /api/me`, `PATCH /api/me`.
- Produces (tests): `TEST_PASSWORD`, `signUp(app, overrides?) → { agent, user }`, `setCookies(response): Map<string, string>`.

- [ ] **Step 1: Configure the app for auth in tests**

In `apps/api/src/test/app.ts`, add to the object returned by `testAppOptions` (before `...overrides`):

```ts
    // Cost 4 keeps bcrypt fast in tests; production uses BCRYPT_COST (12).
    auth: { jwtSecret: 'test-only-secret-with-at-least-32-chars', secureCookies: false, bcryptCost: 4 },
```

Create `apps/api/src/test/users.ts`:

```ts
import { CurrentUserSchema, type CurrentUser } from '@ancestors-tree/shared';
import type { Express } from 'express';
import request from 'supertest';

export const TEST_PASSWORD = 'long-enough-password';

let counter = 0;

/** Registers a new user through the API; the agent keeps the session cookies. */
export async function signUp(
  app: Express,
  overrides: { email?: string; name?: string; locale?: 'vi' | 'en' } = {},
): Promise<{ agent: ReturnType<typeof request.agent>; user: CurrentUser }> {
  counter += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    email: `user${counter}@example.test`,
    password: TEST_PASSWORD,
    name: `User ${counter}`,
    ...overrides,
  });
  if (response.status !== 201) {
    throw new Error(`Sign-up failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return { agent, user: CurrentUserSchema.parse(response.body) };
}

/** Set-Cookie headers by cookie name ("at" → "at=…; Path=/api; HttpOnly; SameSite=Lax"). */
export function setCookies(response: { headers: Record<string, unknown> }): Map<string, string> {
  const header = response.headers['set-cookie'];
  const list = Array.isArray(header) ? (header as string[]) : [];
  return new Map(list.map((cookie) => [cookie.slice(0, cookie.indexOf('=')), cookie]));
}

/** The value of a cookie in a Set-Cookie header. */
export function cookieValue(setCookie: string | undefined): string {
  if (!setCookie) throw new Error('Cookie was not set');
  return setCookie.slice(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
}
```

- [ ] **Step 2: Write the failing auth route tests**

Create `apps/api/src/routes/auth.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { User } from '../models/User.ts';
import { createTestApp } from '../test/app.ts';
import { useTestDatabase } from '../test/database.ts';
import { cookieValue, setCookies, signUp, TEST_PASSWORD } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();

describe('POST /api/auth/register', () => {
  it('creates the account, signs in and never returns the password hash', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: ' Lan@Example.TEST ',
      password: TEST_PASSWORD,
      name: 'Nguyễn Thị Lan',
      locale: 'en',
    });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.stringMatching(/^[a-f0-9]{24}$/),
      email: 'lan@example.test',
      name: 'Nguyễn Thị Lan',
      locale: 'en',
      hasPassword: true,
      hasGoogle: false,
    });

    const cookies = setCookies(response);
    expect(cookies.get('at')).toMatch(/Path=\/api;.*HttpOnly.*SameSite=Lax/);
    expect(cookies.get('rt')).toMatch(/Path=\/api\/auth;.*HttpOnly.*SameSite=Lax/);

    const stored = await User.findOne({ email: 'lan@example.test' });
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored?.emailVerifiedAt).toBeUndefined();
  });

  it('refuses an email that already has an account', async () => {
    await signUp(app, { email: 'tuan@example.test' });
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'TUAN@example.test', password: TEST_PASSWORD, name: 'Tuấn' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates the request', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'lan@example.test', password: 'short', name: 'Lan' });
    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('body.password');
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with the right password', async () => {
    await signUp(app, { email: 'hoa@example.test' });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'Hoa@example.test', password: TEST_PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.email).toBe('hoa@example.test');
    expect(setCookies(response).has('at')).toBe(true);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await signUp(app, { email: 'ha@example.test' });
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ha@example.test', password: 'wrong-password' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.test', password: 'wrong-password' });
    for (const response of [wrong, unknown]) {
      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Wrong email or password',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and renews both cookies', async () => {
    const { agent } = await signUp(app);
    const response = await agent.post('/api/auth/refresh');
    expect(response.status).toBe(204);
    const cookies = setCookies(response);
    expect(cookies.has('at')).toBe(true);
    expect(cookies.has('rt')).toBe(true);
    expect((await agent.get('/api/me')).status).toBe(200);
  });

  it('answers a second refresh with the same token right away without new cookies', async () => {
    const signedUp = await request(app)
      .post('/api/auth/register')
      .send({ email: 'tab@example.test', password: TEST_PASSWORD, name: 'Tab' });
    const oldToken = cookieValue(setCookies(signedUp).get('rt'));
    await request(app).post('/api/auth/refresh').set('Cookie', `rt=${oldToken}`);

    const second = await request(app).post('/api/auth/refresh').set('Cookie', `rt=${oldToken}`);
    expect(second.status).toBe(204);
    expect(second.headers['set-cookie']).toBeUndefined();
  });

  it('answers 401 and clears the cookies without a valid session', async () => {
    const response = await request(app).post('/api/auth/refresh').set('Cookie', 'rt=unknown');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(setCookies(response).get('at')).toMatch(/^at=;/);
    expect(setCookies(response).get('rt')).toMatch(/^rt=;/);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookies and ends the session', async () => {
    const signedUp = await request(app)
      .post('/api/auth/register')
      .send({ email: 'bye@example.test', password: TEST_PASSWORD, name: 'Bye' });
    const refreshToken = cookieValue(setCookies(signedUp).get('rt'));

    const response = await request(app).post('/api/auth/logout').set('Cookie', `rt=${refreshToken}`);
    expect(response.status).toBe(204);
    expect(setCookies(response).get('rt')).toMatch(/^rt=;/);

    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', `rt=${refreshToken}`);
    expect(refresh.status).toBe(401);
  });
});
```

Create `apps/api/src/routes/me.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app.ts';
import { useTestDatabase } from '../test/database.ts';
import { signUp } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();

describe('/api/me', () => {
  it('returns the signed-in user', async () => {
    const { agent, user } = await signUp(app);
    const response = await agent.get('/api/me');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(user);
  });

  it('needs a session', async () => {
    const response = await request(app).get('/api/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('changes the name and the language', async () => {
    const { agent } = await signUp(app);
    const response = await agent.patch('/api/me').send({ name: '  Bà Hoa ', locale: 'en' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: 'Bà Hoa', locale: 'en' });
    expect((await agent.get('/api/me')).body.name).toBe('Bà Hoa');
  });

  it('refuses an empty change', async () => {
    const { agent } = await signUp(app);
    expect((await agent.patch('/api/me').send({})).status).toBe(400);
  });

  it('limits each user to the per-user rate', async () => {
    const limited = createTestApp({ rateLimits: { auth: 1000, user: 2 } }).app;
    const { agent } = await signUp(limited);
    await agent.get('/api/me');
    await agent.get('/api/me');
    const response = await agent.get('/api/me');
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });
});
```

Run: `pnpm vitest run apps/api/src/routes`
Expected: FAIL (routes not registered; `auth` option unknown).

- [ ] **Step 3: Write the DTO and the auth service**

Create `apps/api/src/auth/userDto.ts`:

```ts
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
```

Create `apps/api/src/auth/service.ts`:

```ts
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
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === DUPLICATE_KEY
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
```

- [ ] **Step 4: Write the routes**

Create `apps/api/src/routes/auth.ts`:

```ts
import {
  ApiErrorBodySchema,
  CurrentUserSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
} from '@ancestors-tree/shared';
import { REFRESH_COOKIE } from '../auth/cookieNames.ts';
import { readCookie } from '../auth/cookies.ts';
import type { AuthService } from '../auth/service.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';

export function registerAuthRoutes(api: RouteRegistry, deps: { auth: AuthService }): void {
  api.define({
    method: 'post',
    path: '/auth/register',
    summary: 'Create an account with email and password, and sign in',
    tags: ['Auth'],
    access: 'public',
    request: { body: RegisterRequestSchema },
    responses: {
      201: { description: 'Signed in; session cookies set', schema: CurrentUserSchema },
    },
    handler: async ({ body }) => {
      const { user, cookies } = await deps.auth.register(body);
      return { status: 201, body: user, cookies };
    },
  });

  api.define({
    method: 'post',
    path: '/auth/login',
    summary: 'Sign in with email and password',
    tags: ['Auth'],
    access: 'public',
    request: { body: LoginRequestSchema },
    responses: {
      200: { description: 'Signed in; session cookies set', schema: CurrentUserSchema },
    },
    handler: async ({ body }) => {
      const { user, cookies } = await deps.auth.login(body);
      return { status: 200, body: user, cookies };
    },
  });

  api.define({
    method: 'post',
    path: '/auth/refresh',
    summary: 'Renew the session cookies with the refresh cookie',
    tags: ['Auth'],
    access: 'public',
    responses: {
      204: { description: 'New cookies set (none when another tab renewed them a moment ago)' },
      401: { description: 'No valid session; cookies cleared', schema: ApiErrorBodySchema },
    },
    handler: async ({ req }) => {
      const outcome = await deps.auth.refresh(readCookie(req, REFRESH_COOKIE));
      if (outcome.kind === 'rotated') return { status: 204, cookies: outcome.cookies };
      if (outcome.kind === 'concurrent') return { status: 204 };
      return {
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'Session expired. Sign in again.' } },
        cookies: outcome.cookies,
      };
    },
  });

  api.define({
    method: 'post',
    path: '/auth/logout',
    summary: 'Sign out this device',
    tags: ['Auth'],
    access: 'public',
    responses: { 204: { description: 'Signed out; cookies cleared' } },
    handler: async ({ req }) => ({
      status: 204,
      cookies: await deps.auth.logout(readCookie(req, REFRESH_COOKIE)),
    }),
  });
}
```

Create `apps/api/src/routes/me.ts`:

```ts
import { CurrentUserSchema, UpdateMeRequestSchema } from '@ancestors-tree/shared';
import type { AuthService } from '../auth/service.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';

export function registerMeRoutes(api: RouteRegistry, deps: { auth: AuthService }): void {
  api.define({
    method: 'get',
    path: '/me',
    summary: 'The signed-in user',
    tags: ['Account'],
    access: 'signedIn',
    responses: { 200: { description: 'The signed-in user', schema: CurrentUserSchema } },
    handler: async ({ userId }) => ({ status: 200, body: await deps.auth.getUser(userId()) }),
  });

  api.define({
    method: 'patch',
    path: '/me',
    summary: 'Change your name or language',
    tags: ['Account'],
    access: 'signedIn',
    request: { body: UpdateMeRequestSchema },
    responses: { 200: { description: 'The updated user', schema: CurrentUserSchema } },
    handler: async ({ userId, body }) => ({
      status: 200,
      body: await deps.auth.updateProfile(userId(), body),
    }),
  });
}
```

- [ ] **Step 5: Wire auth into the app**

In `apps/api/src/app.ts`:
- add imports:

```ts
import { createPasswords } from './auth/passwords.ts';
import { createRequireAuth } from './auth/requireAuth.ts';
import { createAuthService } from './auth/service.ts';
import { createAccessTokens } from './auth/tokens.ts';
import { createUserRateLimit } from './http/rateLimits.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerMeRoutes } from './routes/me.ts';
```

(merge `createUserRateLimit` into the existing `./http/rateLimits.ts` import; add `type AccessPolicies` to the `./http/routeRegistry.ts` import)
- add to `AppOptions`:

```ts
  auth: {
    /** JWT_SECRET: signs the access tokens. */
    jwtSecret: string;
    /** Secure (HTTPS-only) cookies: on in production. */
    secureCookies: boolean;
    bcryptCost: number;
  };
```

- change the comment above `notConfigured` to `/** Replaced in Task 10 (clan roles). */`
- replace the first lines of `createApp` (up to and including `registerHealthRoutes(...)`) with:

```ts
  const tokens = createAccessTokens(options.auth.jwtSecret);
  const passwords = createPasswords(options.auth.bcryptCost);
  const auth = createAuthService({ tokens, passwords, secureCookies: options.auth.secureCookies });

  // One shared per-user budget across every protected route.
  const signedIn = [createRequireAuth(tokens), createUserRateLimit(options.rateLimits.user)];
  const policies: AccessPolicies = { signedIn, clanRole: () => [notConfigured] };

  const api = createRouteRegistry({ policies });
  registerHealthRoutes(api, { version: options.version });
  registerAuthRoutes(api, { auth });
  registerMeRoutes(api, { auth });
```

In `apps/api/src/server.ts`, add `import { BCRYPT_COST } from './auth/passwords.ts';` and add to the `createApp({...})` options:

```ts
  auth: {
    jwtSecret: requireSetting(config.JWT_SECRET, 'JWT_SECRET'),
    secureCookies: config.NODE_ENV === 'production',
    bcryptCost: BCRYPT_COST,
  },
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm vitest run apps/api`
Expected: PASS (including the OpenAPI route-coverage tests, which now see six more routes).

- [ ] **Step 7: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/api/src
git commit -m "feat(api): register, sign in, refresh, sign out and /me"
```

---

### Task 8: Password reset by email

**Files:**
- Create: `apps/api/src/models/PasswordReset.ts`
- Create: `apps/api/src/mail/mailer.ts`, `apps/api/src/mail/templates.ts`
- Test: `apps/api/src/mail/mailer.test.ts`, `apps/api/src/mail/templates.test.ts`
- Create: `apps/api/src/auth/passwordResets.ts`, `apps/api/src/routes/passwordReset.ts`
- Test: `apps/api/src/routes/passwordReset.test.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/test/app.ts`

**Interfaces:**
- Consumes: `AuthService.signIn` (Task 7), `Passwords`, `randomToken`, `hashToken`, `revokeAllSessions` (Task 6), `Config` (Task 1).
- Produces: `interface MailMessage { to; subject; text; html }`, `interface Mailer { send(message): Promise<void> }`, `createResendMailer`, `createLogMailer`, `createDisabledMailer`, `createMemoryMailer(): MemoryMailer` (`sent: MailMessage[]`), `createMailer(config, logger)`.
- Produces: `passwordResetEmail({ locale, name, link }): { subject; text; html }`.
- Produces: `PASSWORD_RESET_TTL_MS`; `createPasswordResets({ mailer, appOrigin, passwords })` with `request(email, now?)` and `reset(token, password, now?)`.
- Produces: `AppOptions.mailer: Mailer`; routes `POST /api/auth/forgot-password` (204) and `POST /api/auth/reset-password` (200).

- [ ] **Step 1: Write the failing mail tests**

Create `apps/api/src/mail/templates.test.ts`:

```ts
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
```

Create `apps/api/src/mail/mailer.test.ts`:

```ts
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.ts';
import { createMailer, createMemoryMailer, createResendMailer } from './mailer.ts';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

const MESSAGE = { to: 'lan@example.test', subject: 'Hi', text: 'Hello', html: '<p>Hello</p>' };

describe('mailers', () => {
  it('sends through Resend from MAIL_FROM', async () => {
    send.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await createResendMailer({ apiKey: 're_test', from: 'Tree <a@example.test>' }).send(MESSAGE);
    expect(send).toHaveBeenCalledWith({ from: 'Tree <a@example.test>', ...MESSAGE });
  });

  it('fails when Resend rejects the email', async () => {
    send.mockResolvedValueOnce({ data: null, error: { name: 'validation_error', message: 'x' } });
    await expect(
      createResendMailer({ apiKey: 're_test', from: 'a@example.test' }).send(MESSAGE),
    ).rejects.toThrow(/validation_error/);
  });

  it('writes emails to the log in development without a key', async () => {
    const logger = pino({ level: 'silent' });
    const info = vi.spyOn(logger, 'info');
    await createMailer(loadConfig({ NODE_ENV: 'test' }), logger).send(MESSAGE);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ to: MESSAGE.to, text: MESSAGE.text }),
      expect.stringContaining('RESEND_API_KEY'),
    );
  });

  it('never logs the email body in production without a key', async () => {
    const logger = pino({ level: 'silent' });
    const warn = vi.spyOn(logger, 'warn');
    const info = vi.spyOn(logger, 'info');
    const config = loadConfig({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://db.example.test/app',
      JWT_SECRET: 'test-only-secret-with-at-least-32-chars',
    });
    await createMailer(config, logger).send(MESSAGE);
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith({ subject: 'Hi' }, expect.any(String));
  });

  it('keeps emails in memory for tests', async () => {
    const mailer = createMemoryMailer();
    await mailer.send(MESSAGE);
    expect(mailer.sent).toEqual([MESSAGE]);
  });
});
```

Run: `pnpm vitest run apps/api/src/mail`
Expected: FAIL (modules do not exist).

- [ ] **Step 2: Write the mailers and the template**

Create `apps/api/src/mail/mailer.ts`:

```ts
import type { Logger } from 'pino';
import { Resend } from 'resend';
import type { Config } from '../config.ts';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export function createResendMailer(options: { apiKey: string; from: string }): Mailer {
  const resend = new Resend(options.apiKey);
  return {
    async send(message) {
      const { error } = await resend.emails.send({ from: options.from, ...message });
      // Only the error name: the message can echo the recipient.
      if (error) throw new Error(`Resend rejected the email: ${error.name}`);
    },
  };
}

/** Development without a key: the email, including its link, goes to the server log. */
export function createLogMailer(logger: Logger): Mailer {
  return {
    async send(message) {
      logger.info(
        { to: message.to, subject: message.subject, text: message.text },
        'Email not sent (RESEND_API_KEY is not set); its text is logged instead',
      );
    },
  };
}

/** Production without a key: links in emails are credentials, so nothing but a warning. */
export function createDisabledMailer(logger: Logger): Mailer {
  return {
    async send(message) {
      logger.warn({ subject: message.subject }, 'Email not sent: RESEND_API_KEY is not set');
    },
  };
}

export interface MemoryMailer extends Mailer {
  readonly sent: MailMessage[];
}

export function createMemoryMailer(): MemoryMailer {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

export function createMailer(
  config: Pick<Config, 'NODE_ENV' | 'RESEND_API_KEY' | 'MAIL_FROM'>,
  logger: Logger,
): Mailer {
  if (config.RESEND_API_KEY) {
    return createResendMailer({ apiKey: config.RESEND_API_KEY, from: config.MAIL_FROM });
  }
  return config.NODE_ENV === 'production' ? createDisabledMailer(logger) : createLogMailer(logger);
}
```

Create `apps/api/src/mail/templates.ts`:

```ts
import type { Locale } from '@ancestors-tree/shared';
import type { MailMessage } from './mailer.ts';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

const RESET_COPY = {
  vi: {
    subject: 'Đặt lại mật khẩu AncestorsTree',
    greeting: (name: string) => `Chào ${name},`,
    body: 'Có người (hy vọng là bạn) vừa yêu cầu đặt lại mật khẩu tài khoản AncestorsTree của bạn. Mở đường link dưới đây để chọn mật khẩu mới. Link chỉ dùng được một lần, trong 1 giờ.',
    action: 'Chọn mật khẩu mới',
    ignore: 'Nếu bạn không yêu cầu, hãy bỏ qua email này: mật khẩu của bạn vẫn giữ nguyên.',
  },
  en: {
    subject: 'Reset your AncestorsTree password',
    greeting: (name: string) => `Hi ${name},`,
    body: 'Someone (hopefully you) asked to reset the password of your AncestorsTree account. Open the link below to choose a new password. The link works once, for 1 hour.',
    action: 'Choose a new password',
    ignore: 'If you did not ask for this, ignore this email: your password stays the same.',
  },
} as const;

/** Emails are the one place the API writes user-facing text (spec §14): vi and en only. */
export function passwordResetEmail(input: {
  locale: Locale;
  name: string;
  link: string;
}): Omit<MailMessage, 'to'> {
  const copy = RESET_COPY[input.locale];
  const greeting = copy.greeting(input.name);
  return {
    subject: copy.subject,
    text: [greeting, '', copy.body, '', input.link, '', copy.ignore].join('\n'),
    html: [
      `<p>${escapeHtml(greeting)}</p>`,
      `<p>${escapeHtml(copy.body)}</p>`,
      `<p><a href="${escapeHtml(input.link)}">${escapeHtml(copy.action)}</a></p>`,
      `<p>${escapeHtml(copy.ignore)}</p>`,
    ].join('\n'),
  };
}
```

Run: `pnpm vitest run apps/api/src/mail`
Expected: PASS (7 tests).

- [ ] **Step 3: Write the failing password-reset route tests**

In `apps/api/src/test/app.ts`, add `import { createMemoryMailer } from '../mail/mailer.ts';` and add `mailer: createMemoryMailer(),` to the object returned by `testAppOptions` (before `...overrides`).

Create `apps/api/src/routes/passwordReset.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { hashToken } from '../auth/tokens.ts';
import { createMemoryMailer } from '../mail/mailer.ts';
import { PasswordReset } from '../models/PasswordReset.ts';
import { User } from '../models/User.ts';
import { createTestApp, TEST_ORIGIN } from '../test/app.ts';
import { useTestDatabase } from '../test/database.ts';
import { setCookies, signUp, TEST_PASSWORD } from '../test/users.ts';

useTestDatabase();

const mailer = createMemoryMailer();
const { app } = createTestApp({ mailer });

async function requestReset(email: string): Promise<string> {
  const before = mailer.sent.length;
  const response = await request(app).post('/api/auth/forgot-password').send({ email });
  expect(response.status).toBe(204);
  await vi.waitFor(() => expect(mailer.sent.length).toBe(before + 1));
  const text = mailer.sent.at(-1)?.text ?? '';
  const token = /#token=([\w-]+)/.exec(text)?.[1];
  if (!token) throw new Error('No reset link in the email');
  return token;
}

describe('POST /api/auth/forgot-password', () => {
  it('emails a reset link in the user language', async () => {
    await signUp(app, { email: 'lan@example.test', locale: 'en' });
    await requestReset('Lan@example.test');
    const email = mailer.sent.at(-1);
    expect(email?.to).toBe('lan@example.test');
    expect(email?.subject).toBe('Reset your AncestorsTree password');
    expect(email?.text).toContain(`${TEST_ORIGIN}/reset-password#token=`);
  });

  it('answers the same for an unknown email and sends nothing', async () => {
    const before = mailer.sent.length;
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.test' });
    expect(response.status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mailer.sent.length).toBe(before);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('sets the new password, verifies the email, signs out other devices and signs in', async () => {
    const { agent: oldDevice } = await signUp(app, { email: 'tuan@example.test' });
    const token = await requestReset('tuan@example.test');

    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'brand-new-password' });
    expect(response.status).toBe(200);
    expect(response.body.email).toBe('tuan@example.test');
    expect(setCookies(response).has('at')).toBe(true);

    expect((await oldDevice.post('/api/auth/refresh')).status).toBe(401);
    const oldPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tuan@example.test', password: TEST_PASSWORD });
    expect(oldPassword.status).toBe(401);
    const newPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tuan@example.test', password: 'brand-new-password' });
    expect(newPassword.status).toBe(200);
    expect((await User.findOne({ email: 'tuan@example.test' }))?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('works only once', async () => {
    await signUp(app, { email: 'hoa@example.test' });
    const token = await requestReset('hoa@example.test');
    await request(app).post('/api/auth/reset-password').send({ token, password: 'new-password-1' });
    const again = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'new-password-2' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired link', async () => {
    const { user } = await signUp(app);
    const token = 'x'.repeat(43);
    await PasswordReset.create({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() - 1000),
    });
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'brand-new-password' });
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });
});
```

Run: `pnpm vitest run apps/api/src/routes/passwordReset.test.ts`
Expected: FAIL.

- [ ] **Step 4: Write the model, the reset service and the routes**

Create `apps/api/src/models/PasswordReset.ts`:

```ts
import { model, Schema } from 'mongoose';

const passwordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    usedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const PasswordReset = model('PasswordReset', passwordResetSchema);
```

Create `apps/api/src/auth/passwordResets.ts`:

```ts
import { AppError } from '../http/AppError.ts';
import type { Mailer } from '../mail/mailer.ts';
import { passwordResetEmail } from '../mail/templates.ts';
import { PasswordReset } from '../models/PasswordReset.ts';
import { User, type UserDocument } from '../models/User.ts';
import type { Passwords } from './passwords.ts';
import { revokeAllSessions } from './sessions.ts';
import { hashToken, randomToken } from './tokens.ts';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

interface PasswordResetDeps {
  mailer: Mailer;
  /** Links point at the web app. */
  appOrigin: string;
  passwords: Passwords;
}

export function createPasswordResets({ mailer, appOrigin, passwords }: PasswordResetDeps) {
  return {
    /** Emails a reset link when the email has an account; does nothing otherwise. */
    async request(email: string, now = new Date()): Promise<void> {
      const user = await User.findOne({ email });
      if (!user) return;
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
        ...passwordResetEmail({ locale: user.locale === 'en' ? 'en' : 'vi', name: user.name, link }),
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
```

Create `apps/api/src/routes/passwordReset.ts`:

```ts
import {
  CurrentUserSchema,
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
} from '@ancestors-tree/shared';
import type { Logger } from 'pino';
import type { PasswordResets } from '../auth/passwordResets.ts';
import type { AuthService } from '../auth/service.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';

interface PasswordResetRouteDeps {
  auth: AuthService;
  resets: PasswordResets;
  logger: Logger;
}

export function registerPasswordResetRoutes(api: RouteRegistry, deps: PasswordResetRouteDeps): void {
  api.define({
    method: 'post',
    path: '/auth/forgot-password',
    summary: 'Email a password reset link',
    tags: ['Auth'],
    access: 'public',
    request: { body: ForgotPasswordRequestSchema },
    responses: { 204: { description: 'Always, whether or not the email has an account' } },
    handler: ({ body }) => {
      // Not awaited: neither the answer nor its timing may reveal whether the email has an account.
      void deps.resets.request(body.email).catch((error: unknown) => {
        deps.logger.error({ errorName: (error as Error).name }, 'Password reset email failed');
      });
      return { status: 204 };
    },
  });

  api.define({
    method: 'post',
    path: '/auth/reset-password',
    summary: 'Choose a new password with the emailed link, and sign in',
    tags: ['Auth'],
    access: 'public',
    request: { body: ResetPasswordRequestSchema },
    responses: {
      200: { description: 'Password changed; signed in on this device only', schema: CurrentUserSchema },
    },
    handler: async ({ body }) => {
      const user = await deps.resets.reset(body.token, body.password);
      const signedIn = await deps.auth.signIn(user);
      return { status: 200, body: signedIn.user, cookies: signedIn.cookies };
    },
  });
}
```

- [ ] **Step 5: Wire it into the app**

In `apps/api/src/app.ts`:
- add imports `import { createPasswordResets } from './auth/passwordResets.ts';`, `import type { Mailer } from './mail/mailer.ts';`, `import { registerPasswordResetRoutes } from './routes/passwordReset.ts';`;
- add to `AppOptions`: `/** Sends password reset emails (createMailer). */ mailer: Mailer;`;
- after `registerMeRoutes(api, { auth });` add:

```ts
  const resets = createPasswordResets({
    mailer: options.mailer,
    appOrigin: options.appOrigin,
    passwords,
  });
  registerPasswordResetRoutes(api, { auth, resets, logger: options.logger });
```

In `apps/api/src/server.ts`, add `import { createMailer } from './mail/mailer.ts';` and the option `mailer: createMailer(config, logger),`.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm vitest run apps/api`
Expected: PASS.

- [ ] **Step 7: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/api/src
git commit -m "feat(api): password reset by email with Resend or the server log"
```

---

### Task 9: Google sign-in

**Files:**
- Create: `apps/api/src/auth/google.ts`
- Test: `apps/api/src/auth/google.test.ts`
- Create: `apps/api/src/test/fakeGoogle.ts`
- Create: `apps/api/src/routes/google.ts`
- Test: `apps/api/src/routes/google.test.ts`
- Modify: `apps/api/src/auth/service.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `AuthService` (Task 7), cookies helpers and `randomToken` (Task 6), `revokeAllSessions` (Task 6), `ReturnToSchema`, `AuthProvidersSchema` (Task 3).
- Produces: `interface GoogleProfile { googleId: string; email: string; emailVerified: boolean; name: string }`; `interface GoogleOAuthClient { authorizationUrl(input): string; exchangeCode(input): Promise<GoogleProfile> }`; `codeChallengeFor(verifier: string): string`; `createGoogleOAuthClient({ clientId, clientSecret, fetch?, keys? })`.
- Produces: `AuthService.signInWithGoogle(profile: GoogleProfile): Promise<SignedIn>`.
- Produces: `AppOptions.google?: GoogleOAuthClient`; routes `GET /api/auth/providers`, `GET /api/auth/google/start?returnTo=` (302), `GET /api/auth/google/callback` (302). Every failure redirects to `/login?error=google`.
- Produces (tests): `createFakeGoogle(): FakeGoogle` (`profiles: Map<code, GoogleProfile>`, `lastAuthorization`).

- [ ] **Step 1: Write the failing Google client test**

Create `apps/api/src/auth/google.test.ts`:

```ts
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { codeChallengeFor, createGoogleOAuthClient } from './google.ts';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const REDIRECT_URI = 'http://localhost:5173/api/auth/google/callback';

async function signingSetup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256' };
  return { privateKey, keys: createLocalJWKSet({ keys: [jwk] }) };
}

async function idToken(
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
  audience = CLIENT_ID,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer('https://accounts.google.com')
    .setAudience(audience)
    .setSubject('google-123')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

describe('Google OAuth client', () => {
  it('computes the PKCE S256 challenge (RFC 7636 appendix B)', () => {
    expect(codeChallengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('builds the authorization URL with state, nonce and PKCE', () => {
    const client = createGoogleOAuthClient({ clientId: CLIENT_ID, clientSecret: 'test-secret' });
    const url = new URL(
      client.authorizationUrl({
        state: 'st',
        nonce: 'no',
        codeChallenge: 'ch',
        redirectUri: REDIRECT_URI,
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state: 'st',
      nonce: 'no',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
  });

  it('exchanges the code and verifies the ID token', async () => {
    const { privateKey, keys } = await signingSetup();
    const token = await idToken(privateKey, {
      email: 'Lan@Gmail.example',
      email_verified: true,
      name: 'Nguyễn Thị Lan',
      nonce: 'no',
    });
    const fetchMock = vi.fn(async () => Response.json({ id_token: token }));
    const client = createGoogleOAuthClient({
      clientId: CLIENT_ID,
      clientSecret: 'test-secret',
      fetch: fetchMock,
      keys,
    });

    const profile = await client.exchangeCode({
      code: 'code-1',
      codeVerifier: 'verifier-1',
      redirectUri: REDIRECT_URI,
      nonce: 'no',
    });
    expect(profile).toEqual({
      googleId: 'google-123',
      email: 'lan@gmail.example',
      emailVerified: true,
      name: 'Nguyễn Thị Lan',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(init.body as URLSearchParams);
    expect(body.get('code_verifier')).toBe('verifier-1');
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('rejects a wrong nonce, a wrong audience and a failed exchange', async () => {
    const { privateKey, keys } = await signingSetup();
    const input = { code: 'c', codeVerifier: 'v', redirectUri: REDIRECT_URI, nonce: 'expected' };
    const clientWith = (response: Response) =>
      createGoogleOAuthClient({
        clientId: CLIENT_ID,
        clientSecret: 'test-secret',
        fetch: async () => response,
        keys,
      });

    const wrongNonce = await idToken(privateKey, { email: 'a@b.example', nonce: 'other' });
    await expect(clientWith(Response.json({ id_token: wrongNonce })).exchangeCode(input)).rejects.toThrow(
      /nonce/,
    );
    const wrongAudience = await idToken(privateKey, { email: 'a@b.example', nonce: 'expected' }, 'other');
    await expect(
      clientWith(Response.json({ id_token: wrongAudience })).exchangeCode(input),
    ).rejects.toThrow();
    await expect(
      clientWith(new Response('denied', { status: 400 })).exchangeCode(input),
    ).rejects.toThrow(/400/);
  });
});
```

Run: `pnpm vitest run apps/api/src/auth/google.test.ts`
Expected: FAIL (`./google.ts` does not exist).

- [ ] **Step 2: Write the Google client**

Create `apps/api/src/auth/google.ts`:

```ts
import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const MAX_NAME_LENGTH = 80;

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export interface GoogleOAuthClient {
  authorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;
  /** Exchanges the code; verifies the ID token's signature, issuer, audience, expiry and nonce. */
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    nonce: string;
  }): Promise<GoogleProfile>;
}

/** PKCE S256 challenge for a code verifier (RFC 7636). */
export function codeChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

const TokenResponseSchema = z.object({ id_token: z.string() });
const IdTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(3),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  nonce: z.string().optional(),
});

export interface GoogleClientOptions {
  clientId: string;
  clientSecret: string;
  /** Injected in tests. */
  fetch?: typeof fetch;
  /** Injected in tests; Google's published keys otherwise. */
  keys?: JWTVerifyGetKey;
}

export function createGoogleOAuthClient(options: GoogleClientOptions): GoogleOAuthClient {
  const fetchImpl = options.fetch ?? fetch;
  const keys = options.keys ?? createRemoteJWKSet(new URL(CERTS_URL));

  return {
    authorizationUrl({ state, nonce, codeChallenge, redirectUri }) {
      const url = new URL(AUTHORIZE_URL);
      url.search = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      return url.toString();
    },

    async exchangeCode({ code, codeVerifier, redirectUri, nonce }) {
      const response = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          code_verifier: codeVerifier,
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Google token endpoint answered ${response.status}`);
      const { id_token: idToken } = TokenResponseSchema.parse(await response.json());
      const { payload } = await jwtVerify(idToken, keys, {
        issuer: ISSUERS,
        audience: options.clientId,
      });
      const claims = IdTokenClaimsSchema.parse(payload);
      if (claims.nonce !== nonce) throw new Error('Google ID token nonce mismatch');
      const email = claims.email.trim().toLowerCase();
      const name = claims.name?.trim();
      return {
        googleId: claims.sub,
        email,
        emailVerified: claims.email_verified === true,
        name: (name ? name : (email.split('@')[0] ?? email)).slice(0, MAX_NAME_LENGTH),
      };
    },
  };
}
```

Run: `pnpm vitest run apps/api/src/auth/google.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Write the fake Google client for route tests**

Create `apps/api/src/test/fakeGoogle.ts`:

```ts
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
```

- [ ] **Step 4: Write the failing Google route tests**

Create `apps/api/src/routes/google.test.ts`:

```ts
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { User } from '../models/User.ts';
import { createTestApp, TEST_ORIGIN } from '../test/app.ts';
import { useTestDatabase } from '../test/database.ts';
import { createFakeGoogle } from '../test/fakeGoogle.ts';
import { setCookies, signUp, TEST_PASSWORD } from '../test/users.ts';

useTestDatabase();

const google = createFakeGoogle();
const { app } = createTestApp({ google });

const PROFILE = {
  googleId: 'google-1',
  email: 'lan@gmail.example',
  emailVerified: true,
  name: 'Nguyễn Thị Lan',
};

beforeEach(() => {
  google.profiles.clear();
  google.profiles.set('code-1', PROFILE);
});

/** Runs start → callback with one agent, as the browser would. */
async function signInWithGoogle(returnTo?: string) {
  const agent = request.agent(app);
  const start = await agent
    .get('/api/auth/google/start')
    .query(returnTo ? { returnTo } : {});
  const state = google.lastAuthorization?.state;
  const callback = await agent.get('/api/auth/google/callback').query({ code: 'code-1', state });
  return { agent, start, callback };
}

describe('Google sign-in', () => {
  it('reports whether Google sign-in is configured', async () => {
    expect((await request(app).get('/api/auth/providers')).body).toEqual({ google: true });
    const without = createTestApp().app;
    expect((await request(without).get('/api/auth/providers')).body).toEqual({ google: false });
    const start = await request(without).get('/api/auth/google/start');
    expect(start.headers.location).toBe('/login?error=google');
  });

  it('redirects to Google with a short-lived state cookie', async () => {
    const response = await request(app).get('/api/auth/google/start');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      `https://accounts.google.test/auth?state=${google.lastAuthorization?.state}`,
    );
    expect(google.lastAuthorization?.redirectUri).toBe(`${TEST_ORIGIN}/api/auth/google/callback`);
    expect(setCookies(response).get('g_state')).toMatch(
      /Max-Age=600;.*Path=\/api\/auth\/google;.*HttpOnly.*SameSite=Lax/,
    );
  });

  it('creates a verified account, signs in and returns to the requested page', async () => {
    const { agent, callback } = await signInWithGoogle('/clans/abc');
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/clans/abc');
    const cookies = setCookies(callback);
    expect(cookies.has('at')).toBe(true);
    expect(cookies.get('g_state')).toMatch(/^g_state=;/);

    const me = await agent.get('/api/me');
    expect(me.body).toMatchObject({ email: 'lan@gmail.example', hasGoogle: true, hasPassword: false });
    expect((await User.findOne({ email: 'lan@gmail.example' }))?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('goes to the clans page by default and refuses outside return paths', async () => {
    expect((await signInWithGoogle()).callback.headers.location).toBe('/clans');
    const outside = await request(app)
      .get('/api/auth/google/start')
      .query({ returnTo: 'https://evil.example.test' });
    expect(outside.status).toBe(400);
  });

  it('fails safely on a wrong state, a missing state cookie or an unverified email', async () => {
    const agent = request.agent(app);
    await agent.get('/api/auth/google/start');
    const wrongState = await agent
      .get('/api/auth/google/callback')
      .query({ code: 'code-1', state: 'forged' });
    const noCookie = await request(app)
      .get('/api/auth/google/callback')
      .query({ code: 'code-1', state: google.lastAuthorization?.state });
    google.profiles.set('code-1', { ...PROFILE, emailVerified: false });
    const unverified = (await signInWithGoogle()).callback;
    const cancelled = await request(app)
      .get('/api/auth/google/callback')
      .query({ error: 'access_denied' });

    for (const response of [wrongState, noCookie, unverified, cancelled]) {
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login?error=google');
      expect(setCookies(response).has('at')).toBe(false);
    }
  });

  it('links to a verified account and keeps its password', async () => {
    await signUp(app, { email: 'lan@gmail.example' });
    await User.updateOne({ email: 'lan@gmail.example' }, { emailVerifiedAt: new Date() });
    await signInWithGoogle();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'lan@gmail.example', password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ hasGoogle: true, hasPassword: true });
  });

  it('takes over an unverified account: drops its password and signs it out', async () => {
    // Someone registered this email without proving they own it.
    const { agent: squatter } = await signUp(app, { email: 'lan@gmail.example' });
    await signInWithGoogle();

    expect((await squatter.post('/api/auth/refresh')).status).toBe(401);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'lan@gmail.example', password: TEST_PASSWORD });
    expect(login.status).toBe(401);
  });
});
```

Run: `pnpm vitest run apps/api/src/routes/google.test.ts`
Expected: FAIL.

- [ ] **Step 5: Sign in with a Google profile**

In `apps/api/src/auth/service.ts`:
- add imports `import type { GoogleProfile } from './google.ts';` and add `revokeAllSessions` to the `./sessions.ts` import;
- add this method to the returned object, after `login`:

```ts
    async signInWithGoogle(profile: GoogleProfile): Promise<SignedIn> {
      if (!profile.emailVerified) throw new Error('Google account email is not verified');

      const linked = await User.findOne({ googleId: profile.googleId });
      if (linked) return signIn(linked);

      const sameEmail = await User.findOne({ email: profile.email });
      if (sameEmail) {
        if (!sameEmail.emailVerifiedAt) {
          // Nobody has proved they own this email: a stranger may have registered it to get
          // into the real owner's account later. Google proves ownership, so the unproven
          // password goes and every session of the old account ends.
          sameEmail.passwordHash = undefined;
          await revokeAllSessions(sameEmail.id as string);
        }
        sameEmail.googleId = profile.googleId;
        sameEmail.emailVerifiedAt ??= new Date();
        await sameEmail.save();
        return signIn(sameEmail);
      }

      const user = await User.create({
        email: profile.email,
        name: profile.name,
        googleId: profile.googleId,
        emailVerifiedAt: new Date(),
      });
      return signIn(user);
    },
```

- [ ] **Step 6: Write the Google routes**

Create `apps/api/src/routes/google.ts`:

```ts
import { AuthProvidersSchema, ReturnToSchema } from '@ancestors-tree/shared';
import type { Logger } from 'pino';
import { z } from 'zod';
import { GOOGLE_STATE_COOKIE } from '../auth/cookieNames.ts';
import { clearGoogleStateCookie, googleStateCookie, readCookie } from '../auth/cookies.ts';
import { codeChallengeFor, type GoogleOAuthClient } from '../auth/google.ts';
import type { AuthService } from '../auth/service.ts';
import { randomToken } from '../auth/tokens.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';

const DEFAULT_RETURN_TO = '/clans';
const FAILURE_REDIRECT = '/login?error=google';

/** What the g_state cookie remembers between /start and /callback. */
const GoogleStateSchema = z.object({
  state: z.string(),
  nonce: z.string(),
  verifier: z.string(),
  returnTo: ReturnToSchema,
});
type GoogleState = z.infer<typeof GoogleStateSchema>;

function encodeState(value: GoogleState): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeState(raw: string | undefined): GoogleState | undefined {
  if (!raw) return undefined;
  try {
    const parsed = GoogleStateSchema.safeParse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

interface GoogleRouteDeps {
  google: GoogleOAuthClient | undefined;
  auth: AuthService;
  appOrigin: string;
  secureCookies: boolean;
  logger: Logger;
}

export function registerGoogleRoutes(api: RouteRegistry, deps: GoogleRouteDeps): void {
  // Through the web origin: the Netlify proxy (production) or the Vite proxy (development).
  const redirectUri = `${deps.appOrigin}/api/auth/google/callback`;

  api.define({
    method: 'get',
    path: '/auth/providers',
    summary: 'Which sign-in methods besides email and password are available',
    tags: ['Auth'],
    access: 'public',
    responses: { 200: { description: 'Available providers', schema: AuthProvidersSchema } },
    handler: () => ({ status: 200, body: { google: deps.google !== undefined } }),
  });

  api.define({
    method: 'get',
    path: '/auth/google/start',
    summary: 'Start Google sign-in (the browser navigates here)',
    tags: ['Auth'],
    access: 'public',
    request: { query: z.object({ returnTo: ReturnToSchema.optional() }) },
    responses: {
      302: { description: 'To Google, or back to /login when Google sign-in is off', redirect: true },
    },
    handler: ({ query }) => {
      if (!deps.google) return { status: 302, redirect: FAILURE_REDIRECT };
      const saved: GoogleState = {
        state: randomToken(16),
        nonce: randomToken(16),
        verifier: randomToken(32),
        returnTo: query.returnTo ?? DEFAULT_RETURN_TO,
      };
      return {
        status: 302,
        redirect: deps.google.authorizationUrl({
          state: saved.state,
          nonce: saved.nonce,
          codeChallenge: codeChallengeFor(saved.verifier),
          redirectUri,
        }),
        cookies: [googleStateCookie(encodeState(saved), deps.secureCookies)],
      };
    },
  });

  api.define({
    method: 'get',
    path: '/auth/google/callback',
    summary: 'Google sends the browser back here',
    tags: ['Auth'],
    access: 'public',
    request: {
      query: z.object({
        code: z.string().max(2048).optional(),
        state: z.string().max(256).optional(),
        error: z.string().max(256).optional(),
      }),
    },
    responses: {
      302: { description: 'Signed in and back in the app, or to /login?error=google', redirect: true },
    },
    handler: async ({ query, req }) => {
      const clearState = clearGoogleStateCookie(deps.secureCookies);
      const failure = { status: 302 as const, redirect: FAILURE_REDIRECT, cookies: [clearState] };
      const saved = decodeState(readCookie(req, GOOGLE_STATE_COOKIE));
      if (!deps.google || !saved || !query.code || query.error || query.state !== saved.state) {
        return failure;
      }
      try {
        const profile = await deps.google.exchangeCode({
          code: query.code,
          codeVerifier: saved.verifier,
          redirectUri,
          nonce: saved.nonce,
        });
        const { cookies } = await deps.auth.signInWithGoogle(profile);
        return { status: 302, redirect: saved.returnTo, cookies: [clearState, ...cookies] };
      } catch (error) {
        deps.logger.warn({ errorName: (error as Error).name }, 'Google sign-in failed');
        return failure;
      }
    },
  });
}
```

- [ ] **Step 7: Wire it into the app**

In `apps/api/src/app.ts`:
- add imports `import type { GoogleOAuthClient } from './auth/google.ts';` and `import { registerGoogleRoutes } from './routes/google.ts';`;
- add to `AppOptions`: `/** Google sign-in; off when GOOGLE_CLIENT_ID is not set. */ google?: GoogleOAuthClient;`;
- after `registerPasswordResetRoutes(...)` add:

```ts
  registerGoogleRoutes(api, {
    google: options.google,
    auth,
    appOrigin: options.appOrigin,
    secureCookies: options.auth.secureCookies,
    logger: options.logger,
  });
```

In `apps/api/src/server.ts`, add `import { createGoogleOAuthClient } from './auth/google.ts';` and the option:

```ts
  google:
    config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
      ? createGoogleOAuthClient({
          clientId: config.GOOGLE_CLIENT_ID,
          clientSecret: config.GOOGLE_CLIENT_SECRET,
        })
      : undefined,
```

- [ ] **Step 8: Run the tests and watch them pass**

Run: `pnpm vitest run apps/api`
Expected: PASS.

- [ ] **Step 9: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/api/src
git commit -m "feat(api): Google sign-in with PKCE, state and nonce"
```

> Controller: the manual check with a real Google account needs Human step 2. It is not required to finish this task; do it before deploying.

---

### Task 10: Clans and members API

**Files:**
- Create: `apps/api/src/models/Clan.ts`, `apps/api/src/models/Membership.ts`
- Create: `apps/api/src/clans/access.ts`, `apps/api/src/clans/dto.ts`
- Create: `apps/api/src/routes/clans.ts`, `apps/api/src/routes/members.ts`
- Create: `apps/api/src/test/clans.ts`
- Test: `apps/api/src/clans/access.test.ts`, `apps/api/src/routes/clans.test.ts`, `apps/api/src/routes/members.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `AccessPolicies`, `getLocals`, `ClanMembership` (Task 4); shared `IdSchema`, `ClanRoleSchema`, `hasRoleAtLeast`, `CreateClanRequestSchema`, `UpdateClanRequestSchema`, `ClanSchema`, `ClanListSchema`, `MemberSchema`, `MemberListSchema`, `UpdateMemberRequestSchema` (Task 3); `signUp` (Task 7).
- Produces (models): `Clan` (`name`, `hometown`, `description`, `ownerId`, timestamps), `type ClanDocument`; `Membership` (`clanId`, `userId`, `role`, `createdAt`; unique `(clanId, userId)`).
- Produces: `createRequireClanRole(minimum: ClanRole): RequestHandler` — non-members and malformed ids get `NOT_FOUND`, a lower role gets `FORBIDDEN`; sets `res.locals.membership`.
- Produces: `toClan(clan, role, memberCount)`; routes `GET /api/clans`, `POST /api/clans` (201), `GET /api/clans/:id` (viewer), `PATCH /api/clans/:id` (owner), `GET /api/clans/:id/members` (viewer), `PATCH /api/clans/:id/members/:userId` (owner), `DELETE /api/clans/:id/members/:userId` (any member: leave; owner: remove others).
- Produces (tests): `createClan(agent, body?) → Clan`, `addMember(clanId, userId, role)`.
- Out of scope: deleting a clan (lands with the tree data in P5, which must delete people and operations too). The other spec fields of `Clan` (`progenitorId`, `version`, `settings`, `theme`) arrive with the features that use them (P5, P6b).

- [ ] **Step 1: Write the models**

Create `apps/api/src/models/Clan.ts`:

```ts
import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const clanSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    hometown: { type: String, default: '', trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export type ClanDocument = HydratedDocument<InferSchemaType<typeof clanSchema>>;
export const Clan = model('Clan', clanSchema);
```

Create `apps/api/src/models/Membership.ts`:

```ts
import { model, Schema } from 'mongoose';

const membershipSchema = new Schema(
  {
    clanId: { type: Schema.Types.ObjectId, ref: 'Clan', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['owner', 'editor', 'viewer'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

membershipSchema.index({ clanId: 1, userId: 1 }, { unique: true });

export const Membership = model('Membership', membershipSchema);
```

- [ ] **Step 2: Write the failing role-check test**

Create `apps/api/src/clans/access.test.ts`:

```ts
import cookieParser from 'cookie-parser';
import express from 'express';
import { Types } from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '../http/errorHandler.ts';
import { getLocals } from '../http/locals.ts';
import { Membership } from '../models/Membership.ts';
import { useTestDatabase } from '../test/database.ts';
import { createRequireClanRole } from './access.ts';

useTestDatabase();

const userId = new Types.ObjectId().toString();
const clanId = new Types.ObjectId().toString();

const app = express();
app.use(cookieParser());
app.use((_req, res, next) => {
  getLocals(res).userId = userId;
  next();
});
app.get('/clans/:id', createRequireClanRole('editor'), (_req, res) => {
  res.json(getLocals(res).membership);
});
app.use(createErrorHandler(pino({ level: 'silent' })));

describe('requireClanRole', () => {
  it('lets a member with the role or higher through', async () => {
    await Membership.create({ clanId, userId, role: 'owner' });
    const response = await request(app).get(`/clans/${clanId}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ clanId, userId, role: 'owner' });
  });

  it('answers 403 to a member with a lower role', async () => {
    await Membership.create({ clanId, userId, role: 'viewer' });
    const response = await request(app).get(`/clans/${clanId}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('answers 404 to non-members and malformed ids, so clans cannot be probed', async () => {
    for (const id of [clanId, 'not-an-id']) {
      const response = await request(app).get(`/clans/${id}`);
      expect(response.status, id).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
  });
});
```

Run: `pnpm vitest run apps/api/src/clans`
Expected: FAIL (`./access.ts` does not exist).

- [ ] **Step 3: Write the role check and the DTOs**

Create `apps/api/src/clans/access.ts`:

```ts
import { ClanRoleSchema, hasRoleAtLeast, IdSchema, type ClanRole } from '@ancestors-tree/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../http/AppError.ts';
import { getLocals } from '../http/locals.ts';
import { Membership } from '../models/Membership.ts';

/**
 * The `{ clanRole }` access level (spec §3, §12). Runs after requireAuth. The clan comes only
 * from `:id`, never from the request body.
 */
export function createRequireClanRole(minimum: ClanRole): RequestHandler {
  return async (req, res, next) => {
    const locals = getLocals(res);
    if (!locals.userId) throw new Error('requireClanRole must run after requireAuth');
    const clanId = IdSchema.safeParse(req.params.id);
    const membership = clanId.success
      ? await Membership.findOne({ clanId: clanId.data, userId: locals.userId })
      : null;
    // Non-members cannot tell a clan they are not in from one that does not exist.
    if (!clanId.success || !membership) throw new AppError('NOT_FOUND', 'Clan not found');
    const role = ClanRoleSchema.parse(membership.role);
    if (!hasRoleAtLeast(role, minimum)) {
      throw new AppError('FORBIDDEN', `This needs the ${minimum} role in the clan`);
    }
    locals.membership = { clanId: clanId.data, userId: locals.userId, role };
    next();
  };
}
```

Create `apps/api/src/clans/dto.ts`:

```ts
import type { ClanRole } from '@ancestors-tree/shared';
import type { ClanDocument } from '../models/Clan.ts';

export function toClan(clan: ClanDocument, role: ClanRole, memberCount: number) {
  return {
    id: clan.id as string,
    name: clan.name,
    hometown: clan.hometown,
    description: clan.description,
    role,
    memberCount,
    createdAt: clan.createdAt.toISOString(),
  };
}
```

Run: `pnpm vitest run apps/api/src/clans`
Expected: PASS (3 tests).

- [ ] **Step 4: Write the test helpers and the failing route tests**

Create `apps/api/src/test/clans.ts`:

```ts
import { ClanSchema, type Clan, type ClanRole } from '@ancestors-tree/shared';
import type request from 'supertest';
import { Membership } from '../models/Membership.ts';

type Agent = ReturnType<typeof request.agent>;

export async function createClan(
  agent: Agent,
  body: { name: string; hometown?: string } = { name: 'Họ Nguyễn' },
): Promise<Clan> {
  const response = await agent.post('/api/clans').send(body);
  if (response.status !== 201) {
    throw new Error(`Create clan failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return ClanSchema.parse(response.body);
}

/** Adds a member directly (the invite flow has its own tests). */
export async function addMember(clanId: string, userId: string, role: ClanRole): Promise<void> {
  await Membership.create({ clanId, userId, role });
}
```

Create `apps/api/src/routes/clans.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Clan } from '../models/Clan.ts';
import { Membership } from '../models/Membership.ts';
import { createTestApp } from '../test/app.ts';
import { addMember, createClan } from '../test/clans.ts';
import { useTestDatabase } from '../test/database.ts';
import { signUp } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();

describe('clans', () => {
  it('creates a clan with the creator as its owner', async () => {
    const { agent, user } = await signUp(app);
    const response = await agent.post('/api/clans').send({ name: ' Họ Nguyễn ', hometown: 'Nam Định' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Họ Nguyễn',
      hometown: 'Nam Định',
      description: '',
      role: 'owner',
      memberCount: 1,
    });
    expect(await Clan.countDocuments()).toBe(1);
    expect(await Membership.findOne({ userId: user.id })).toMatchObject({ role: 'owner' });
  });

  it('validates the name', async () => {
    const { agent } = await signUp(app);
    expect((await agent.post('/api/clans').send({ name: '   ' })).status).toBe(400);
  });

  it('lists only my clans, with my role and the member count', async () => {
    const owner = await signUp(app);
    const viewer = await signUp(app);
    const stranger = await signUp(app);
    const nguyen = await createClan(owner.agent, { name: 'Họ Nguyễn' });
    await createClan(stranger.agent, { name: 'Họ Trần' });
    await addMember(nguyen.id, viewer.user.id, 'viewer');

    const list = await viewer.agent.get('/api/clans');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: nguyen.id, role: 'viewer', memberCount: 2 });
  });

  it('shows a clan to its members only', async () => {
    const owner = await signUp(app);
    const stranger = await signUp(app);
    const clan = await createClan(owner.agent);
    expect((await owner.agent.get(`/api/clans/${clan.id}`)).body).toMatchObject({ role: 'owner' });
    expect((await stranger.agent.get(`/api/clans/${clan.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/clans/${clan.id}`)).status).toBe(401);
  });

  it('lets only the owner change the clan settings', async () => {
    const owner = await signUp(app);
    const editor = await signUp(app);
    const clan = await createClan(owner.agent);
    await addMember(clan.id, editor.user.id, 'editor');

    const denied = await editor.agent.patch(`/api/clans/${clan.id}`).send({ name: 'Đổi tên' });
    expect(denied.status).toBe(403);
    const changed = await owner.agent
      .patch(`/api/clans/${clan.id}`)
      .send({ description: 'Gia phả họ Nguyễn' });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ name: 'Họ Nguyễn', description: 'Gia phả họ Nguyễn' });
  });
});
```

Create `apps/api/src/routes/members.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app.ts';
import { addMember, createClan } from '../test/clans.ts';
import { useTestDatabase } from '../test/database.ts';
import { signUp } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();

async function clanWithMembers() {
  const owner = await signUp(app, { name: 'Ông Thịnh' });
  const editor = await signUp(app, { name: 'Bố Tuấn' });
  const viewer = await signUp(app, { name: 'Cô Hà' });
  const clan = await createClan(owner.agent);
  await addMember(clan.id, editor.user.id, 'editor');
  await addMember(clan.id, viewer.user.id, 'viewer');
  return { owner, editor, viewer, clan, path: `/api/clans/${clan.id}/members` };
}

describe('members', () => {
  it('lists members, owner first; only the owner sees everyone’s email', async () => {
    const { owner, editor, viewer, path } = await clanWithMembers();

    const asOwner = await owner.agent.get(path);
    expect(asOwner.body.map((m: { role: string }) => m.role)).toEqual(['owner', 'editor', 'viewer']);
    expect(asOwner.body.every((m: { email?: string }) => typeof m.email === 'string')).toBe(true);
    expect(asOwner.body[0]).toMatchObject({ name: 'Ông Thịnh', isYou: true });

    const asEditor = await editor.agent.get(path);
    const emails = asEditor.body.map((m: { email?: string }) => m.email);
    expect(emails).toEqual([undefined, editor.user.email, undefined]);
    expect((await viewer.agent.get(path)).status).toBe(200);
  });

  it('lets the owner change roles, except their own', async () => {
    const { owner, editor, viewer, path } = await clanWithMembers();
    const promoted = await owner.agent.patch(`${path}/${viewer.user.id}`).send({ role: 'editor' });
    expect(promoted.status).toBe(200);
    expect(promoted.body).toMatchObject({ userId: viewer.user.id, role: 'editor' });

    expect((await editor.agent.patch(`${path}/${viewer.user.id}`).send({ role: 'viewer' })).status).toBe(
      403,
    );
    expect((await owner.agent.patch(`${path}/${owner.user.id}`).send({ role: 'viewer' })).status).toBe(
      403,
    );
    expect((await owner.agent.patch(`${path}/${viewer.user.id}`).send({ role: 'owner' })).status).toBe(
      400,
    );
    const stranger = await signUp(app);
    expect(
      (await owner.agent.patch(`${path}/${stranger.user.id}`).send({ role: 'viewer' })).status,
    ).toBe(404);
  });

  it('lets members leave and the owner remove others', async () => {
    const { owner, editor, viewer, clan, path } = await clanWithMembers();
    expect((await editor.agent.delete(`${path}/${viewer.user.id}`)).status).toBe(403);
    expect((await viewer.agent.delete(`${path}/${viewer.user.id}`)).status).toBe(204);
    expect((await viewer.agent.get(`/api/clans/${clan.id}`)).status).toBe(404);

    expect((await owner.agent.delete(`${path}/${editor.user.id}`)).status).toBe(204);
    expect((await editor.agent.get(`/api/clans/${clan.id}`)).status).toBe(404);

    const ownerLeaves = await owner.agent.delete(`${path}/${owner.user.id}`);
    expect(ownerLeaves.status).toBe(403);
  });
});
```

Run: `pnpm vitest run apps/api/src/routes/clans.test.ts apps/api/src/routes/members.test.ts`
Expected: FAIL (routes do not exist).

- [ ] **Step 5: Write the clan routes**

Create `apps/api/src/routes/clans.ts`:

```ts
import {
  ClanListSchema,
  ClanSchema,
  CreateClanRequestSchema,
  IdSchema,
  UpdateClanRequestSchema,
  type ClanRole,
} from '@ancestors-tree/shared';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { toClan } from '../clans/dto.ts';
import { AppError } from '../http/AppError.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';
import { Clan } from '../models/Clan.ts';
import { Membership } from '../models/Membership.ts';

const ClanParamsSchema = z.object({ id: IdSchema });

async function memberCounts(clanIds: Types.ObjectId[]): Promise<Map<string, number>> {
  const counts = await Membership.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { clanId: { $in: clanIds } } },
    { $group: { _id: '$clanId', count: { $sum: 1 } } },
  ]);
  return new Map(counts.map((row) => [row._id.toString(), row.count]));
}

async function loadClan(clanId: string) {
  const clan = await Clan.findById(clanId);
  if (!clan) throw new AppError('NOT_FOUND', 'Clan not found');
  return clan;
}

export function registerClanRoutes(api: RouteRegistry): void {
  api.define({
    method: 'get',
    path: '/clans',
    summary: 'The clans you belong to',
    tags: ['Clans'],
    access: 'signedIn',
    responses: { 200: { description: 'Your clans, by name', schema: ClanListSchema } },
    handler: async ({ userId }) => {
      const memberships = await Membership.find({ userId: userId() });
      const roles = new Map(memberships.map((m) => [m.clanId.toString(), m.role as ClanRole]));
      const clanIds = memberships.map((m) => m.clanId);
      const [clans, counts] = await Promise.all([
        Clan.find({ _id: { $in: clanIds } }),
        memberCounts(clanIds),
      ]);
      const body = clans
        .map((clan) => toClan(clan, roles.get(clan.id as string) ?? 'viewer', counts.get(clan.id as string) ?? 1))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      return { status: 200, body };
    },
  });

  api.define({
    method: 'post',
    path: '/clans',
    summary: 'Create a clan; you become its owner',
    tags: ['Clans'],
    access: 'signedIn',
    request: { body: CreateClanRequestSchema },
    responses: { 201: { description: 'The new clan', schema: ClanSchema } },
    handler: async ({ userId, body }) => {
      const clan = new Clan({ ...body, ownerId: userId() });
      const membership = new Membership({ clanId: clan._id, userId: userId(), role: 'owner' });
      // Both or neither. connection.transaction() also resets the documents if it retries.
      await mongoose.connection.transaction(async (session) => {
        await clan.save({ session });
        await membership.save({ session });
      });
      return { status: 201, body: toClan(clan, 'owner', 1) };
    },
  });

  api.define({
    method: 'get',
    path: '/clans/:id',
    summary: 'One clan',
    tags: ['Clans'],
    access: { clanRole: 'viewer' },
    request: { params: ClanParamsSchema },
    responses: { 200: { description: 'The clan', schema: ClanSchema } },
    handler: async ({ params, membership }) => {
      const [clan, counts] = await Promise.all([
        loadClan(params.id),
        memberCounts([new Types.ObjectId(params.id)]),
      ]);
      return { status: 200, body: toClan(clan, membership().role, counts.get(params.id) ?? 1) };
    },
  });

  api.define({
    method: 'patch',
    path: '/clans/:id',
    summary: 'Change the clan name, hometown or description',
    tags: ['Clans'],
    access: { clanRole: 'owner' },
    request: { params: ClanParamsSchema, body: UpdateClanRequestSchema },
    responses: { 200: { description: 'The updated clan', schema: ClanSchema } },
    handler: async ({ params, body, membership }) => {
      const clan = await loadClan(params.id);
      clan.set(body);
      await clan.save();
      const counts = await memberCounts([clan._id]);
      return { status: 200, body: toClan(clan, membership().role, counts.get(params.id) ?? 1) };
    },
  });
}
```

- [ ] **Step 6: Write the member routes**

Create `apps/api/src/routes/members.ts`:

```ts
import {
  ClanRoleSchema,
  hasRoleAtLeast,
  IdSchema,
  MemberListSchema,
  MemberSchema,
  UpdateMemberRequestSchema,
  type ClanRole,
} from '@ancestors-tree/shared';
import { z } from 'zod';
import { AppError } from '../http/AppError.ts';
import type { ClanMembership } from '../http/locals.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';
import { Membership } from '../models/Membership.ts';
import { User } from '../models/User.ts';

const MemberParamsSchema = z.object({ id: IdSchema, userId: IdSchema });
const ROLE_ORDER: Record<ClanRole, number> = { owner: 0, editor: 1, viewer: 2 };

interface MemberRow {
  userId: string;
  role: ClanRole;
  joinedAt: Date;
}

async function describeMembers(rows: MemberRow[], caller: ClanMembership) {
  const users = await User.find({ _id: { $in: rows.map((row) => row.userId) } });
  const byId = new Map(users.map((user) => [user.id as string, user]));
  const isOwner = caller.role === 'owner';
  return rows
    .map((row) => {
      const user = byId.get(row.userId);
      const isYou = row.userId === caller.userId;
      return {
        userId: row.userId,
        name: user?.name ?? '',
        // Emails are personal: only the owner sees them, and everyone sees their own (spec §3).
        ...(isOwner || isYou ? { email: user?.email ?? '' } : {}),
        role: row.role,
        joinedAt: row.joinedAt.toISOString(),
        isYou,
      };
    })
    .sort(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt.localeCompare(b.joinedAt),
    );
}

function toRow(membership: { userId: { toString(): string }; role: string; createdAt: Date }): MemberRow {
  return {
    userId: membership.userId.toString(),
    role: ClanRoleSchema.parse(membership.role),
    joinedAt: membership.createdAt,
  };
}

async function findTarget(clanId: string, userId: string) {
  const target = await Membership.findOne({ clanId, userId });
  if (!target) throw new AppError('NOT_FOUND', 'This person is not a member of the clan');
  return target;
}

export function registerMemberRoutes(api: RouteRegistry): void {
  api.define({
    method: 'get',
    path: '/clans/:id/members',
    summary: 'Members of the clan',
    tags: ['Members'],
    access: { clanRole: 'viewer' },
    request: { params: z.object({ id: IdSchema }) },
    responses: { 200: { description: 'Owner first, then editors, then viewers', schema: MemberListSchema } },
    handler: async ({ params, membership }) => {
      const memberships = await Membership.find({ clanId: params.id });
      return { status: 200, body: await describeMembers(memberships.map(toRow), membership()) };
    },
  });

  api.define({
    method: 'patch',
    path: '/clans/:id/members/:userId',
    summary: 'Change a member’s role (editor or viewer)',
    tags: ['Members'],
    access: { clanRole: 'owner' },
    request: { params: MemberParamsSchema, body: UpdateMemberRequestSchema },
    responses: { 200: { description: 'The member with the new role', schema: MemberSchema } },
    handler: async ({ params, body, membership }) => {
      if (params.userId === membership().userId) {
        throw new AppError('FORBIDDEN', 'The owner’s role cannot change');
      }
      const target = await findTarget(params.id, params.userId);
      target.role = body.role;
      await target.save();
      const [member] = await describeMembers([toRow(target)], membership());
      if (!member) throw new Error('Member disappeared while updating');
      return { status: 200, body: member };
    },
  });

  api.define({
    method: 'delete',
    path: '/clans/:id/members/:userId',
    summary: 'Leave the clan, or (owner) remove a member',
    tags: ['Members'],
    access: { clanRole: 'viewer' },
    request: { params: MemberParamsSchema },
    responses: { 204: { description: 'Removed' } },
    handler: async ({ params, membership }) => {
      const caller = membership();
      const leaving = params.userId === caller.userId;
      if (leaving && caller.role === 'owner') {
        throw new AppError('FORBIDDEN', 'The owner cannot leave the clan');
      }
      if (!leaving && !hasRoleAtLeast(caller.role, 'owner')) {
        throw new AppError('FORBIDDEN', 'Only the owner can remove members');
      }
      const target = await findTarget(params.id, params.userId);
      await target.deleteOne();
      return { status: 204 };
    },
  });
}
```

- [ ] **Step 7: Wire the clan role policy and the routes**

In `apps/api/src/app.ts`:
- add imports `import { createRequireClanRole } from './clans/access.ts';`, `import { registerClanRoutes } from './routes/clans.ts';`, `import { registerMemberRoutes } from './routes/members.ts';`;
- delete `notConfigured` (and the `RequestHandler` type import if now unused);
- replace the `policies` line with:

```ts
  const policies: AccessPolicies = {
    signedIn,
    clanRole: (role) => [...signedIn, createRequireClanRole(role)],
  };
```

- after `registerGoogleRoutes(...)` add `registerClanRoutes(api);` and `registerMemberRoutes(api);`.

- [ ] **Step 8: Run the tests and watch them pass**

Run: `pnpm vitest run apps/api`
Expected: PASS.

- [ ] **Step 9: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/api/src
git commit -m "feat(api): clans and members with role checks"
```

---

### Task 11: Invites API

**Files:**
- Create: `apps/api/src/models/Invite.ts`, `apps/api/src/routes/invites.ts`
- Test: `apps/api/src/routes/invites.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `randomToken` (Task 6), `Membership`, `Clan`, `createClan`, `addMember` (Task 10), shared `InviteSchema`, `InviteListSchema`, `InvitePreviewSchema`, `AcceptInviteResponseSchema`, `CreateInviteRequestSchema` (Task 3).
- Produces: `INVITE_TTL_MS = 7 days`; `Invite` model (`clanId`, `token` unique, `role`, `createdBy`, `expiresAt` TTL); routes:
  - `GET /api/clans/:id/invites` (owner) — active invites, newest first;
  - `POST /api/clans/:id/invites` (owner) → 201 `Invite`;
  - `DELETE /api/clans/:id/invites/:inviteId` (owner) → 204 (revoking deletes the invite);
  - `GET /api/invites/:token` (public) → `InvitePreview`; unknown or expired → 400 `INVALID_TOKEN`;
  - `POST /api/invites/:token/accept` (signed in) → 200 `AcceptInviteResponse`; existing members keep their role (`alreadyMember: true`).
- Invite tokens are stored as they are (spec §5: the owner can copy a link again); they expire after 7 days and only grant membership.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/invites.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Invite } from '../models/Invite.ts';
import { createTestApp } from '../test/app.ts';
import { addMember, createClan } from '../test/clans.ts';
import { useTestDatabase } from '../test/database.ts';
import { signUp } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();
const DAY_MS = 24 * 60 * 60 * 1000;

async function ownerWithClan() {
  const owner = await signUp(app, { name: 'Ông Thịnh' });
  const clan = await createClan(owner.agent, { name: 'Họ Nguyễn' });
  return { owner, clan, path: `/api/clans/${clan.id}/invites` };
}

describe('invites', () => {
  it('lets the owner create an invite that lasts 7 days', async () => {
    const { owner, path } = await ownerWithClan();
    const response = await owner.agent.post(path).send({ role: 'editor' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ role: 'editor', createdByName: 'Ông Thịnh' });
    expect(response.body.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const lifetime = Date.parse(response.body.expiresAt) - Date.parse(response.body.createdAt);
    expect(Math.abs(lifetime - 7 * DAY_MS)).toBeLessThan(5000);

    const list = await owner.agent.get(path);
    expect(list.body).toHaveLength(1);
  });

  it('keeps invites to the owner', async () => {
    const { clan, path } = await ownerWithClan();
    const editor = await signUp(app);
    await addMember(clan.id, editor.user.id, 'editor');
    expect((await editor.agent.post(path).send({ role: 'viewer' })).status).toBe(403);
    expect((await editor.agent.get(path)).status).toBe(403);
  });

  it('previews an invite without signing in', async () => {
    const { owner, path } = await ownerWithClan();
    const { token } = (await owner.agent.post(path).send({ role: 'viewer' })).body;
    const preview = await request(app).get(`/api/invites/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      clanName: 'Họ Nguyễn',
      role: 'viewer',
      invitedByName: 'Ông Thịnh',
    });
    const unknown = await request(app).get(`/api/invites/${'a'.repeat(32)}`);
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('INVALID_TOKEN');
  });

  it('lets several people join with one link, once each', async () => {
    const { owner, clan, path } = await ownerWithClan();
    const { token } = (await owner.agent.post(path).send({ role: 'editor' })).body;
    const lan = await signUp(app);
    const tuan = await signUp(app);

    const joined = await lan.agent.post(`/api/invites/${token}/accept`);
    expect(joined.status).toBe(200);
    expect(joined.body).toEqual({ clanId: clan.id, role: 'editor', alreadyMember: false });
    expect((await tuan.agent.post(`/api/invites/${token}/accept`)).body.alreadyMember).toBe(false);

    const again = await lan.agent.post(`/api/invites/${token}/accept`);
    expect(again.body).toEqual({ clanId: clan.id, role: 'editor', alreadyMember: true });
    const ownerJoins = await owner.agent.post(`/api/invites/${token}/accept`);
    expect(ownerJoins.body).toEqual({ clanId: clan.id, role: 'owner', alreadyMember: true });

    expect((await lan.agent.get('/api/clans')).body[0]).toMatchObject({ id: clan.id, role: 'editor' });
  });

  it('needs a session to accept', async () => {
    const { owner, path } = await ownerWithClan();
    const { token } = (await owner.agent.post(path).send({ role: 'viewer' })).body;
    expect((await request(app).post(`/api/invites/${token}/accept`)).status).toBe(401);
  });

  it('stops working when revoked or expired', async () => {
    const { owner, clan, path } = await ownerWithClan();
    const invite = (await owner.agent.post(path).send({ role: 'viewer' })).body;
    expect((await owner.agent.delete(`${path}/${invite.id}`)).status).toBe(204);
    const joiner = await signUp(app);
    const revoked = await joiner.agent.post(`/api/invites/${invite.token}/accept`);
    expect(revoked.body.error.code).toBe('INVALID_TOKEN');

    await Invite.create({
      clanId: clan.id,
      token: 'e'.repeat(32),
      role: 'viewer',
      createdBy: owner.user.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect((await request(app).get(`/api/invites/${'e'.repeat(32)}`)).body.error.code).toBe(
      'INVALID_TOKEN',
    );
    expect((await owner.agent.get(path)).body).toEqual([]);
  });

  it('cannot revoke another clan’s invite', async () => {
    const first = await ownerWithClan();
    const second = await ownerWithClan();
    const invite = (await first.owner.agent.post(first.path).send({ role: 'viewer' })).body;
    expect((await second.owner.agent.delete(`${second.path}/${invite.id}`)).status).toBe(404);
  });
});
```

Run: `pnpm vitest run apps/api/src/routes/invites.test.ts`
Expected: FAIL.

- [ ] **Step 2: Write the model and the routes**

Create `apps/api/src/models/Invite.ts`:

```ts
import { model, Schema } from 'mongoose';

const inviteSchema = new Schema(
  {
    clanId: { type: Schema.Types.ObjectId, ref: 'Clan', required: true, index: true },
    /** 32 URL-safe characters (spec §5, §12); kept so the owner can copy the link again. */
    token: { type: String, required: true, unique: true },
    role: { type: String, enum: ['editor', 'viewer'], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** MongoDB deletes expired invites (TTL index). */
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Invite = model('Invite', inviteSchema);
```

Create `apps/api/src/routes/invites.ts`:

```ts
import {
  AcceptInviteResponseSchema,
  ClanRoleSchema,
  CreateInviteRequestSchema,
  IdSchema,
  InviteListSchema,
  InvitePreviewSchema,
  InviteRoleSchema,
  InviteSchema,
} from '@ancestors-tree/shared';
import { z } from 'zod';
import { randomToken } from '../auth/tokens.ts';
import { AppError } from '../http/AppError.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';
import { Clan } from '../models/Clan.ts';
import { Invite } from '../models/Invite.ts';
import { Membership } from '../models/Membership.ts';
import { User } from '../models/User.ts';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DUPLICATE_KEY = 11000;

const TokenParamsSchema = z.object({ token: z.string().max(100) });

interface InviteRecord {
  id: unknown;
  token: string;
  role: string;
  createdBy: { toString(): string };
  createdAt: Date;
  expiresAt: Date;
}

async function namesOf(userIds: string[]): Promise<Map<string, string>> {
  const users = await User.find({ _id: { $in: userIds } });
  return new Map(users.map((user) => [user.id as string, user.name]));
}

function toInvite(invite: InviteRecord, names: Map<string, string>) {
  return {
    id: invite.id as string,
    token: invite.token,
    role: InviteRoleSchema.parse(invite.role),
    createdByName: names.get(invite.createdBy.toString()) ?? '',
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
  };
}

/** A usable invite, or INVALID_TOKEN (wrong, revoked or expired: the web shows one message). */
async function findUsableInvite(token: string) {
  const invite = await Invite.findOne({ token, expiresAt: { $gt: new Date() } });
  if (!invite) throw new AppError('INVALID_TOKEN', 'This invite link is wrong, expired or revoked');
  return invite;
}

export function registerInviteRoutes(api: RouteRegistry): void {
  api.define({
    method: 'get',
    path: '/clans/:id/invites',
    summary: 'Active invite links of the clan',
    tags: ['Invites'],
    access: { clanRole: 'owner' },
    request: { params: z.object({ id: IdSchema }) },
    responses: { 200: { description: 'Newest first', schema: InviteListSchema } },
    handler: async ({ params }) => {
      const invites = await Invite.find({ clanId: params.id, expiresAt: { $gt: new Date() } }).sort({
        createdAt: -1,
      });
      const names = await namesOf(invites.map((invite) => invite.createdBy.toString()));
      return { status: 200, body: invites.map((invite) => toInvite(invite, names)) };
    },
  });

  api.define({
    method: 'post',
    path: '/clans/:id/invites',
    summary: 'Create an invite link (multi-use, 7 days)',
    tags: ['Invites'],
    access: { clanRole: 'owner' },
    request: { params: z.object({ id: IdSchema }), body: CreateInviteRequestSchema },
    responses: { 201: { description: 'The new invite', schema: InviteSchema } },
    handler: async ({ params, body, userId }) => {
      const invite = await Invite.create({
        clanId: params.id,
        token: randomToken(24),
        role: body.role,
        createdBy: userId(),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });
      return { status: 201, body: toInvite(invite, await namesOf([userId()])) };
    },
  });

  api.define({
    method: 'delete',
    path: '/clans/:id/invites/:inviteId',
    summary: 'Revoke an invite link',
    tags: ['Invites'],
    access: { clanRole: 'owner' },
    request: { params: z.object({ id: IdSchema, inviteId: IdSchema }) },
    responses: { 204: { description: 'Revoked' } },
    handler: async ({ params }) => {
      const result = await Invite.deleteOne({ _id: params.inviteId, clanId: params.id });
      if (result.deletedCount === 0) throw new AppError('NOT_FOUND', 'Invite not found');
      return { status: 204 };
    },
  });

  api.define({
    method: 'get',
    path: '/invites/:token',
    summary: 'What an invite link offers (no sign-in needed)',
    tags: ['Invites'],
    access: 'public',
    request: { params: TokenParamsSchema },
    responses: { 200: { description: 'The clan and role on offer', schema: InvitePreviewSchema } },
    handler: async ({ params }) => {
      const invite = await findUsableInvite(params.token);
      const [clan, names] = await Promise.all([
        Clan.findById(invite.clanId),
        namesOf([invite.createdBy.toString()]),
      ]);
      if (!clan) throw new AppError('INVALID_TOKEN', 'This invite link is wrong, expired or revoked');
      return {
        status: 200,
        body: {
          clanName: clan.name,
          role: InviteRoleSchema.parse(invite.role),
          invitedByName: names.get(invite.createdBy.toString()) ?? '',
          expiresAt: invite.expiresAt.toISOString(),
        },
      };
    },
  });

  api.define({
    method: 'post',
    path: '/invites/:token/accept',
    summary: 'Join the clan of an invite link',
    tags: ['Invites'],
    access: 'signedIn',
    request: { params: TokenParamsSchema },
    responses: { 200: { description: 'Your membership', schema: AcceptInviteResponseSchema } },
    handler: async ({ params, userId }) => {
      const invite = await findUsableInvite(params.token);
      const clanId = invite.clanId.toString();
      const existing = await Membership.findOne({ clanId, userId: userId() });
      if (existing) {
        // Never change an existing member's role through a link.
        return {
          status: 200,
          body: { clanId, role: ClanRoleSchema.parse(existing.role), alreadyMember: true },
        };
      }
      try {
        await Membership.create({ clanId, userId: userId(), role: invite.role });
      } catch (error) {
        // The same person accepted twice at the same moment: the unique index keeps one.
        if ((error as { code?: unknown }).code !== DUPLICATE_KEY) throw error;
        return {
          status: 200,
          body: { clanId, role: InviteRoleSchema.parse(invite.role), alreadyMember: true },
        };
      }
      return {
        status: 200,
        body: { clanId, role: InviteRoleSchema.parse(invite.role), alreadyMember: false },
      };
    },
  });
}
```

In `apps/api/src/app.ts`, import `registerInviteRoutes` from `./routes/invites.ts` and call `registerInviteRoutes(api);` after `registerMemberRoutes(api);`.

- [ ] **Step 3: Run the tests and watch them pass**

Run: `pnpm vitest run apps/api`
Expected: PASS.

- [ ] **Step 4: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/api/src
git commit -m "feat(api): invite links with public preview and idempotent accept"
```

---

### Task 12: Web API client upgrade

**Files:**
- Modify: `apps/web/src/shared/lib/apiError.ts`, `apps/web/src/shared/lib/apiClient.ts`
- Test: `apps/web/src/shared/lib/apiClient.test.ts`, create `apps/web/src/shared/lib/apiError.test.ts`
- Modify: `apps/web/src/app/providers.tsx`
- Create: `apps/web/src/test/api.ts`

**Interfaces:**
- Produces: `ApiError(code, message, status, details?: ErrorDetail[])` with `readonly details`; `errorCodeForStatus(status: number): ClientErrorCode`; `shouldRetryQuery(failureCount: number, error: unknown): boolean` (no retry for 4xx, one retry otherwise).
- Produces: `interface ApiRequestOptions extends Omit<RequestInit, 'body'> { json?: unknown }`; `apiRequest<T>(path, schema, options?)`. `json` sets `Content-Type: application/json`; pass `z.undefined()` as the schema for 204 responses; `signal` passes through; a `401` on any path outside `/auth/` triggers one shared `POST /api/auth/refresh`, then a single retry.
- Produces (tests): `mockApi(routes: MockRoutes): { calls: ApiCall[]; unhandled: string[] }` with defaults for `GET /health`, `GET /me` (signed out), `POST /auth/refresh` (401) and `GET /auth/providers` (`{ google: false }`); `UNAUTHENTICATED_REPLY`; `apiErrorReply(code, status, message?)`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/shared/lib/apiError.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError, errorCodeForStatus, errorMessageKey, shouldRetryQuery } from './apiError';

describe('apiError', () => {
  it('maps statuses to codes when the server sends an unknown code', () => {
    expect(errorCodeForStatus(400)).toBe('VALIDATION_ERROR');
    expect(errorCodeForStatus(401)).toBe('UNAUTHENTICATED');
    expect(errorCodeForStatus(403)).toBe('FORBIDDEN');
    expect(errorCodeForStatus(404)).toBe('NOT_FOUND');
    expect(errorCodeForStatus(429)).toBe('RATE_LIMITED');
    expect(errorCodeForStatus(503)).toBe('INTERNAL_ERROR');
    expect(errorCodeForStatus(418)).toBe('INVALID_RESPONSE');
  });

  it('retries server and network errors once, never client errors', () => {
    expect(shouldRetryQuery(0, new ApiError('NOT_FOUND', 'x', 404))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError('INTERNAL_ERROR', 'x', 500))).toBe(true);
    expect(shouldRetryQuery(0, new ApiError('NETWORK_ERROR', 'x', 0))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError('NETWORK_ERROR', 'x', 0))).toBe(false);
  });

  it('keeps validation details', () => {
    const error = new ApiError('VALIDATION_ERROR', 'Invalid', 400, [
      { path: 'body.email', message: 'Invalid email' },
    ]);
    expect(error.details).toEqual([{ path: 'body.email', message: 'Invalid email' }]);
    expect(errorMessageKey(error)).toBe('errors.VALIDATION_ERROR');
  });
});
```

Add these tests to `apps/web/src/shared/lib/apiClient.test.ts` (keep the existing ones; the existing `apiRequest(path, schema, init)` calls keep working because `RequestInit` options are still accepted):

```ts
describe('apiRequest options', () => {
  it('sends JSON bodies with a Content-Type', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 'a1' }, 201));
    await apiRequest('/items', ItemSchema, { method: 'POST', json: { name: 'Lan' } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"Lan"}');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    await expect(apiRequest('/items/a1', z.undefined(), { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('passes the abort signal through', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 'a1' }));
    const controller = new AbortController();
    await apiRequest('/items/a1', ItemSchema, { signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it('falls back to a code by status for unknown error bodies, and keeps details', async () => {
    mockFetch(async () => jsonResponse({ error: { code: 'BRAND_NEW_CODE', message: 'x' } }, 404));
    await expect(apiRequest('/items', ItemSchema)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    mockFetch(async () =>
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: [{ path: 'body.name', message: 'Too small' }],
          },
        },
        400,
      ),
    );
    await expect(apiRequest('/items', ItemSchema)).rejects.toMatchObject({
      details: [{ path: 'body.name', message: 'Too small' }],
    });
  });
});

describe('session refresh', () => {
  const unauthenticated = () =>
    jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'Sign in' } }, 401);

  it('refreshes once on 401 and retries the request', async () => {
    let signedIn = false;
    const fetchMock = mockFetch(async (...args: unknown[]) => {
      const url = String(args[0]);
      if (url === '/api/auth/refresh') {
        signedIn = true;
        return new Response(null, { status: 204 });
      }
      return signedIn ? jsonResponse({ id: 'a1' }) : unauthenticated();
    });
    await expect(apiRequest('/items/a1', ItemSchema)).resolves.toEqual({ id: 'a1' });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      '/api/items/a1',
      '/api/auth/refresh',
      '/api/items/a1',
    ]);
  });

  it('shares one refresh between requests that fail together', async () => {
    let refreshes = 0;
    let signedIn = false;
    mockFetch(async (...args: unknown[]) => {
      if (String(args[0]) === '/api/auth/refresh') {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        signedIn = true;
        return new Response(null, { status: 204 });
      }
      return signedIn ? jsonResponse({ id: 'a1' }) : unauthenticated();
    });
    await Promise.all([apiRequest('/a', ItemSchema), apiRequest('/b', ItemSchema)]);
    expect(refreshes).toBe(1);
  });

  it('gives up with UNAUTHENTICATED when the refresh fails', async () => {
    mockFetch(async () => unauthenticated());
    await expect(apiRequest('/items/a1', ItemSchema)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    });
  });

  it('never refreshes for the auth endpoints themselves', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({ error: { code: 'INVALID_CREDENTIALS', message: 'Wrong' } }, 401),
    );
    await expect(
      apiRequest('/auth/login', ItemSchema, { method: 'POST', json: {} }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

(Change `mockFetch`'s parameter type to `(...args: unknown[]) => Promise<Response>` if TypeScript rejects the calls above.)

Run: `pnpm vitest run apps/web/src/shared/lib`
Expected: FAIL.

- [ ] **Step 2: Write the error helpers**

Replace `apps/web/src/shared/lib/apiError.ts` with:

```ts
import type { ErrorCode, ErrorDetail } from '@ancestors-tree/shared';

/** Codes produced by the client itself, never sent by the API. */
export const CLIENT_ONLY_ERROR_CODES = ['NETWORK_ERROR', 'INVALID_RESPONSE'] as const;

export type ClientErrorCode = ErrorCode | (typeof CLIENT_ONLY_ERROR_CODES)[number];

export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly details: ErrorDetail[] | undefined;

  constructor(code: ClientErrorCode, message: string, status: number, details?: ErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
};

/** For error bodies the client cannot read (an older client meeting a newer API code). */
export function errorCodeForStatus(status: number): ClientErrorCode {
  if (status >= 500) return 'INTERNAL_ERROR';
  return CODE_BY_STATUS[status] ?? 'INVALID_RESPONSE';
}

/** TanStack Query retry: client errors (4xx) never succeed on retry; others get one more try. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

/** Translation key for any thrown value; unknown errors fall back to INTERNAL_ERROR. */
export function errorMessageKey(error: unknown): `errors.${ClientErrorCode}` {
  return `errors.${error instanceof ApiError ? error.code : 'INTERNAL_ERROR'}`;
}
```

Check that `ErrorDetail` is exported from `@ancestors-tree/shared` (the API's `AppError.ts` already imports it); export it from `packages/shared/src/index.ts` if it is not.

- [ ] **Step 3: Write the client**

Replace `apps/web/src/shared/lib/apiClient.ts` with:

```ts
import { ApiErrorBodySchema } from '@ancestors-tree/shared';
import type { z } from 'zod';
import { ApiError, errorCodeForStatus } from './apiError';

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** Sent as JSON with Content-Type: application/json. */
  json?: unknown;
}

let refreshing: Promise<boolean> | undefined;

/** One refresh at a time, shared by every request that got a 401 meanwhile. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
    .then(
      (response) => response.ok,
      () => false,
    )
    .finally(() => {
      refreshing = undefined;
    });
  return refreshing;
}

async function send(path: string, options: ApiRequestOptions): Promise<Response> {
  const { json, headers: extraHeaders, ...init } = options;
  const headers = new Headers(extraHeaders);
  headers.set('Accept', 'application/json');
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  try {
    return await fetch(`/api${path}`, {
      ...init,
      headers,
      credentials: 'include',
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError('NETWORK_ERROR', 'Network request failed', 0);
  }
}

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  let response = await send(path, options);
  // The access cookie lasts 15 minutes: renew it once with the refresh cookie and retry.
  if (response.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) {
    response = await send(path, options);
  }

  const payload: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);

  if (!response.ok) {
    const apiError = ApiErrorBodySchema.safeParse(payload);
    if (apiError.success) {
      const { code, message, details } = apiError.data.error;
      throw new ApiError(code, message, response.status, details);
    }
    throw new ApiError(
      errorCodeForStatus(response.status),
      `Unexpected error response (HTTP ${response.status})`,
      response.status,
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      'INVALID_RESPONSE',
      'Response did not match the expected schema',
      response.status,
    );
  }
  return parsed.data;
}
```

Note: an aborted request rethrows the `AbortError`, so TanStack Query treats it as a cancellation, not a network failure. If an existing test expects `INVALID_RESPONSE` for an unreadable error body with status 500, change it to `INTERNAL_ERROR` (the new status fallback).

- [ ] **Step 4: Use the retry rule in the app**

In `apps/web/src/app/providers.tsx`, import `shouldRetryQuery` from `../shared/lib/apiError` and change `retry: 1` to `retry: shouldRetryQuery`.

- [ ] **Step 5: Add the fetch mock for component tests**

Create `apps/web/src/test/api.ts`:

```ts
import { vi } from 'vitest';

export interface MockReply {
  status?: number;
  body?: unknown;
}

export interface ApiCall {
  method: string;
  path: string;
  body: unknown;
}

/** Handlers keyed by "METHOD /path" (no /api prefix, no query string). */
export type MockRoutes = Record<string, (call: ApiCall & { url: URL }) => MockReply | Promise<MockReply>>;

export function apiErrorReply(code: string, status: number, message = code): MockReply {
  return { status, body: { error: { code, message } } };
}

export const UNAUTHENTICATED_REPLY = apiErrorReply('UNAUTHENTICATED', 401, 'Sign in to continue');

const DEFAULT_ROUTES: MockRoutes = {
  'GET /health': () => ({
    body: { status: 'ok', version: '0.1.0', uptimeSeconds: 1, database: 'connected' },
  }),
  'GET /me': () => UNAUTHENTICATED_REPLY,
  'POST /auth/refresh': () => UNAUTHENTICATED_REPLY,
  'GET /auth/providers': () => ({ body: { google: false } }),
};

/**
 * Stubs fetch with a route table. Unknown calls answer 404 and are listed in `unhandled`, so a
 * test can assert `expect(api.unhandled).toEqual([])`. Call vi.unstubAllGlobals() in afterEach.
 */
export function mockApi(routes: MockRoutes = {}) {
  const table: MockRoutes = { ...DEFAULT_ROUTES, ...routes };
  const calls: ApiCall[] = [];
  const unhandled: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init.method ?? 'GET').toUpperCase();
      const path = url.pathname.replace(/^\/api/, '');
      const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      const call = { method, path, body };
      calls.push(call);
      const handler = table[`${method} ${path}`];
      const reply = handler
        ? await handler({ ...call, url })
        : (unhandled.push(`${method} ${path}`), apiErrorReply('NOT_FOUND', 404));
      const status = reply.status ?? 200;
      return status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(reply.body ?? null), {
            status,
            headers: { 'Content-Type': 'application/json' },
          });
    }),
  );
  return { calls, unhandled };
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm vitest run apps/web`
Expected: PASS.

- [ ] **Step 7: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/web/src packages/shared/src/index.ts
git commit -m "feat(web): API client with JSON bodies, 204, abort signals and silent refresh"
```

---

### Task 13: Web sign-in pages and session

**Files:**
- Add dependencies: `react-hook-form@^7.92.0`, `@hookform/resolvers@^7.0.6` (web)
- Create: `apps/web/src/shared/lib/formErrors.ts` (+ `formErrors.test.ts`)
- Create: `apps/web/src/features/auth/api.ts`, `AuthCard.tsx`, `GoogleButton.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `RequireAuth.tsx`, `UserMenu.tsx`, `returnTo.ts`, `index.ts`
- Test: `apps/web/src/features/auth/LoginPage.test.tsx`, `RegisterPage.test.tsx`, `PasswordReset.test.tsx`, `RequireAuth.test.tsx`, `UserMenu.test.tsx`
- Modify: `apps/web/src/app/routes.tsx`, `AppShell.tsx`, `AppShell.test.tsx`, `App.test.tsx`, `providers.tsx`, `apps/web/src/test/render.tsx`, `apps/web/src/locales/{vi,en}.json`

**Interfaces:**
- Consumes: `apiRequest`, `ApiError`, `errorMessageKey` (Task 12); `mockApi` (Task 12); shared auth schemas (Task 3); API routes from Tasks 7–9.
- Produces (`formErrors.ts`): `zodErrorMap(t: TFunction): z.core.$ZodErrorMap`; `useZodForm(schema, options?)` (React Hook Form with `zodResolver(schema, { error: zodErrorMap(t) })`, `mode: 'onTouched'`); `setServerError(form, error, t, fieldFor?)`.
- Produces (`features/auth`): `CURRENT_USER_KEY = ['me']`; `useCurrentUser()` (`CurrentUser | null`; `null` when signed out); `useAuthProviders()`; `useLogin()`, `useRegister()`, `useForgotPassword()`, `useResetPassword()`, `useLogout()`; `safeReturnTo(value: string | null, fallback = '/clans'): string`; pages `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`; `RequireAuth` (layout route); `UserMenu`.
- Produces (routes): `/login`, `/register`, `/forgot-password`, `/reset-password` (public); a `RequireAuth` layout route that Task 14 fills with `/clans/*`.
- Behaviour:
  - `/login?returnTo=/x` and `/register?returnTo=/x` go to `/x` after success (only paths accepted by `ReturnToSchema`; otherwise `/clans`).
  - `/login?error=google` shows the Google failure message.
  - The Google button is a plain link to `/api/auth/google/start?returnTo=…` (a full-page navigation) and appears only when `GET /auth/providers` says `google: true`.
  - `/reset-password#token=…` reads the token from the URL fragment and removes it from the address bar on load.
  - Signing out clears the query cache and sets the current user to `null`.
  - Any query that fails with `UNAUTHENTICATED` after the silent refresh sets the current user to `null`, so `RequireAuth` sends the user to `/login?returnTo=<current path>`.

- [ ] **Step 1: Add the dependencies and translations**

```bash
pnpm --filter @ancestors-tree/web add react-hook-form@^7.92.0 @hookform/resolvers@^7.0.6
```

Add to `apps/web/src/locales/vi.json` (top level; and `"clans": "Dòng họ"` inside the existing `"nav"` object):

```json
  "forms": {
    "errors": {
      "required": "Hãy điền mục này",
      "tooShort": "Cần ít nhất {{min}} ký tự",
      "tooLong": "Tối đa {{max}} ký tự",
      "email": "Email chưa đúng định dạng",
      "passwordTooLong": "Mật khẩu quá dài (tối đa 72 byte)",
      "invalid": "Giá trị chưa hợp lệ"
    }
  },
  "auth": {
    "fields": {
      "name": "Tên hiển thị",
      "email": "Email",
      "password": "Mật khẩu",
      "newPassword": "Mật khẩu mới",
      "passwordHint": "Ít nhất 8 ký tự"
    },
    "or": "hoặc",
    "google": "Tiếp tục với Google",
    "login": {
      "title": "Đăng nhập",
      "submit": "Đăng nhập",
      "forgot": "Quên mật khẩu?",
      "noAccount": "Chưa có tài khoản?",
      "register": "Tạo tài khoản",
      "googleFailed": "Chưa đăng nhập được bằng Google. Hãy thử lại, hoặc dùng email và mật khẩu."
    },
    "register": {
      "title": "Tạo tài khoản",
      "submit": "Tạo tài khoản",
      "haveAccount": "Đã có tài khoản?",
      "login": "Đăng nhập"
    },
    "forgot": {
      "title": "Quên mật khẩu",
      "intro": "Nhập email của bạn. Chúng tôi sẽ gửi một link để chọn mật khẩu mới.",
      "submit": "Gửi link",
      "sent": "Nếu email này có tài khoản, link đặt lại mật khẩu đã được gửi. Link dùng được một lần, trong 1 giờ.",
      "back": "Quay lại đăng nhập"
    },
    "reset": {
      "title": "Chọn mật khẩu mới",
      "submit": "Lưu mật khẩu mới",
      "missing": "Link này thiếu mã đặt lại mật khẩu. Hãy mở lại link trong email, hoặc lấy link mới.",
      "requestNew": "Lấy link mới"
    },
    "menu": {
      "signIn": "Đăng nhập",
      "signOut": "Đăng xuất",
      "signedInAs": "Đang đăng nhập với tên {{name}}"
    }
  },
```

Add the same keys to `apps/web/src/locales/en.json` (`"nav.clans": "Clans"`):

```json
  "forms": {
    "errors": {
      "required": "Fill in this field",
      "tooShort": "Use at least {{min}} characters",
      "tooLong": "Use at most {{max}} characters",
      "email": "Enter a valid email address",
      "passwordTooLong": "This password is too long (72 bytes at most)",
      "invalid": "This value is not valid"
    }
  },
  "auth": {
    "fields": {
      "name": "Display name",
      "email": "Email",
      "password": "Password",
      "newPassword": "New password",
      "passwordHint": "At least 8 characters"
    },
    "or": "or",
    "google": "Continue with Google",
    "login": {
      "title": "Sign in",
      "submit": "Sign in",
      "forgot": "Forgot your password?",
      "noAccount": "No account yet?",
      "register": "Create an account",
      "googleFailed": "Google sign-in did not work. Try again, or use your email and password."
    },
    "register": {
      "title": "Create an account",
      "submit": "Create account",
      "haveAccount": "Already have an account?",
      "login": "Sign in"
    },
    "forgot": {
      "title": "Forgot your password",
      "intro": "Enter your email. We will send a link to choose a new password.",
      "submit": "Send link",
      "sent": "If this email has an account, a reset link is on its way. The link works once, for 1 hour.",
      "back": "Back to sign in"
    },
    "reset": {
      "title": "Choose a new password",
      "submit": "Save new password",
      "missing": "This link has no reset code. Open the link in the email again, or get a new one.",
      "requestNew": "Get a new link"
    },
    "menu": {
      "signIn": "Sign in",
      "signOut": "Sign out",
      "signedInAs": "Signed in as {{name}}"
    }
  },
```

- [ ] **Step 2: Write the failing form-error test**

Create `apps/web/src/shared/lib/formErrors.test.ts`:

```ts
import { EmailSchema, PasswordSchema, RegisterRequestSchema } from '@ancestors-tree/shared';
import { describe, expect, it } from 'vitest';
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
});
```

(`src/shared/i18n/index.ts` exports the instance as default; the test setup already waits for `i18nReady`.)

Run: `pnpm vitest run apps/web/src/shared/lib/formErrors.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the form helpers**

Create `apps/web/src/shared/lib/formErrors.ts`:

```ts
import { zodResolver } from '@hookform/resolvers/zod';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import {
  useForm,
  type FieldValues,
  type Path,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { ApiError, errorMessageKey, type ClientErrorCode } from './apiError';

/** Translates Zod issues by code; the shared schemas carry no messages of their own. */
export function zodErrorMap(t: TFunction): z.core.$ZodErrorMap {
  return (issue) => {
    switch (issue.code) {
      case 'too_small':
        return Number(issue.minimum) <= 1
          ? t('forms.errors.required')
          : t('forms.errors.tooShort', { min: Number(issue.minimum) });
      case 'too_big':
        return t('forms.errors.tooLong', { max: Number(issue.maximum) });
      case 'invalid_format':
        return issue.format === 'email' ? t('forms.errors.email') : t('forms.errors.invalid');
      case 'custom':
        return issue.params?.reason === 'passwordTooLong'
          ? t('forms.errors.passwordTooLong')
          : t('forms.errors.invalid');
      default:
        return t('forms.errors.invalid');
    }
  };
}

/** React Hook Form driven by a shared Zod schema, with translated messages. */
export function useZodForm<Schema extends z.ZodType<FieldValues, FieldValues>>(
  schema: Schema,
  options: Omit<UseFormProps<z.input<Schema>, unknown, z.output<Schema>>, 'resolver'> = {},
): UseFormReturn<z.input<Schema>, unknown, z.output<Schema>> {
  const { t } = useTranslation();
  const resolver = useMemo(() => zodResolver(schema, { error: zodErrorMap(t) }), [schema, t]);
  return useForm<z.input<Schema>, unknown, z.output<Schema>>({
    mode: 'onTouched',
    ...options,
    resolver,
  });
}

/** Shows an API error next to the field it concerns, else above the submit button. */
export function setServerError<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, 'setError'>,
  error: unknown,
  t: TFunction,
  fieldFor: Partial<Record<ClientErrorCode, Path<T>>> = {},
): void {
  const field = error instanceof ApiError ? fieldFor[error.code] : undefined;
  const message = t(errorMessageKey(error));
  if (field) form.setError(field, { type: 'server', message });
  else form.setError('root.server', { type: 'server', message });
}
```

If `zodResolver`'s generics in @hookform/resolvers 7 do not line up with `useForm<…>` exactly, keep the runtime behaviour (resolver with `{ error: zodErrorMap(t) }`, `mode: 'onTouched'`) and adjust only the type parameters.

Run: `pnpm vitest run apps/web/src/shared/lib/formErrors.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the session hooks**

Create `apps/web/src/features/auth/returnTo.ts`:

```ts
import { ReturnToSchema } from '@ancestors-tree/shared';

/** Where to go after signing in: only paths inside the app. */
export function safeReturnTo(value: string | null, fallback = '/clans'): string {
  const parsed = ReturnToSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}
```

Create `apps/web/src/features/auth/api.ts`:

```ts
import {
  AuthProvidersSchema,
  CurrentUserSchema,
  type CurrentUser,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
} from '@ancestors-tree/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '../../shared/lib/apiClient';
import { ApiError } from '../../shared/lib/apiError';

export const CURRENT_USER_KEY = ['me'] as const;

async function fetchCurrentUser(signal: AbortSignal): Promise<CurrentUser | null> {
  try {
    return await apiRequest('/me', CurrentUserSchema, { signal });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') return null;
    throw error;
  }
}

/** The signed-in user, or null when signed out. */
export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: ({ signal }) => fetchCurrentUser(signal),
    staleTime: 5 * 60_000,
  });
}

export function useAuthProviders() {
  return useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: ({ signal }) => apiRequest('/auth/providers', AuthProvidersSchema, { signal }),
    staleTime: Infinity,
  });
}

function useSignInMutation<Input>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) =>
      apiRequest(path, CurrentUserSchema, { method: 'POST', json: input }),
    onSuccess: (user) => {
      queryClient.setQueryData(CURRENT_USER_KEY, user);
    },
  });
}

export const useLogin = () => useSignInMutation<LoginRequest>('/auth/login');
export const useRegister = () => useSignInMutation<RegisterRequest>('/auth/register');
export const useResetPassword = () => useSignInMutation<ResetPasswordRequest>('/auth/reset-password');

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordRequest) =>
      apiRequest('/auth/forgot-password', z.undefined(), { method: 'POST', json: input }),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest('/auth/logout', z.undefined(), { method: 'POST' }),
    onSettled: () => {
      // Nothing of the previous user may stay on screen.
      queryClient.clear();
      queryClient.setQueryData(CURRENT_USER_KEY, null);
    },
  });
}
```

In `apps/web/src/app/providers.tsx`, make every query that ends in `UNAUTHENTICATED` sign the user out locally:

```tsx
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { CURRENT_USER_KEY } from '../features/auth';
import { ApiError, shouldRetryQuery } from '../shared/lib/apiError';
import { ThemeProvider } from '../shared/ui';

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        // The silent refresh already failed: the session is over.
        if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
          client.setQueryData(CURRENT_USER_KEY, null);
        }
      },
    }),
    defaultOptions: {
      queries: { retry: shouldRetryQuery, staleTime: 30_000, refetchOnWindowFocus: false },
    },
  });
  return client;
}
```

(keep `AppProviders` as it is). In `apps/web/src/test/render.tsx`, build the test client with `createQueryClient()` followed by `queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } })`, and add an optional `queryClient` parameter to `renderWithProviders` and `renderRoute` so tests can seed data.

- [ ] **Step 5: Write the failing page tests**

Create `apps/web/src/features/auth/LoginPage.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';

const LAN = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  email: 'lan@example.test',
  name: 'Lan',
  locale: 'vi',
  hasPassword: true,
  hasGoogle: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it('validates before sending', async () => {
    const user = userEvent.setup();
    const api = mockApi();
    renderRoute('/login');
    await user.click(await screen.findByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Email chưa đúng định dạng')).toBeInTheDocument();
    expect(screen.getByText('Hãy điền mục này')).toBeInTheDocument();
    expect(api.calls.some((call) => call.path === '/auth/login')).toBe(false);
  });

  it('signs in and goes to the requested page', async () => {
    const user = userEvent.setup();
    const api = mockApi({ 'POST /auth/login': () => ({ body: LAN }) });
    renderRoute('/login?returnTo=/design');
    await user.type(await screen.findByLabelText('Email'), 'Lan@Example.test');
    await user.type(screen.getByLabelText('Mật khẩu'), 'long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Bộ thiết kế' })).toBeInTheDocument();
    expect(api.calls.find((call) => call.path === '/auth/login')?.body).toEqual({
      email: 'lan@example.test',
      password: 'long-enough-password',
    });
  });

  it('shows a wrong password above the button', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /auth/login': () => apiErrorReply('INVALID_CREDENTIALS', 401) });
    renderRoute('/login');
    await user.type(await screen.findByLabelText('Email'), 'lan@example.test');
    await user.type(screen.getByLabelText('Mật khẩu'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu chưa đúng.');
  });

  it('offers Google only when it is configured, and explains a failed attempt', async () => {
    mockApi({ 'GET /auth/providers': () => ({ body: { google: true } }) });
    renderRoute('/login?error=google&returnTo=/clans/abc');
    expect(await screen.findByRole('link', { name: 'Tiếp tục với Google' })).toHaveAttribute(
      'href',
      '/api/auth/google/start?returnTo=%2Fclans%2Fabc',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Chưa đăng nhập được bằng Google');
  });

  it('ignores return paths outside the app', async () => {
    mockApi({ 'GET /auth/providers': () => ({ body: { google: true } }) });
    renderRoute('/login?returnTo=https://evil.example.test');
    expect(await screen.findByRole('link', { name: 'Tiếp tục với Google' })).toHaveAttribute(
      'href',
      '/api/auth/google/start?returnTo=%2Fclans',
    );
  });
});
```

Create `apps/web/src/features/auth/RegisterPage.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Tên hiển thị'), 'Nguyễn Thị Lan');
  await user.type(screen.getByLabelText('Email'), 'lan@example.test');
  await user.type(screen.getByLabelText('Mật khẩu'), 'long-enough-password');
  await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
}

describe('RegisterPage', () => {
  it('creates the account in the current language', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'POST /auth/register': ({ body }) => ({
        status: 201,
        body: { ...(body as object), id: '64b7f0c2a1b2c3d4e5f60718', hasPassword: true, hasGoogle: false },
      }),
    });
    renderRoute('/register?returnTo=/design');
    await fillForm(user);
    expect(await screen.findByRole('heading', { level: 1, name: 'Bộ thiết kế' })).toBeInTheDocument();
    expect(api.calls.find((call) => call.path === '/auth/register')?.body).toEqual({
      name: 'Nguyễn Thị Lan',
      email: 'lan@example.test',
      password: 'long-enough-password',
      locale: 'vi',
    });
  });

  it('puts a taken email next to the email field', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /auth/register': () => apiErrorReply('EMAIL_TAKEN', 409) });
    renderRoute('/register');
    await fillForm(user);
    expect(await screen.findByText('Email này đã có tài khoản. Hãy đăng nhập hoặc lấy lại mật khẩu.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });
});
```

Create `apps/web/src/features/auth/PasswordReset.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('password reset pages', () => {
  it('asks for the email and confirms without saying whether it has an account', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /auth/forgot-password': () => ({ status: 204 }) });
    renderRoute('/forgot-password');
    await user.type(await screen.findByLabelText('Email'), 'lan@example.test');
    await user.click(screen.getByRole('button', { name: 'Gửi link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Nếu email này có tài khoản');
  });

  it('sends the token from the link fragment with the new password', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'POST /auth/reset-password': () => ({
        body: {
          id: '64b7f0c2a1b2c3d4e5f60718',
          email: 'lan@example.test',
          name: 'Lan',
          locale: 'vi',
          hasPassword: true,
          hasGoogle: false,
        },
      }),
    });
    renderRoute(`/reset-password#token=${'t'.repeat(43)}`);
    await user.type(await screen.findByLabelText('Mật khẩu mới'), 'brand-new-password');
    await user.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }));
    await vi.waitFor(() =>
      expect(api.calls.find((call) => call.path === '/auth/reset-password')?.body).toEqual({
        token: 't'.repeat(43),
        password: 'brand-new-password',
      }),
    );
  });

  it('explains a missing or used link and offers a new one', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /auth/reset-password': () => apiErrorReply('INVALID_TOKEN', 400) });
    const { unmount } = renderRoute('/reset-password');
    expect(await screen.findByText(/Link này thiếu mã đặt lại mật khẩu/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lấy link mới' })).toHaveAttribute('href', '/forgot-password');
    unmount();

    renderRoute(`/reset-password#token=${'t'.repeat(43)}`);
    await user.type(await screen.findByLabelText('Mật khẩu mới'), 'brand-new-password');
    await user.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Đường link này không dùng được nữa');
  });
});
```

Create `apps/web/src/features/auth/RequireAuth.test.tsx` and `UserMenu.test.tsx`:

```tsx
// RequireAuth.test.tsx
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RequireAuth', () => {
  it('sends signed-out visitors to sign in, remembering where they were going', async () => {
    mockApi();
    renderRoute('/clans');
    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeInTheDocument();
    // The Google link carries the remembered path.
  });
});
```

```tsx
// UserMenu.test.tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';

const LAN = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  email: 'lan@example.test',
  name: 'Nguyễn Thị Lan',
  locale: 'vi',
  hasPassword: true,
  hasGoogle: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UserMenu', () => {
  it('offers sign-in to visitors', async () => {
    mockApi();
    renderRoute('/');
    expect(await screen.findByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
  });

  it('shows the signed-in user and signs out', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /me': () => ({ body: LAN }),
      'POST /auth/logout': () => ({ status: 204 }),
    });
    renderRoute('/');
    expect(await screen.findByText('Nguyễn Thị Lan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dòng họ' })).toHaveAttribute('href', '/clans');
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByRole('link', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(api.calls.some((call) => call.path === '/auth/logout')).toBe(true);
  });
});
```

In the `RequireAuth` test, extend the assertion once the page exists: the sign-in page rendered at `/login?returnTo=%2Fclans` (assert through the Google link only if `GET /auth/providers` is mocked with `google: true`, or check `window.location` is not used — the memory router does not change it; assert the heading only).

Run: `pnpm vitest run apps/web/src/features/auth`
Expected: FAIL (pages do not exist).

- [ ] **Step 6: Write the pages, RequireAuth and UserMenu**

Build each page as a centered card (`AuthCard`: `mx-auto w-full max-w-sm`, `rounded-photo border border-line bg-surface p-6`, an `h1` with the page title, then children). Use only existing UI: `TextField`, `Button` (`variant="primary"` full width for submit), `buttonVariants({ variant: 'secondary' })` on the Google `<a>`, `Link` from react-router for secondary links, tokens for colors. Every form: `noValidate`, `useZodForm(<shared schema>)`, `TextField` with `{...form.register('field')}`, `error={form.formState.errors.field?.message}`, `autoComplete` (`email`, `current-password`, `new-password`, `name`), and the root server error as `<p role="alert" className="text-sm font-medium text-stamp">`. Submit buttons are disabled while the mutation is pending.

- `LoginPage`: schema `LoginRequestSchema`; on success `navigate(safeReturnTo(searchParams.get('returnTo')), { replace: true })`; errors via `setServerError(form, error, t)` (root). When `searchParams.get('error') === 'google'`, show `t('auth.login.googleFailed')` in a `role="alert"` paragraph above the form. When `useAuthProviders().data?.google`, render `<GoogleButton returnTo={…} />` and an "or" divider. Links: `/forgot-password` (`auth.login.forgot`) and `/register` keeping `returnTo` (`auth.login.noAccount` + `auth.login.register`).
- `RegisterPage`: schema `RegisterRequestSchema`; fields name, email, password (hint `auth.fields.passwordHint`); submits `{ ...values, locale: i18n.resolvedLanguage === 'en' ? 'en' : 'vi' }`; `setServerError(form, error, t, { EMAIL_TAKEN: 'email' })`; same `returnTo` behaviour; link back to `/login`.
- `ForgotPasswordPage`: schema `ForgotPasswordRequestSchema`; after success replace the form with `<p role="status">{t('auth.forgot.sent')}</p>` and a link back to `/login`.
- `ResetPasswordPage`: read `new URLSearchParams(location.hash.slice(1)).get('token')` once on mount (`useState` initialiser with `useLocation()`), then remove the fragment from the address bar with `window.history.replaceState(null, '', location.pathname)` inside an effect. Without a token: show `auth.reset.missing` and a link to `/forgot-password` (`auth.reset.requestNew`). With a token: one `TextField` for `password` (`auth.fields.newPassword`, `autoComplete="new-password"`), schema `ResetPasswordRequestSchema.pick({ password: true })`, submit `{ token, password }`; success → `navigate('/clans', { replace: true })`; an `INVALID_TOKEN` error shows as root alert plus the `requestNew` link.
- `GoogleButton({ returnTo })`: `<a href={`/api/auth/google/start?${new URLSearchParams({ returnTo })}`}>` styled as a secondary button, text `auth.google`.
- `RequireAuth`: `const me = useCurrentUser();` pending → `<p className="text-ink-muted">{t('common.loading')}</p>`; `me.data === null` → `<Navigate to={`/login?${new URLSearchParams({ returnTo: location.pathname + location.search })}`} replace />`; error → rethrow so the route error element shows; otherwise `<Outlet />`.
- `UserMenu`: signed out (or loading) → `Link` to `/login` styled as a ghost button (`auth.menu.signIn`). Signed in → the user's name in `<span className="text-sm text-ink" title={t('auth.menu.signedInAs', { name })}>` and a ghost `Button` "Đăng xuất" that runs `useLogout()` and then `navigate('/')`.
- `index.ts` exports the pages, `RequireAuth`, `UserMenu`, `CURRENT_USER_KEY`, `useCurrentUser`, `safeReturnTo`.

In `apps/web/src/app/routes.tsx`, add children before the `*` route:

```tsx
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      {
        element: <RequireAuth />,
        // Filled in Task 14.
        children: [{ path: 'clans', element: null }],
      },
```

In `AppShell.tsx`: put `<UserMenu />` next to `<ThemeToggle />` (wrap both in `<div className="flex items-center gap-2">`), and add a `NavLink` to `/clans` (`nav.clans`) shown only when `useCurrentUser().data` is a user.

Update the existing `AppShell.test.tsx` and `App.test.tsx` to use `mockApi()` from `../test/api` instead of their own `fetch` stubs (the shell now also calls `GET /me`), keeping their assertions.

- [ ] **Step 7: Run the tests and watch them pass**

Run: `pnpm vitest run apps/web`
Expected: PASS.

- [ ] **Step 8: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS (`locales.test.ts` confirms identical vi/en keys).

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat(web): sign-in, sign-up and password reset pages with session handling"
```

---

### Task 14: Web clan pages and invites

**Files:**
- Create: `apps/web/src/features/clans/api.ts`, `ClansPage.tsx`, `ClanLayout.tsx`, `ClanMembersPage.tsx`, `InvitesPanel.tsx`, `ClanSettingsPage.tsx`, `JoinPage.tsx`, `RoleLabel.tsx`, `index.ts`
- Test: `apps/web/src/features/clans/ClansPage.test.tsx`, `ClanMembersPage.test.tsx`, `ClanSettingsPage.test.tsx`, `JoinPage.test.tsx`
- Modify: `apps/web/src/app/routes.tsx`, `apps/web/src/locales/{vi,en}.json`

**Interfaces:**
- Consumes: `apiRequest` (Task 12), `useZodForm`, `setServerError` (Task 13), `useCurrentUser`, `RequireAuth` (Task 13), shared clan schemas (Task 3), API routes from Tasks 10–11.
- Produces (`api.ts`): query keys `clanKeys = { all: ['clans'], detail: (id) => ['clans', id], members: (id) => ['clans', id, 'members'], invites: (id) => ['clans', id, 'invites'], invite: (token) => ['invite', token] }`; hooks `useClans()`, `useClan(id)`, `useCreateClan()`, `useUpdateClan(id)`, `useMembers(id)`, `useChangeRole(id)`, `useRemoveMember(id)`, `useInvites(id, enabled)`, `useCreateInvite(id)`, `useRevokeInvite(id)`, `useInvitePreview(token)`, `useAcceptInvite(token)`.
- Produces (routes): inside `RequireAuth`: `/clans` (`ClansPage`), `/clans/:id` → redirect to `members` (the tree page arrives in P5), `/clans/:id/members` and `/clans/:id/settings` under `ClanLayout`; public `/join/:token` (`JoinPage`).
- Behaviour:
  - `/clans` lists my clans (name, hometown, my role, member count), each linking to `/clans/:id/members`; an empty state invites the user to create one or open a family member's link; a create form (name, hometown, description) creates the clan and opens its members page.
  - `ClanLayout` shows the clan name as `h1` and tabs "Thành viên" / "Cài đặt" (settings only for the owner).
  - Members page: one row per member (name, "(bạn)" for yourself, email when the API sends it, role). The owner gets a role `<select>` (Biên tập / Xem) for every other member and a "Xoá khỏi dòng họ" button with a confirmation `Dialog`; other members get "Rời dòng họ" on their own row (confirmation `Dialog`; after leaving go to `/clans`).
  - Invites panel (owner only, on the members page): choose the role (default Xem), "Tạo link mời"; each active link shows its role, expiry date, the full URL `${window.location.origin}/join/${token}` in a read-only text field, "Sao chép link" (Clipboard API, then "Đã sao chép" in a `role="status"` region), and "Thu hồi".
  - Settings page (owner): form with name, hometown, description (`UpdateClanRequestSchema`), "Lưu thay đổi", then "Đã lưu" in a `role="status"` region.
  - `/join/:token`: loads the preview (`GET /invites/:token`). Invalid → `errors.INVALID_TOKEN` text plus a link home. Signed out → the offer plus links to `/login?returnTo=/join/:token` and `/register?returnTo=/join/:token`. Signed in → the offer plus a "Tham gia" button; after accepting go to `/clans/:clanId/members` (also when `alreadyMember`).
  - Role names use the spec terms: owner "Chủ họ", editor "Biên tập", viewer "Xem" (en: Owner, Editor, Viewer).

- [ ] **Step 1: Add the translations**

Add to `apps/web/src/locales/vi.json`:

```json
  "clans": {
    "title": "Dòng họ của tôi",
    "empty": "Bạn chưa ở trong dòng họ nào. Hãy tạo dòng họ đầu tiên, hoặc mở link mời mà người nhà gửi cho bạn.",
    "memberCount": "{{n}} thành viên",
    "roles": { "owner": "Chủ họ", "editor": "Biên tập", "viewer": "Xem" },
    "create": {
      "title": "Tạo dòng họ mới",
      "name": "Tên dòng họ",
      "namePlaceholder": "Họ Nguyễn – Nam Định",
      "hometown": "Quê quán",
      "description": "Giới thiệu",
      "submit": "Tạo dòng họ"
    },
    "tabs": { "label": "Mục của dòng họ", "members": "Thành viên", "settings": "Cài đặt" },
    "members": {
      "you": "(bạn)",
      "role": "Vai trò của {{name}}",
      "remove": "Xoá khỏi dòng họ",
      "removeTitle": "Xoá {{name}} khỏi dòng họ?",
      "removeBody": "{{name}} sẽ không xem hay sửa được cây gia phả này nữa. Bạn có thể mời lại sau.",
      "leave": "Rời dòng họ",
      "leaveTitle": "Rời {{clan}}?",
      "leaveBody": "Bạn sẽ không xem được cây gia phả này nữa, cho tới khi có người mời lại.",
      "cancel": "Huỷ"
    },
    "invites": {
      "title": "Link mời",
      "intro": "Ai có link đều tham gia được trong 7 ngày. Gửi link qua Zalo hoặc Messenger cho người nhà.",
      "role": "Vai trò khi tham gia",
      "create": "Tạo link mời",
      "empty": "Chưa có link mời nào đang dùng được.",
      "link": "Link mời ({{role}})",
      "expires": "Hết hạn {{date}}",
      "copy": "Sao chép link",
      "copied": "Đã sao chép link",
      "revoke": "Thu hồi"
    },
    "settings": {
      "save": "Lưu thay đổi",
      "saved": "Đã lưu thay đổi"
    },
    "join": {
      "title": "Lời mời vào dòng họ",
      "offer": "{{inviter}} mời bạn vào {{clan}} với vai trò {{role}}.",
      "accept": "Tham gia",
      "signIn": "Đăng nhập để tham gia",
      "register": "Tạo tài khoản",
      "home": "Về trang chủ"
    }
  },
```

Add the English equivalents to `en.json` (`"title": "My clans"`, `"memberCount": "{{n}} members"`, roles Owner/Editor/Viewer, `"offer": "{{inviter}} invites you to {{clan}} as {{role}}."`, and so on — same keys).

- [ ] **Step 2: Write the data hooks**

Create `apps/web/src/features/clans/api.ts`:

```ts
import {
  AcceptInviteResponseSchema,
  ClanListSchema,
  ClanSchema,
  InviteListSchema,
  InvitePreviewSchema,
  InviteSchema,
  MemberListSchema,
  MemberSchema,
  type CreateClanRequest,
  type InviteRole,
  type UpdateClanRequest,
} from '@ancestors-tree/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '../../shared/lib/apiClient';

export const clanKeys = {
  all: ['clans'] as const,
  detail: (id: string) => ['clans', id] as const,
  members: (id: string) => ['clans', id, 'members'] as const,
  invites: (id: string) => ['clans', id, 'invites'] as const,
  invite: (token: string) => ['invite', token] as const,
};

export function useClans() {
  return useQuery({
    queryKey: clanKeys.all,
    queryFn: ({ signal }) => apiRequest('/clans', ClanListSchema, { signal }),
  });
}

export function useClan(id: string) {
  return useQuery({
    queryKey: clanKeys.detail(id),
    queryFn: ({ signal }) => apiRequest(`/clans/${id}`, ClanSchema, { signal }),
  });
}

export function useCreateClan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClanRequest) =>
      apiRequest('/clans', ClanSchema, { method: 'POST', json: input }),
    onSuccess: (clan) => {
      queryClient.setQueryData(clanKeys.detail(clan.id), clan);
      void queryClient.invalidateQueries({ queryKey: clanKeys.all, exact: true });
    },
  });
}

export function useUpdateClan(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateClanRequest) =>
      apiRequest(`/clans/${id}`, ClanSchema, { method: 'PATCH', json: input }),
    onSuccess: (clan) => {
      queryClient.setQueryData(clanKeys.detail(id), clan);
      void queryClient.invalidateQueries({ queryKey: clanKeys.all, exact: true });
    },
  });
}

export function useMembers(id: string) {
  return useQuery({
    queryKey: clanKeys.members(id),
    queryFn: ({ signal }) => apiRequest(`/clans/${id}/members`, MemberListSchema, { signal }),
  });
}

export function useChangeRole(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: InviteRole }) =>
      apiRequest(`/clans/${id}/members/${userId}`, MemberSchema, {
        method: 'PATCH',
        json: { role },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clanKeys.members(id) }),
  });
}

export function useRemoveMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiRequest(`/clans/${id}/members/${userId}`, z.undefined(), { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clanKeys.all }),
  });
}

export function useInvites(id: string, enabled: boolean) {
  return useQuery({
    queryKey: clanKeys.invites(id),
    queryFn: ({ signal }) => apiRequest(`/clans/${id}/invites`, InviteListSchema, { signal }),
    enabled,
  });
}

export function useCreateInvite(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: InviteRole) =>
      apiRequest(`/clans/${id}/invites`, InviteSchema, { method: 'POST', json: { role } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clanKeys.invites(id) }),
  });
}

export function useRevokeInvite(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      apiRequest(`/clans/${id}/invites/${inviteId}`, z.undefined(), { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clanKeys.invites(id) }),
  });
}

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: clanKeys.invite(token),
    queryFn: ({ signal }) =>
      apiRequest(`/invites/${encodeURIComponent(token)}`, InvitePreviewSchema, { signal }),
  });
}

export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest(`/invites/${encodeURIComponent(token)}/accept`, AcceptInviteResponseSchema, {
        method: 'POST',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clanKeys.all }),
  });
}
```

- [ ] **Step 3: Write the failing page tests**

Use these fixtures in the tests (ids are 24 hex characters):

```ts
const CLAN_ID = '64b7f0c2a1b2c3d4e5f60001';
const ME = { id: '64b7f0c2a1b2c3d4e5f60718', email: 'lan@example.test', name: 'Lan', locale: 'vi', hasPassword: true, hasGoogle: false };
const CLAN = { id: CLAN_ID, name: 'Họ Nguyễn', hometown: 'Nam Định', description: '', role: 'owner', memberCount: 2, createdAt: '2026-11-13T08:00:00.000Z' };
const MEMBERS = [
  { userId: ME.id, name: 'Lan', email: 'lan@example.test', role: 'owner', joinedAt: '2026-11-13T08:00:00.000Z', isYou: true },
  { userId: '64b7f0c2a1b2c3d4e5f60002', name: 'Tuấn', email: 'tuan@example.test', role: 'viewer', joinedAt: '2026-11-13T09:00:00.000Z', isYou: false },
];
const INVITE = { id: '64b7f0c2a1b2c3d4e5f60003', token: 'A'.repeat(32), role: 'viewer', createdByName: 'Lan', createdAt: '2026-11-13T08:00:00.000Z', expiresAt: '2026-11-20T08:00:00.000Z' };
```

`ClansPage.test.tsx` (all with `mockApi({ 'GET /me': () => ({ body: ME }), … })` and `renderRoute`):
1. "shows an empty state and creates the first clan": `GET /clans` → `[]`; expect the `clans.empty` text; type "Họ Nguyễn" into "Tên dòng họ", click "Tạo dòng họ"; `POST /clans` returns `{ status: 201, body: CLAN }`, and `GET /clans/<id>` + `GET /clans/<id>/members` + `GET /clans/<id>/invites` are mocked; expect heading `Họ Nguyễn` (the members page) and the POST body `{ name: 'Họ Nguyễn', hometown: '', description: '' }`.
2. "lists my clans with my role": `GET /clans` → `[CLAN, { ...CLAN, id: '64b7f0c2a1b2c3d4e5f60009', name: 'Họ Trần', role: 'viewer' }]`; expect links named `Họ Nguyễn` and `Họ Trần` with `href` `/clans/<id>/members`, and texts `Chủ họ`, `Xem`, `2 thành viên`.
3. "validates the clan name": click "Tạo dòng họ" with an empty name → `Hãy điền mục này`, and no `POST /clans` call.

`ClanMembersPage.test.tsx`:
1. "the owner changes a role": `GET /clans/<id>` → CLAN, members → MEMBERS, invites → `[]`, `PATCH /clans/<id>/members/<tuan>` → `{ body: { ...MEMBERS[1], role: 'editor' } }`; select `Biên tập` in the combobox named `Vai trò của Tuấn` (`user.selectOptions`); expect the PATCH body `{ role: 'editor' }`. Expect no role select for Lan's own row, and the text `(bạn)`.
2. "the owner removes a member after confirming": click `Xoá khỏi dòng họ`; a dialog titled `Xoá Tuấn khỏi dòng họ?` opens; click its `Xoá khỏi dòng họ` button; expect `DELETE /clans/<id>/members/<tuan>` was called.
3. "a viewer can only leave": CLAN with `role: 'viewer'`, members with `isYou` on Tuấn's row and no emails for others; expect no combobox, no `Cài đặt` tab, no `Link mời` heading; click `Rời dòng họ`, confirm in the dialog; after `DELETE /clans/<id>/members/<tuan>` → `{ status: 204 }` and `GET /clans` → `[]`, expect the `Dòng họ của tôi` heading.
4. "the owner creates, copies and revokes invite links": invites list returns `[INVITE]` after creation (keep a mutable array in the test that the POST handler pushes to); choose `Biên tập` in `Vai trò khi tham gia`, click `Tạo link mời`; expect the POST body `{ role: 'editor' }`; expect a text field with value `http://localhost:3000/join/AAAA…` (use `window.location.origin` in the assertion); click `Sao chép link` and expect `await navigator.clipboard.readText()` to equal that URL and the status text `Đã sao chép link`; click `Thu hồi` and expect `DELETE /clans/<id>/invites/<invite id>`.

`ClanSettingsPage.test.tsx`:
1. "the owner saves changes": fields prefilled from CLAN; clear and type a new description; `PATCH /clans/<id>` → `{ body: { ...CLAN, description: 'Gia phả' } }`; expect the PATCH body to contain `description: 'Gia phả'` and the status text `Đã lưu thay đổi`.

`JoinPage.test.tsx`:
1. "shows the offer and sends signed-out visitors to sign in first": `GET /invites/<token>` → `{ body: { clanName: 'Họ Nguyễn', role: 'editor', invitedByName: 'Ông Thịnh', expiresAt: … } }`; expect text `Ông Thịnh mời bạn vào Họ Nguyễn với vai trò Biên tập.`; links `Đăng nhập để tham gia` → `/login?returnTo=%2Fjoin%2F<token>` and `Tạo tài khoản` → `/register?returnTo=%2Fjoin%2F<token>`.
2. "joins when signed in": `GET /me` → ME, `POST /invites/<token>/accept` → `{ body: { clanId: CLAN_ID, role: 'editor', alreadyMember: false } }`, clan pages mocked; click `Tham gia`; expect heading `Họ Nguyễn`.
3. "explains a link that no longer works": preview → `apiErrorReply('INVALID_TOKEN', 400)`; expect the `errors.INVALID_TOKEN` Vietnamese text and a `Về trang chủ` link.

Every test calls `vi.unstubAllGlobals()` in `afterEach` and uses `const user = userEvent.setup()` (which also provides `navigator.clipboard`).

Run: `pnpm vitest run apps/web/src/features/clans`
Expected: FAIL (pages do not exist).

- [ ] **Step 4: Write the pages**

Build them with the existing UI only (`Button`, `buttonVariants`, `TextField`, `Dialog`/`DialogContent`/`DialogClose`, tokens; Lucide icons with `strokeWidth={1.75}` and `aria-hidden="true"` where an icon helps, e.g. `Copy`, `Link`, `UserMinus`). Lists are `<ul>` of rows separated by `border-line`; clan cards use `rounded-photo border border-line bg-surface p-4`. Native `<select>` elements get a visible `<label>` and the same border/focus classes as `TextField`'s input. Loading states show `common.loading`; query errors show `t(errorMessageKey(error))`. Dates use `new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' })`.

- `RoleLabel({ role })` renders `t(`clans.roles.${role}`)`.
- `ClansPage`: `h1` `clans.title`; list or empty state; a `<section aria-labelledby>` with `h2` `clans.create.title` and the create form (`CreateClanRequestSchema`, fields name with placeholder, hometown, description as a `<textarea>` styled like `TextField`). On success `navigate(`/clans/${clan.id}/members`)`.
- `ClanLayout`: reads `:id` with `useParams`, `useClan(id)`; renders `h1` clan name, a `<nav aria-label={t('clans.tabs.label')}>` with `NavLink`s (members; settings only when `role === 'owner'`), then `<Outlet context={clan} />`. Children read the clan with `useOutletContext<Clan>()`. A `NOT_FOUND` error shows `errors.NOT_FOUND`.
- `ClanMembersPage`: as described in the behaviour list; mutations invalidate queries through the hooks. After the viewer leaves: `navigate('/clans')`.
- `InvitesPanel({ clanId })`: rendered by the members page only for the owner; `h2` `clans.invites.title`, intro, the role select (`clans.invites.role`), the create button, and the list. The copy button calls `navigator.clipboard.writeText(url)` and then sets a "copied" flag shown in a persistent `<p role="status">`.
- `ClanSettingsPage`: owner-only (show `errors.FORBIDDEN` for other roles); form with `UpdateClanRequestSchema`, `defaultValues` from the clan; `setServerError` for failures; a persistent `<p role="status">` that shows `clans.settings.saved` after success.
- `JoinPage`: as described; uses `useCurrentUser()` to choose between the sign-in links and the "Tham gia" button.
- `index.ts` exports `ClansPage`, `ClanLayout`, `ClanMembersPage`, `ClanSettingsPage`, `JoinPage`.

In `apps/web/src/app/routes.tsx`, replace the Task 13 placeholder under `RequireAuth` with:

```tsx
        children: [
          { path: 'clans', element: <ClansPage /> },
          {
            path: 'clans/:id',
            element: <ClanLayout />,
            children: [
              { index: true, element: <Navigate to="members" replace /> },
              { path: 'members', element: <ClanMembersPage /> },
              { path: 'settings', element: <ClanSettingsPage /> },
            ],
          },
        ],
```

and add `{ path: 'join/:token', element: <JoinPage /> }` next to the auth pages (public).

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm vitest run apps/web`
Expected: PASS.

- [ ] **Step 6: Check it in the browser**

With the user's `JWT_SECRET` and `MONGODB_URI` in `apps/api/.env` (Human step 1), run `pnpm dev`, then: sign up at `http://localhost:5173/register`, create a clan, create an invite link, open it in a private window, sign up a second account from the join page and join. If `apps/api/.env` is not ready, skip this step and rely on Task 15's end-to-end test; say so in the report.

- [ ] **Step 7: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/web
git commit -m "feat(web): clan list, members, invite links, settings and join page"
```

---

### Task 15: End-to-end flow against a real API

**Files:**
- Create: `apps/api/scripts/e2e-server.ts`
- Modify: `apps/api/tsconfig.json` (include `scripts`), `apps/api/package.json` (script `e2e:server`)
- Modify: `apps/web/vite.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`
- Create: `e2e/accounts.spec.ts`

**Interfaces:**
- Consumes: `createApp`, `connectDatabase`, `createMemoryMailer` (Tasks 2–9).
- Produces: an API on `http://localhost:3100` backed by an in-memory replica set; `vite preview` proxies `/api` to `API_PORT` (default 3000).

- [ ] **Step 1: Write the end-to-end API server**

Create `apps/api/scripts/e2e-server.ts`:

```ts
/**
 * The API for Playwright: an in-memory MongoDB replica set, emails kept in memory, no Google.
 * Never used in production; started by playwright.config.ts.
 */
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { pino } from 'pino';
import { createApp } from '../src/app.ts';
import { connectDatabase } from '../src/db/connect.ts';
import { createMemoryMailer } from '../src/mail/mailer.ts';

const PORT = Number(process.env.PORT ?? 3100);
const APP_ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:4173';

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await connectDatabase(replSet.getUri(), { dbName: 'e2e' });

const { app } = createApp({
  logger: pino({ level: 'warn' }),
  version: 'e2e',
  httpLogging: false,
  appOrigin: APP_ORIGIN,
  trustProxyHops: 0,
  apiDocs: false,
  // Both browser projects sign up from the same IP within a minute.
  rateLimits: { auth: 1000, user: 1000 },
  auth: { jwtSecret: randomBytes(48).toString('base64'), secureCookies: false, bcryptCost: 4 },
  mailer: createMemoryMailer(),
});

const server = app.listen(PORT, () => {
  console.log(`E2E API on http://localhost:${PORT}`);
});

async function stop(): Promise<void> {
  server.close();
  await replSet.stop();
  process.exit(0);
}

process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
```

In `apps/api/tsconfig.json`, change `"include"` to `["src", "scripts", "vitest.config.ts"]`. In `apps/api/package.json`, add the script `"e2e:server": "node scripts/e2e-server.ts"`. If ESLint flags `console.log` here, the repo already turns `no-console` off for `scripts/`; check that its glob covers `apps/api/scripts/**` and widen it if not.

- [ ] **Step 2: Proxy the preview server to the API**

In `apps/web/vite.config.ts`, add above `export default`:

```ts
// The API port behind /api: 3000 for `pnpm dev`, 3100 for the Playwright API (API_PORT).
const apiTarget = `http://localhost:${process.env.API_PORT ?? '3000'}`;
```

and use it in `server.proxy` (`'/api': { target: apiTarget }`) and in a new `preview: { proxy: { '/api': { target: apiTarget } } }`. (The web `tsconfig.node.json` already has Node types for this file.)

In `playwright.config.ts`, replace `webServer` with:

```ts
  webServer: [
    {
      command: 'pnpm --filter @ancestors-tree/api e2e:server',
      url: 'http://localhost:3100/api/health',
      reuseExistingServer: !isCI,
      // The first run downloads the MongoDB binary.
      timeout: 180_000,
    },
    {
      // The production build, served by `vite preview` (same files Netlify serves).
      command:
        'pnpm --filter @ancestors-tree/web build && pnpm --filter @ancestors-tree/web preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      env: { API_PORT: '3100' },
      reuseExistingServer: !isCI,
      timeout: 180_000,
    },
  ],
```

- [ ] **Step 3: Write the end-to-end test**

Create `e2e/accounts.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'long-enough-password';

function uniqueEmail(name: string): string {
  return `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page, name: string): Promise<void> {
  await page.getByLabel('Tên hiển thị').fill(name);
  await page.getByLabel('Email').fill(uniqueEmail(name.toLowerCase().replace(/\s+/g, '-')));
  await page.getByLabel('Mật khẩu').fill(PASSWORD);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
}

test('sign up, create a clan, invite a relative and see them join', async ({ page, browser }) => {
  await page.goto('/register');
  await register(page, 'Lan');
  await expect(page.getByRole('heading', { level: 1, name: 'Dòng họ của tôi' })).toBeVisible();

  await page.getByLabel('Tên dòng họ').fill('Họ Nguyễn');
  await page.getByRole('button', { name: 'Tạo dòng họ' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Họ Nguyễn' })).toBeVisible();

  await page.getByLabel('Vai trò khi tham gia').selectOption({ label: 'Biên tập' });
  await page.getByRole('button', { name: 'Tạo link mời' }).click();
  const inviteUrl = await page.getByRole('textbox', { name: /Link mời/ }).inputValue();
  expect(inviteUrl).toMatch(/\/join\/[A-Za-z0-9_-]{32}$/);

  // A relative opens the link in their own browser.
  const relative = await browser.newContext();
  const relativePage = await relative.newPage();
  await relativePage.goto(inviteUrl);
  await expect(relativePage.getByText('Lan mời bạn vào Họ Nguyễn với vai trò Biên tập.')).toBeVisible();
  await relativePage.getByRole('link', { name: 'Tạo tài khoản' }).click();
  await register(relativePage, 'Tuấn');
  await relativePage.getByRole('button', { name: 'Tham gia' }).click();
  await expect(relativePage.getByRole('heading', { level: 1, name: 'Họ Nguyễn' })).toBeVisible();
  await relative.close();

  await page.reload();
  await expect(page.getByText('Tuấn')).toBeVisible();
});

test('protected pages send visitors to sign in and back', async ({ page }) => {
  await page.goto('/clans');
  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeVisible();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fclans$/);
});

test('the sign-in and sign-up pages pass axe', async ({ page }) => {
  for (const path of ['/login', '/register', '/forgot-password']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, path).toEqual([]);
  }
});
```

(Use the same axe import the existing `e2e/design-system.spec.ts` uses.)

- [ ] **Step 4: Run the end-to-end tests**

Run: `pnpm e2e`
Expected: PASS for `design-system.spec.ts` and `accounts.spec.ts` on both projects. Fix real failures in the app, not by loosening the test.

- [ ] **Step 5: Cache the MongoDB binary in CI**

In `.github/workflows/ci.yml`, add this step after `pnpm install` in **both** jobs (`check` runs the API tests, `e2e` runs the Playwright API):

```yaml
      - uses: actions/cache@v4
        with:
          path: ~/.cache/mongodb-binaries
          key: mongodb-binaries-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
```

- [ ] **Step 6: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/api/scripts apps/api/tsconfig.json apps/api/package.json apps/web/vite.config.ts playwright.config.ts .github/workflows/ci.yml e2e/accounts.spec.ts eslint.config.js
git commit -m "test(e2e): sign up, create a clan and join by invite against a real API"
```

---

### Task 16: Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-11-11-ancestors-tree-design.md` and `.vi.md` (same commit)
- Create: `docs/adr/0005-cookie-sessions-and-sign-in.md`
- Modify: `docs/deployment.md`, `docs/superpowers/plans/2026-11-12-roadmap.md`

- [ ] **Step 1: Update the spec (EN and VI together)**

- §5: add to `User` the field `emailVerifiedAt?` (set by Google sign-in or a password reset; it decides whether a Google sign-in may take over an existing password account). Add `Session { userId, familyId, tokenHash, expiresAt, usedAt?, revokedAt? }` (one refresh token; TTL index) and `PasswordReset { userId, tokenHash, expiresAt, usedAt? }`. Note that invite revocation deletes the `Invite`.
- §7.2: add `/reset-password` next to `/forgot-password`, and note that `/clans/:id` opens the members page until the tree page lands in P5.
- §12: replace the sessions bullet with the exact P3 design: access JWT (HS256, 15 min, cookie `at`, path `/api`); opaque refresh token (cookie `rt`, path `/api/auth`, 30 days, stored as SHA-256, rotated on every use, reuse after 10 s revokes the family, reuse within 10 s is a concurrent refresh); `SameSite=Lax` plus an `Origin` check on every non-GET `/api` request; Google sign-in through a redirect (authorization code + PKCE, `state`, `nonce`, only verified emails; a Google sign-in takes over an account whose email was never verified by clearing its password and signing it out everywhere); password reset links (1 hour, single use, token in the URL fragment, the request answers the same whether or not the email exists, a reset signs out every device); rate limits per IP and endpoint for sign-in, sign-up, forgot and reset; `trust proxy` hops; logs redact cookies.
- §13.1: list the new codes `INVALID_TOKEN` (400), `INVALID_CREDENTIALS` (401), `EMAIL_TAKEN` (409).
- §14: the `/api/docs` page is on outside production only (`API_DOCS=on` turns it on in production).
- §16: Resend free plan note: without a verified domain Resend only delivers to the account owner's address; until a domain is verified the production API cannot email other users (set `MAIL_FROM` to an address on the verified domain once it is).
- §20: add the decisions: cookie sessions with rotating refresh tokens; Google sign-in by redirect (no Google script, CSP unchanged); Resend behind a `Mailer` interface.

Write the Vietnamese file in natural Vietnamese with the role names Chủ họ / Biên tập / Xem.

- [ ] **Step 2: Write ADR 0005**

Create `docs/adr/0005-cookie-sessions-and-sign-in.md` in the format of the existing ADRs (Status: Accepted, Date: 2026-11-13, Context, Decision, Consequences). Cover: why httpOnly cookies instead of tokens in `localStorage` (XSS cannot read them); why a short JWT plus an opaque rotating refresh token (stateless checks on every request, revocable sessions); the 10-second concurrent-refresh window; the known limit that a revoked session's access token stays valid for up to 15 minutes; why Google sign-in uses a redirect (no third-party script, CSP unchanged, works without popups on iOS); the email-verification rule for linking Google to an existing account; invite tokens stored in plain text (the owner can copy links again; they expire after 7 days and only grant membership).

- [ ] **Step 3: Update the deployment guide**

In `docs/deployment.md`:
- Section 1 (Render): list the new variables with what to enter — `APP_ORIGIN` (`https://ancestorstree.netlify.app`), `TRUST_PROXY_HOPS` (`2`; verify `req.ip` in P8), `JWT_SECRET` (generated by Render from `render.yaml`; rotating it signs everyone out), `MONGODB_URI` (required from P3 on: the API refuses to start without it), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`, `API_DOCS`.
- New section 5 "Google sign-in": Google Cloud console → create a project → OAuth consent screen (External; app name AncestorsTree; scopes `openid`, `email`, `profile`) → Credentials → Create OAuth client ID → Web application → Authorized redirect URIs `https://ancestorstree.netlify.app/api/auth/google/callback` and `http://localhost:5173/api/auth/google/callback` (no JavaScript origins needed) → copy the client ID and secret into Render and `apps/api/.env`. While the consent screen is in "Testing", only listed test users can sign in; publish it for everyone.
- New section 6 "Email (Resend)": create an API key (sending access) → `RESEND_API_KEY`; without a verified domain, Resend only delivers to the account owner's own email; to email everyone, add a domain in Resend, create the DNS records it shows, wait for "Verified", then set `MAIL_FROM` to `AncestorsTree <no-reply@your-domain>`. Without a key, development writes the reset link to the API log.
- Local development: add `JWT_SECRET` to `apps/api/.env` (`openssl rand -base64 48`) and a database name in `MONGODB_URI`.
- Update the checklist.

- [ ] **Step 4: Tick the roadmap**

In `docs/superpowers/plans/2026-11-12-roadmap.md`, tick every item under "Carry-over from the P1 review → P3" and add a line under P3: "Plan: [`2026-11-13-p03-accounts-clans.md`](2026-11-13-p03-accounts-clans.md)". Add to P5's carry-over: "Delete a clan (Owner) together with its people and operations." Add to P8's carry-over: "Verify `TRUST_PROXY_HOPS=2` gives the client IP behind Netlify + Render."

- [ ] **Step 5: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add docs
git commit -m "docs: P3 accounts, sessions, Google sign-in, email and deployment steps"
```
