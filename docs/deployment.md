# Deployment

```
Browser ──► Netlify (apps/web, static + CDN)
              │  /api/*  (proxy rewrite, same origin)
              ▼
            Render (apps/api, Node web service, Singapore)
```

The browser only ever talks to the Netlify domain. Netlify serves the built web app and proxies `/api/*` to the Render service, so cookies stay first-party and no CORS configuration is needed.

| Piece         | Config file                       | Deploys when                                                                                            |
| ------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Web (Netlify) | [`netlify.toml`](../netlify.toml) | a commit lands on `main` and changes the web app, `packages/shared` or root tooling                     |
| API (Render)  | [`render.yaml`](../render.yaml)   | a commit lands on `main`, its CI checks pass, and it changes the API, `packages/shared` or root tooling |

Both platforms read Node 24 from `.nvmrc` and pnpm from `"packageManager"` in `package.json`.

## 1. Render (API) — do this first

1. Sign in at https://dashboard.render.com with GitHub.
2. **New → Blueprint**, select the `ancestors-tree` repository, branch `main`. Render reads `render.yaml` and proposes the service `ancestors-tree-api`.
3. Click **Apply**. Render asks for the values of the variables marked `sync: false` in `render.yaml` (the table below says what to enter). Fill in `MONGODB_URI` (section 3) now: from P3 on the API refuses to start without it. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (section 5), `RESEND_API_KEY` (section 6) and `CLOUDINARY_URL` (section 4, used from P6) can stay empty for now. If the Blueprint already exists, add them under the service's **Environment** tab instead. Secrets are entered in the dashboard only, never committed.
4. When the first deploy is live, copy the service URL from the service page (normally `https://ancestors-tree-api.onrender.com`).
   - If Render added a suffix because the name was taken (for example `https://ancestors-tree-api-x1y2.onrender.com`), replace the URL in the `/api/*` redirect of `netlify.toml` and commit.
5. Check it: open `<render-url>/api/health` → `{"status":"ok","version":"0.1.0",...}` with the database reported as connected. `<render-url>/api/docs` is off in production unless you set `API_DOCS=on`.

