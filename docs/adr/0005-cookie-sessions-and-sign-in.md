# ADR 0005: Cookie sessions, rotating refresh tokens and sign-in by redirect

- Status: Accepted
- Date: 2026-11-13

## Context

P3 adds accounts: email and password, Google sign-in, password reset by email, and invite links that grant clan membership. The web app and the API share one origin (the Netlify proxy, spec §4), so cookies are first-party. The decisions below are about where a signed-in browser keeps its proof of identity, how that proof is renewed and revoked, and how Google sign-in reaches the page.

## Decision

**httpOnly cookies, not `localStorage`.** Both tokens live in `httpOnly`, `SameSite=Lax` cookies (`Secure` in production). A script injected through XSS cannot read them, which it could if they sat in `localStorage`. `SameSite=Lax` plus an `Origin` check on every non-GET `/api` request covers CSRF.

**A short JWT plus an opaque rotating refresh token.**

- The access token is a JWT (HS256, 15 minutes, cookie `at`, path `/api`). The API verifies it on every request without touching the database.
- The refresh token is a random opaque value (cookie `rt`, path `/api/auth`, 30 days). Only its SHA-256 hash is stored (`Session`), so a database leak does not yield usable tokens. Every refresh issues a new token and marks the old one used. Using an old token again revokes its whole family, which signs out whoever holds the stolen copy and the real user alike, and the real user signs in again.
- Sessions can therefore be revoked (sign out, password reset, a Google takeover) without checking the database on every request.

**A 10-second window for concurrent refreshes.** Two tabs often refresh at the same moment with the same cookie. A token used again within 10 seconds of its first use is treated as such a concurrent refresh and answered like any other refresh; only a reuse after 10 seconds counts as theft and revokes the family.

**Known limit.** Revoking a session does not invalidate an access token already issued: it stays valid for up to 15 minutes. We accept this to keep request checks stateless; the window is short and every refresh after it fails.

**Google sign-in by full-page redirect.** The API starts an authorization-code flow with PKCE, `state` and `nonce` (kept in a 10-minute `g_state` cookie, path `/api/auth/google`) and handles the callback itself. No Google script runs on our pages, so the CSP in `netlify.toml` stays unchanged, and it works on iOS without popups. Google's `redirect_uri` is `${APP_ORIGIN}/api/auth/google/callback`.

**Linking Google to an existing account depends on email verification.** Only emails Google reports as verified are accepted. If an account with that email exists and its email was verified (`emailVerifiedAt`, set by Google sign-in or a password reset), Google signs into it. If it was never verified, someone could have registered it with an address they do not own, so the Google sign-in takes the account over: it clears the password and signs the account out everywhere. Otherwise an attacker who pre-registered a victim's email would keep access after the victim signed in with Google.

**Password reset.** A link valid for 1 hour and usable once, with the token in the URL fragment so it is not sent to servers or logs; only its hash is stored. The request answers the same whether or not the email exists, and a reset signs out every device. Emails go through a `Mailer` interface (Resend, the log in development, memory in tests).

**Invite tokens are stored in plain text.** Unlike refresh and reset tokens, the `Invite` token is stored as is, so the clan Owner can copy a link again later. An invite expires after 7 days, can be revoked (the document is deleted), and only grants membership with the role the Owner chose, never access to an account.

## Consequences

- A non-GET `/api` request that carries an `Origin` header must carry our origin. Requests without `Origin` (curl, server-to-server) are not browser requests and are let through; browsers always send `Origin` on cross-site writes.
- Session checks cost no database read, but sign-out is not instant for the access token (up to 15 minutes).
- Rotating `JWT_SECRET` signs everyone out.
- An unverified password account can lose its password to a Google sign-in with the same email; this is intended and is the price of safe linking.
- Without a verified domain, Resend delivers only to the account owner's address, so password reset emails reach other users only after a domain is verified (docs/deployment.md, section 6).
