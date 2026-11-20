# ADR 0013: Signed proxy and error reporting

- Status: Accepted
- Date: 2026-11-20

## Context

The MVP goes in front of real families (P8). Three problems were left open.

- The Render URL is public. A caller who skips Netlify can send any `X-Forwarded-For`, pick a new IP for every request and get past the per-IP rate limits (spec §12).
- A missing production setting fell back to a development default without a word: production photos went to the dev Cloudinary folder.
- Nobody sees the errors that real users hit. The free Sentry plan allows 5,000 errors a month, and the app holds family data that must not leave it (spec §13.1).

A sleeping Render instance takes 30–60 s to wake up. Netlify's proxy gives up after 26 s with a gateway error, which is not a bug to report.

## Decision

**Netlify signs, the API checks.** The `/api/*` rewrite in `netlify.toml` has `signed = "PROXY_SIGNATURE_SECRET"`, so Netlify sends `x-nf-sign` (a JWS, HS256) with every proxied request. A middleware checks it with `node:crypto` only. It requires `alg` HS256, an HMAC compared with `timingSafeEqual`, `iss` "netlify", and an `exp` no more than 30 s in the past: Render can hold a request for the 26 s that Netlify waits, plus some clock drift. It runs right after `trust proxy` and the request logger, before the rate limits and the routes. `GET`/`HEAD /api/health` are exempt for Render's health check and the uptime monitor. A refused request answers `FORBIDDEN` (403), and the warning log holds the reason only. The header is redacted from the request log, which now records `clientIp`, the address after `trust proxy`.

**No development defaults in production.** `CLOUDINARY_FOLDER` and `PROXY_SIGNATURE_SECRET` join `APP_ORIGIN` and `TRUST_PROXY_HOPS`: without them the API refuses to start, so Render keeps the previous deploy.

**Errors to Sentry, errors only, no personal data.** Both sides use SDK 11, with the default integrations off, no tracing and `dataCollection` off (SDK 11's replacement for `sendDefaultPii`). One scrubber in `shared` drops request data, breadcrumbs, extras and user details except the id, and redacts email addresses. The release is the commit.

- The API loads `@sentry/node` only in production with `SENTRY_DSN`. The error handler reports unexpected errors (answered 500) explicitly; known codes are never sent.
- The web loads `@sentry/react` in its own chunk after the first render. Before that, `reportError` queues reports and catches unhandled errors. The error boundaries report what they catch. Expected API errors, router 404s and the sleeping server are never sent.
- With `SENTRY_AUTH_TOKEN` the Netlify build makes `hidden` source maps, uploads them and deletes them before publishing.

**A gateway error is a sleeping server, not a bug.** The API client turns it into the wake-up screen (spec §13.1), not a report.

## Alternatives considered

- **Allow only Netlify's IP addresses.** Netlify does not publish a stable list of egress addresses.
- **A static shared header.** A fixed secret that never expires: anyone who saw one request could replay it forever, and it would sit in every log.
- **`jose` for the token.** It is already a dependency, and `jwtVerify` with `algorithms: ['HS256']` would work. The check is one fixed algorithm and two claims, about 30 lines of `node:crypto`, with nothing to configure wrongly.
- **Sentry's default integrations and tracing.** They use the free quota for spans, and they send URLs, headers and breadcrumbs that can hold names, emails and invite tokens.
- **The web SDK in the main bundle.** It costs every visitor tens of kilobytes before the first render, to report errors that are rare.

## Consequences

- Calling the Render URL directly answers 403, except `/api/health`. Local development and the e2e API have no secret, so they skip the check.
- `PROXY_SIGNATURE_SECRET` lives in two places (Netlify and Render), and they must match. Changing it needs a new value on both, then a Netlify deploy and a Render deploy; until both are done, requests fail with 403.
- Netlify does not document the token's lifetime. A refused `expired` request logs `secondsPastExp`, so the skew can be checked against the logs.
- Sentry events carry no request context; the stack trace, the release, the boundary tag and the user id must be enough.
- `@sentry/node` 11 brings `@sentry/bundler-plugins` and the `sentry` CLI into the API's production install, where they are unused.