What the Blueprint sets (visible under the service's **Settings**):

| Setting           | Value                                                                                      | Why                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Region            | Singapore                                                                                  | lowest latency from Vietnam; cannot be changed later                   |
| Instance type     | Free                                                                                       | spins down after 15 minutes without traffic, about 1 minute to wake up |
| Build command     | `corepack enable && pnpm install --frozen-lockfile --prod --filter @ancestors-tree/api...` | installs only the API and `packages/shared` runtime dependencies       |
| Start command     | `cd apps/api && node src/server.ts`                                                        | Node runs the TypeScript sources directly (ADR 0002)                   |
| Health check path | `/api/health`                                                                              | Render only switches traffic to a new deploy once it answers           |
| Auto-deploy       | After CI checks pass                                                                       | a red CI run on `main` never reaches production                        |
| Build filters     | `apps/api/**`, `packages/shared/**`, root tooling files                                    | web-only commits do not redeploy the API                               |
| Env vars          | see the table below                                                                        | `NODE_ENV=production` and `PORT` are set by Render automatically       |

Environment variables (Render dashboard → service → **Environment**). `render.yaml` already sets the ones with a value; enter the others yourself:

| Variable               | What to enter                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`           | `https://ancestorstree.netlify.app` (the Netlify address: no path, no trailing slash). Must equal the real Netlify URL exactly, or every write (sign-in, sign-up, creating a clan) is answered 403 by the origin check. Used for links in emails, the Google redirect URI and the origin check. Required in production. Set by `render.yaml`. |
| `TRUST_PROXY_HOPS`     | `2` (Netlify proxy plus Render's load balancer). Set by `render.yaml`. Required in production. To be verified in P8 that `req.ip` is the visitor's address, because the sign-in rate limits depend on it.                                                                                                                                     |
| `JWT_SECRET`           | Generated by Render from `render.yaml`; do not enter anything. Rotating it signs everyone out.                                                                                                                                                                                                                                                |
| `MONGODB_URI`          | Required: the API refuses to start without it. The Atlas connection string with the database name `ancestors-tree` after the host (section 3).                                                                                                                                                                                                |
| `GOOGLE_CLIENT_ID`     | The OAuth client ID ending in `.apps.googleusercontent.com` (section 5). Set together with the secret or not at all; without them the Google button is hidden.                                                                                                                                                                                |
| `GOOGLE_CLIENT_SECRET` | The secret of the same OAuth client (section 5).                                                                                                                                                                                                                                                                                              |
| `RESEND_API_KEY`       | Optional: a Resend API key starting with `re_` (section 6). Without it the API cannot send email in production.                                                                                                                                                                                                                               |
| `MAIL_FROM`            | The sender. `render.yaml` sets `AncestorsTree <onboarding@resend.dev>`, which Resend only delivers to its account owner; change it once you verify a domain (section 6).                                                                                                                                                                      |
| `API_DOCS`             | Leave unset: `/api/docs` is off in production. `on` turns it on, `off` turns it off everywhere. Through the Netlify domain the site-wide CSP blocks the docs page; open it on the Render URL.                                                                                                                                                 |
| `CLOUDINARY_URL`       | From P6 (section 4).                                                                                                                                                                                                                                                                                                                          |

Notes:

- Bump `APP_VERSION` in `render.yaml` on releases; it is what `GET /api/health` reports.
- Blueprint changes to `render.yaml` are applied on the next sync. Env vars entered by hand in the dashboard are kept.
- If the build fails at `corepack enable` (permissions), change the build command to `npx --yes pnpm@11.17.0 install --frozen-lockfile --prod --filter @ancestors-tree/api...` (keep the version equal to `packageManager`).
- To read the API reference of a deployed service, set `API_DOCS=on` and open `<render-url>/api/docs`; it is off in production by default. Through the Netlify domain the site-wide CSP blocks the Scalar CDN script.

## 2. Netlify (web)

1. Sign in at https://app.netlify.com with GitHub.
2. **Add new project → Import an existing project → GitHub**, select `ancestors-tree`.
3. On the build settings screen leave everything as detected — `netlify.toml` overrides the UI:
   - Base directory: empty (repository root)
   - Build command: `pnpm --filter @ancestors-tree/web build`
   - Publish directory: `apps/web/dist`
   - Do not add `NODE_VERSION` or `PNPM_VERSION` variables (they would override `.nvmrc` / `packageManager`).
4. Deploy. Then **Project configuration → General → Project details → Change project name** to get a readable URL (this guide uses `ancestorstree` throughout: `https://ancestorstree.netlify.app`).
5. **Project configuration → Build & deploy → Continuous deployment → Branches and deploy contexts**:
   - Production branch: `main`
   - Deploy Previews: **Any pull request against your production branch** (free: previews cost 0 credits)
   - Branch deploys: **Deploy only the production branch**
6. Optional: **Deploy notifications → GitHub commit status / pull request comments** so each PR shows its preview link.
7. Check it: open `https://ancestorstree.netlify.app` → the page shows "Máy chủ đang hoạt động (phiên bản 0.1.0)". Also open `https://ancestorstree.netlify.app/api/health` directly.

What `netlify.toml` sets:

| Setting           | Value                                                                                                                                             | Why                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/api/*` redirect | 200 proxy to the Render URL                                                                                                                       | same-origin API, first-party cookies (spec §4)                                        |
| `/*` redirect     | `/index.html` (200)                                                                                                                               | client-side routing for the single-page app                                           |
| Security headers  | `nosniff`, `X-Frame-Options: DENY`, referrer and permissions policy, Content-Security-Policy (self-hosted scripts, styles, fonts and images only) | baseline hardening; `e2e/design-system.spec.ts` replays the CSP against the built app |
| Asset caching     | `/assets/*` immutable for 1 year                                                                                                                  | Vite fingerprints file names                                                          |
| Ignore command    | skip when `apps/web`, `packages/shared` and root tooling are unchanged                                                                            | production deploys cost 15 credits each                                               |

### Deploy previews and deploy order

- **Deploy previews cannot sign in, by design.** A preview's `/api/*` proxies to the production API, whose origin check rejects writes from the preview's origin (403), so sign-in and sign-up fail there. Test accounts on the production site or locally.
- **Order matters when merging to `main`.** Netlify publishes the new web app as soon as the merge lands, while Render only deploys after CI passes. Before merging, sync the Render Blueprint and set the environment variables: `JWT_SECRET` (generated), `APP_ORIGIN`, `TRUST_PROXY_HOPS`, and `MONGODB_URI` with the database name (section 3). If `MONGODB_URI` is missing, Render keeps the old API running (the health check gates the switch) and the new web app shows the error page on protected routes. For a few minutes the new web app may talk to the old API (`/api/me` answers 404); that is expected.

### Known limitation / follow-up: client IP

The per-IP rate limits trust `X-Forwarded-For`. The Render origin (`ancestors-tree-api.onrender.com`) is publicly reachable, so a caller that talks to it directly can send its own `X-Forwarded-For` and pick a new IP for every request, bypassing the per-IP limits. The per-email limits on sign-in and forgot-password do not depend on the IP and still apply. Follow-up before inviting real users: use Netlify's signed proxy (`x-nf-sign`, verified by the API, rejecting unsigned requests in production), and confirm on a real deploy that `req.ip` is the visitor's address.

## 3. MongoDB Atlas (database)

One free M0 cluster serves both environments; each environment uses its own database on it.

1. Sign in at https://cloud.mongodb.com, create a project `ancestors-tree`, then **Create cluster → M0 (Free)**, provider AWS, region **Singapore (ap-southeast-1)** (same region as Render).
2. **Database Access → Add new database user**: user `ancestors-tree-app`, a generated password, role **Read and write to any database**. Save the password in your password manager.
3. **Network Access → Add IP address → Allow access from anywhere (`0.0.0.0/0`)**. Render free services have no fixed outbound IP, so an allowlist is not possible; the long generated password is the protection.
4. **Connect → Drivers** and copy the `mongodb+srv://…` string. Replace `<db_password>` and insert the database name after the host:
   - local development (`apps/api/.env`): `mongodb+srv://ancestors-tree-app:<password>@<cluster-host>/ancestors-tree-dev?retryWrites=true&w=majority`
   - Render (`MONGODB_URI` in the dashboard): the same string with `/ancestors-tree` instead of `/ancestors-tree-dev`
5. Local development also needs `JWT_SECRET` in `apps/api/.env`, at least 32 characters. Generate one with `openssl rand -base64 48` and paste the output (never commit it). Also check that `MONGODB_URI` includes a database name; the API rejects a URI without one.
6. If the password contains `@ : / ? # [ ] %`, percent-encode it (or generate one with letters and digits only).

Tests never use Atlas: they start an in-memory MongoDB (`mongodb-memory-server`, spec §15).

## 4. Cloudinary (photos)

1. Sign up at https://cloudinary.com (free plan). Optionally rename the cloud under **Settings → Product environment** to something readable, before the first upload (the cloud name is part of every photo URL).
2. **Settings → API Keys**: copy the **API environment variable** (`cloudinary://<api_key>:<api_secret>@<cloud_name>`).
3. Put it in `CLOUDINARY_URL`: in `apps/api/.env` locally and in the Render dashboard for production. Both environments share the cloud; `CLOUDINARY_FOLDER` keeps them apart (`ancestors-tree/dev` locally, `ancestors-tree/prod` on Render).
4. Do not create folders or upload presets by hand: the API signs every upload with its folder, formats and size limit (spec §12, image storage).

The API secret must never reach the browser or the repository. The web app only ever sees the cloud name and public photo IDs.

## 5. Google sign-in

The API signs users in with Google by redirect (authorization code + PKCE); no Google script runs on our pages. You need an OAuth client:

1. Open https://console.cloud.google.com and create a project (for example `ancestors-tree`).
2. **APIs & Services → OAuth consent screen**: user type **External**, app name `AncestorsTree`, your support email, scopes `openid`, `email` and `profile`.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
4. Under **Authorized redirect URIs** add both:
   - `https://ancestorstree.netlify.app/api/auth/google/callback`
   - `http://localhost:5173/api/auth/google/callback`

   No JavaScript origins are needed.

5. Copy the client ID and the client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: in `apps/api/.env` locally and in the Render dashboard for production.
6. While the consent screen is in **Testing**, only the test users you list can sign in. Click **Publish app** on the consent screen so everyone can.

The redirect URI is `APP_ORIGIN` plus `/api/auth/google/callback`, so it must match `APP_ORIGIN` exactly. Locally, run the web app on port 5173 so the Vite proxy forwards `/api` to the API.

## 6. Email (Resend)

Password reset emails go through Resend.

1. Sign up at https://resend.com (free plan: 3,000 emails per month).
2. **API Keys → Create API Key** with sending access. Copy it (it starts with `re_`) into `RESEND_API_KEY`: in `apps/api/.env` and in the Render dashboard.
3. **Caveat:** without a verified domain, Resend only delivers to the email address of the Resend account owner. Until you verify a domain, the production API cannot email other users, so password reset only works for you.
4. To email everyone: in Resend, **Domains → Add Domain**, create the DNS records it shows at your DNS provider, wait until the domain shows **Verified**, then set `MAIL_FROM` to `AncestorsTree <no-reply@your-domain>` (your own domain) in Render. No code change is needed.
5. Without `RESEND_API_KEY`, development writes the reset link to the API log instead of sending it. In production the API cannot send email without a key.

## Free-plan limits to keep in mind

- **Netlify credits:** 300 credits per month on the free plan; each production deploy costs 15 (about 20 production deploys per month). Deploy Previews and branch deploys cost 0. Merge to `main` in batches rather than many tiny PRs.
- **Proxy timeout vs. cold start:** Netlify proxy requests time out after 26 seconds, but a sleeping Render free service takes about a minute to wake up. The first request after a quiet period can therefore fail with a gateway error; retrying after a few seconds works (the server status widget has a retry button). The deploy sub-plan (P8) adds a proper wake-up screen; optionally, an external monitor (for example cron-job.org) calling `/api/health` every 14 minutes keeps the service awake within the 750 free instance hours per month.
- **Render free build minutes** are limited per month; build filters keep web-only commits from using them.

## Checklist after the first deploy

- [ ] `https://<render-url>/api/health` returns `status: ok`
- [ ] `netlify.toml` points `/api/*` at the actual Render URL
- [ ] `https://ancestorstree.netlify.app` shows the Vietnamese server status message with version `0.1.0`
- [ ] `https://ancestorstree.netlify.app/api/health` returns JSON (proxy works)
- [ ] Netlify branch deploys are limited to `main`; Render auto-deploy is "After CI checks pass"
- [ ] `MONGODB_URI` (with the database name `ancestors-tree`) is set in Render and `https://<render-url>/api/health` reports the database as connected
- [ ] `JWT_SECRET` exists in Render (generated from `render.yaml`) and in `apps/api/.env` (`openssl rand -base64 48`)
- [ ] `APP_ORIGIN` is `https://ancestorstree.netlify.app` and `TRUST_PROXY_HOPS` is `2`
- [ ] Google: both redirect URIs are authorized, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set in Render and locally, and the consent screen is published
- [ ] Optional: `RESEND_API_KEY` is set; `MAIL_FROM` uses your verified domain if you want to email other people
- [ ] Sign up, sign out and sign in again on the Netlify domain; create a clan
- [ ] When P6 starts: `CLOUDINARY_URL` is set in `apps/api/.env` and in the Render dashboard (the API rejects malformed values at startup without printing them)
