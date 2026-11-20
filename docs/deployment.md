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
3. Click **Apply**. Render asks for the values of the variables marked `sync: false` in `render.yaml` (the table below says what to enter). Fill in `MONGODB_URI` (section 3) and `PROXY_SIGNATURE_SECRET` (section 7, step 1; the same value also goes to Netlify, section 7, step 4) now: in production the API refuses to start without either. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (section 5), `RESEND_API_KEY` (section 6), `CLOUDINARY_URL` (section 4, used from P6) and `SENTRY_DSN` (section 7, step 2) can stay empty for now. If the Blueprint already exists, add them under the service's **Environment** tab instead. Secrets are entered in the dashboard only, never committed.
4. When the first deploy is live, copy the service URL from the service page (normally `https://ancestors-tree-api.onrender.com`).
   - If Render added a suffix because the name was taken (for example `https://ancestors-tree-api-x1y2.onrender.com`), replace the URL in the `/api/*` redirect of `netlify.toml` and commit.
5. Check it: open `<render-url>/api/health` → `{"status":"ok","version":"0.1.0",...}` with the database reported as connected. `/api/health` is the only path the Render URL answers directly; every other path answers 403 because it did not come through Netlify (section 7).

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

| Variable                     | What to enter                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`                 | `https://ancestorstree.netlify.app` (the Netlify address: no path, no trailing slash). Must equal the real Netlify URL exactly, or every write (sign-in, sign-up, creating a clan) is answered 403 by the origin check. Used for links in emails, the Google redirect URI and the origin check. Required in production. Set by `render.yaml`.                           |
| `TRUST_PROXY_HOPS`           | `2` (Netlify proxy plus Render's load balancer). Set by `render.yaml`. Required in production: the API does not start without it. Section 7, step 7.2 checks that the request log's `clientIp` is the visitor's address, because the sign-in rate limits depend on it.                                                                                                  |
| `JWT_SECRET`                 | Generated by Render from `render.yaml`; do not enter anything. Rotating it signs everyone out.                                                                                                                                                                                                                                                                          |
| `MONGODB_URI`                | Required: the API refuses to start without it. The Atlas connection string with the database name `ancestors-tree` after the host (section 3).                                                                                                                                                                                                                          |
| `GOOGLE_CLIENT_ID`           | The OAuth client ID ending in `.apps.googleusercontent.com` (section 5). Set together with the secret or not at all; without them the Google button is hidden.                                                                                                                                                                                                          |
| `GOOGLE_CLIENT_SECRET`       | The secret of the same OAuth client (section 5).                                                                                                                                                                                                                                                                                                                        |
| `RESEND_API_KEY`             | Optional: a Resend API key starting with `re_` (section 6). Without it the API cannot send email in production.                                                                                                                                                                                                                                                         |
| `MAIL_FROM`                  | The sender. `render.yaml` sets `AncestorsTree <onboarding@resend.dev>`, which Resend only delivers to its account owner; change it once you verify a domain (section 6).                                                                                                                                                                                                |
| `API_DOCS`                   | Leave unset: `/api/docs` is off in production. `on` turns it on, `off` turns it off everywhere. Do not turn it on in production: the Render URL answers it with 403 (it skips Netlify), and on the Netlify domain it would load the Scalar script from a CDN on the site's own origin, next to real sessions. Read the reference locally instead (see the notes below). |
| `CLOUDINARY_URL`             | From P6 (section 4).                                                                                                                                                                                                                                                                                                                                                    |
| `CLOUDINARY_FOLDER`          | `ancestors-tree/prod`. Set by `render.yaml`. Required in production: the API does not start without it. Keeps production photos apart from development ones (section 4, section 7, step 3).                                                                                                                                                                             |
| `PROXY_SIGNATURE_SECRET`     | Required in production: the API does not start without it. The secret Netlify signs proxied requests with; Render and Netlify need the same value. Generate it as in section 7, step 1.                                                                                                                                                                                 |
| `SENTRY_DSN`                 | Optional: the DSN of the Sentry **Node** project (section 7, step 2). Without it the API sends no error reports.                                                                                                                                                                                                                                                        |
| `VITE_CLOUDINARY_CLOUD_NAME` | Not a Render variable: set it in the Netlify dashboard (section 4). The cloud name, the part after `@` in `CLOUDINARY_URL`. Public: it is part of every photo URL. Without it the web app shows initials instead of photos.                                                                                                                                             |

Notes:

- Bump `APP_VERSION` in `render.yaml` on releases; it is what `GET /api/health` reports.
- Blueprint changes to `render.yaml` are applied on the next sync. Env vars entered by hand in the dashboard are kept.
- If the build fails at `corepack enable` (permissions), change the build command to `npx --yes pnpm@11.17.0 install --frozen-lockfile --prod --filter @ancestors-tree/api...` (keep the version equal to `packageManager`).
- The interactive API reference is for local use: run `pnpm dev` and open http://localhost:3000/api/docs. The deployed service does not serve it (keep `API_DOCS` unset). To read the deployed OpenAPI document, open `https://ancestorstree.netlify.app/api/openapi.json`: it is served whatever `API_DOCS` says, and through the Netlify domain the request is signed. On the Render URL it answers 403.

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

| Setting           | Value                                                                                                                                                                                                                                   | Why                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/api/*` redirect | 200 proxy to the Render URL, signed with `PROXY_SIGNATURE_SECRET`                                                                                                                                                                       | same-origin API, first-party cookies (spec §4); the API refuses requests that skip Netlify (section 7) |
| `/*` redirect     | `/index.html` (200)                                                                                                                                                                                                                     | client-side routing for the single-page app                                                            |
| Security headers  | `nosniff`, `X-Frame-Options: DENY`, referrer and permissions policy, Content-Security-Policy (self-hosted scripts, styles and fonts; photos from `res.cloudinary.com`, uploads to `api.cloudinary.com`, error reports to `*.sentry.io`) | baseline hardening; `e2e/design-system.spec.ts` replays the CSP against the built app                  |
| Asset caching     | `/assets/*` immutable for 1 year                                                                                                                                                                                                        | Vite fingerprints file names                                                                           |
| Ignore command    | skip when `apps/web`, `packages/shared` and root tooling are unchanged                                                                                                                                                                  | production deploys cost 15 credits each                                                                |

### Deploy previews and deploy order

- **Deploy previews cannot sign in, by design.** A preview's `/api/*` proxies to the production API, whose origin check rejects writes from the preview's origin (403), so sign-in and sign-up fail there. Test accounts on the production site or locally.
- **Order matters when merging to `main`.** Netlify publishes the new web app as soon as the merge lands, while Render only deploys after CI passes. Before merging, sync the Render Blueprint and set the environment variables: `JWT_SECRET` (generated), `APP_ORIGIN`, `TRUST_PROXY_HOPS`, `CLOUDINARY_FOLDER`, `PROXY_SIGNATURE_SECRET`, and `MONGODB_URI` with the database name (section 3). From P8 on, follow the deploy order in section 7. If `MONGODB_URI` is missing, Render keeps the old API running (the health check gates the switch) and the new web app shows the error page on protected routes. For a few minutes the new web app may talk to the old API (`/api/me` answers 404); that is expected.

### Client IP and the signed proxy

The per-IP rate limits trust `X-Forwarded-For` (`TRUST_PROXY_HOPS=2`: Netlify, then Render's load balancer). The Render origin is publicly reachable, so from P8 on Netlify signs every proxied request (`x-nf-sign`) and the API refuses any request without a valid signature (403), except `GET /api/health`. A caller who skips Netlify can no longer choose its own IP. Section 7 sets it up and checks that the request log's `clientIp` is the visitor's address.

### Known limitation: targeted lockout

The per-email limits apply to whoever sends the requests. Anyone who knows a user's email can block that user's password sign-in for up to 15 minutes (10 failed attempts per 15 minutes) and their password-reset emails for up to 24 hours (5 per 24 hours). Google sign-in and existing sessions are unaffected. A later improvement is a per-device exemption. If a dev database still has the old `expiresAt` TTL index on `passwordresets`, drop it once (`db.passwordresets.dropIndex('expiresAt_1')`). The API still starts, but until the old index is gone it deletes reset records after 1 hour, so the 24-hour cap silently stops holding.

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
5. In Netlify, set `VITE_CLOUDINARY_CLOUD_NAME` to the cloud name (the part after `@` in `CLOUDINARY_URL`). Locally, put it in `apps/web/.env.local`. It is public and part of every photo URL.

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

## 7. P8 setup: signed proxy and error reporting

P8 adds one required secret and the optional Sentry settings. Do steps 1 to 4 **before merging the P8 pull request** (step 5 explains why).

| Variable                          | Where                                  | Needed                                                    | What it is                                                                                                                      |
| --------------------------------- | -------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `PROXY_SIGNATURE_SECRET`          | Render **and** Netlify, the same value | required in production: without it the API does not start | the secret Netlify signs proxied requests with                                                                                  |
| `SENTRY_DSN`                      | Render                                 | optional: without it nothing is sent                      | the DSN of the Sentry **Node** project                                                                                          |
| `VITE_SENTRY_DSN`                 | Netlify                                | optional                                                  | the DSN of the Sentry **React** project; it ends up in the browser bundle, which is expected (a DSN only allows sending events) |
| `SENTRY_AUTH_TOKEN`               | Netlify                                | optional: without it there are no source maps             | lets the build upload source maps                                                                                               |
| `SENTRY_ORG`, `SENTRY_PROJECT`    | Netlify                                | with the token                                            | the organization slug and the React project slug                                                                                |
| `CLOUDINARY_FOLDER`               | Render (from `render.yaml`)            | now required in production                                | `ancestors-tree/prod`                                                                                                           |
| `RENDER_GIT_COMMIT`, `COMMIT_REF` | set by Render and Netlify              | nothing to do                                             | the commit, used as the Sentry release                                                                                          |

### Step 1: generate the proxy secret

Run `openssl rand -base64 48` once (without OpenSSL, for example on Windows: `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"`) and keep the output in your password manager. The API accepts at least 32 characters without spaces; this gives 64. The same value goes to Render and Netlify. Never commit it, and never put it in `apps/api/.env`: locally the Vite proxy does not sign, so with a value every request except `/api/health` would answer 403.

### Step 2: Sentry

1. Sign in at https://sentry.io (the free Developer plan is enough).
2. **Projects → Create Project → React**, name it `ancestors-tree-web`. Skip the setup wizard; the code is already in place.
3. **Projects → Create Project → Node.js** (or Express), name it `ancestors-tree-api`.
4. For each project, copy its DSN from **Settings → Projects → (project) → Client Keys (DSN)**: `<your DSN from Sentry → Project settings → Client Keys>`. The React one is for Netlify and the Node one is for Render.
5. Note the organization slug (**Settings → Organization → General Settings → Organization Slug**) and the React project's slug (`ancestors-tree-web`).
6. Create the build token. Use **Settings → Developer Settings → Organization Tokens → Create New Token**, named `netlify-source-maps`. An organization token has the release and source map rights the Vite plugin needs. If you use a personal token instead (**User settings → Personal Tokens**), give it **Project: Read & Write** and **Release: Admin**. Copy it once: `<your organization token from Sentry → Settings → Organization Tokens>`.
7. Recommended: in **Settings → Security & Privacy**, turn on **Prevent Storing of IP Addresses** and keep **Data Scrubber** and **Use Default Scrubbers** on. The app already sends no personal data; this is a second net on Sentry's side.

### Step 3: Render

1. **Blueprints → (the blueprint) → Manual sync**, so `render.yaml`'s `CLOUDINARY_FOLDER=ancestors-tree/prod` is applied. Render's documentation says a sync ignores new `sync: false` keys (it only asks for them when a Blueprint is first created). If the sync screen asks for `PROXY_SIGNATURE_SECRET` and `SENTRY_DSN` anyway, enter them there; otherwise add them in the next step.
2. **ancestors-tree-api → Environment → Add Environment Variable** (skip a variable the sync already asked for):
   - `PROXY_SIGNATURE_SECRET` = the value from step 1;
   - `SENTRY_DSN` = `<your DSN from Sentry → Project settings → Client Keys>` of the **Node** project.
3. Check the values that come from `render.yaml`: `CLOUDINARY_FOLDER` is `ancestors-tree/prod`, `APP_ORIGIN` is `https://ancestorstree.netlify.app` and `TRUST_PROXY_HOPS` is `2`. Do not add `SENTRY_TRACES_SAMPLE_RATE`: the app sends errors only.
   - If `CLOUDINARY_FOLDER` was not `ancestors-tree/prod` before (without it the old API fell back to `ancestors-tree/dev`), photos uploaded to production until now stay under the old folder (for example `ancestors-tree/dev/clans/…`). Deleting a clan only removes the photos under the new folder, so those old files become orphans; delete them by hand in Cloudinary's **Media Library** if you want.
4. Choose **Save only**: the merge deploys the new code. The API that runs now ignores these variables.

### Step 4: Netlify

**Project configuration → Environment variables → Add a variable → Add a single variable**, once per variable:

| Key                      | Value                                                                              | Scopes                                                                          | Deploy contexts                           |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| `PROXY_SIGNATURE_SECRET` | the value from step 1                                                              | all scopes, or at least **Runtime** (signed proxy redirects read it from there) | same value for all                        |
| `VITE_SENTRY_DSN`        | `<your DSN from Sentry → Project settings → Client Keys>` of the **React** project | **Builds**                                                                      | Production only, so previews send nothing |
| `SENTRY_AUTH_TOKEN`      | the token from step 2.6; tick **Contains secret values** if offered                | **Builds**                                                                      | Production only                           |
| `SENTRY_ORG`             | the organization slug                                                              | **Builds**                                                                      | Production only                           |
| `SENTRY_PROJECT`         | `ancestors-tree-web`                                                               | **Builds**                                                                      | Production only                           |

Choosing scopes is a Pro and Enterprise feature. On the free plan the dialog shows no scope choice and every variable gets all scopes, which includes Runtime and Builds; if you do see scope checkboxes, make sure `PROXY_SIGNATURE_SECRET` has **Runtime** (or simply all scopes). `PROXY_SIGNATURE_SECRET` is then visible to the build too, but Vite puts only `VITE_*` variables in the bundle, so it never reaches the browser. Netlify's docs list no plan restriction for per-context values; if the dialog offers no per-context values, give the Sentry variables the same value for all contexts (previews then report to Sentry too, which does no harm).

### Step 5: deploy order

1. Steps 1 to 4 come **before** the merge.
2. Merge the P8 pull request. Netlify builds at once, publishes the new web app and starts signing `/api/*`. The old API ignores the header, so nothing breaks in the meantime.
3. Render deploys after CI passes. With the variables set, the new API starts and checks every signature. If a required variable is missing, the new API stops at boot with a message that names the variable (never its value), the health check fails, and Render keeps the old API running. Add the variable, then **Manual Deploy → Deploy latest commit**.
4. If every page fails after Render's deploy and the logs show `Refused a request that did not come through the Netlify proxy` with `reason: "missing"` or `"signature"`, the two values differ, or Netlify's variable lacks the Runtime scope. Fix it on Netlify, then **Deploys → Trigger deploy → Deploy project** so the redirect picks it up. While you fix it, **Render → Events → (the previous deploy) → Rollback** brings the old API back; it ignores the signature, so the site works again. The next Render deploy turns the check back on, so fix the values before the next merge, and after a rollback check that **Settings → Auto-Deploy** is still "After CI checks pass".

### Step 6: uptime monitor

A free UptimeRobot monitor calls `/api/health` every 5 minutes, which keeps the Render service awake. If you already have one, open it and check the settings below; otherwise create it:

1. Sign in at https://uptimerobot.com (the free plan is enough).
2. **New monitor** (or open the existing one → **Edit**): type **HTTP(s)**, URL `<render-url>/api/health`, interval **5 minutes**.
3. Use the Render URL directly, not the Netlify domain: `GET` and `HEAD` on `/api/health` are the only requests the API accepts without Netlify's signature, so the monitor keeps working whatever happens to the proxy. If an existing monitor points somewhere else, change its URL.
4. Save. Within a few minutes it shows **Up**.

### Step 7: verify

1. **Sign-in.** Open `https://ancestorstree.netlify.app`, sign in and open a family tree. It works, so Netlify signs and the API accepts the signature.
2. **Visitor IP.** Open the site, then **Render → Logs**. The `request completed` lines of your visit carry `clientIp`, which must be your own public IP (your router or any "what is my IP" page shows it). If it is a Netlify or Render address, `TRUST_PROXY_HOPS` is wrong.
3. **The signature.**
   - `curl -i <render-url>/api/clans` answers `403` with `"code":"FORBIDDEN"`.
   - `curl -i <render-url>/api/health` answers `200`.
   - `curl -i https://ancestorstree.netlify.app/api/me` answers `401` (signed out), not 403: the proxy signs.
4. **Sentry, web.** Open the site, then the browser's developer console, and run `setTimeout(() => { throw new Error('P8 Sentry check') })`. Within a minute the error shows in the `ancestors-tree-web` project, with the commit as its release. Errors typed straight into the console are not reported; the `setTimeout` makes this one a real unhandled error.
5. **Source maps.** In the `ancestors-tree-web` project, **Settings → Source Maps** lists an artifact bundle for the release. `curl -I https://ancestorstree.netlify.app/assets/<the index-….js file name>.map` must not return a map: the maps were deleted before publishing, so the single-page fallback answers with the app's HTML (`content-type: text/html`).
6. **Sentry, API.** The API reports only unexpected errors, and there is no route that fails on purpose. To check the DSN, run this once from `apps/api` on your own machine. It sends one test message; a DSN only allows sending events, but keep it out of shared shell history anyway:

   Git Bash, macOS or Linux:

   ```bash
   SENTRY_DSN='<your DSN from Sentry → Project settings → Client Keys>' node --input-type=module -e "import * as Sentry from '@sentry/node'; Sentry.init({ dsn: process.env.SENTRY_DSN }); Sentry.captureMessage('P8 Sentry check'); await Sentry.flush(5000);"
   ```

   Windows PowerShell (the variable stays set until you close the window):

   ```powershell
   $env:SENTRY_DSN='<your DSN from Sentry → Project settings → Client Keys>'; node --input-type=module -e "import * as Sentry from '@sentry/node'; Sentry.init({ dsn: process.env.SENTRY_DSN }); Sentry.captureMessage('P8 Sentry check'); await Sentry.flush(5000);"
   ```

   The message shows in `ancestors-tree-api`. From then on, real 500s arrive there with the commit as their release.

7. **Uptime monitor.** The UptimeRobot monitor from step 6 calls `<render-url>/api/health` every 5 minutes. That route is exempt from the signature check, so the monitor stays green and keeps the server awake. Check that it is still green after the deploy.
8. **Wake-up screen.** Once, pause the UptimeRobot monitor and leave the site unused for more than 15 minutes, so Render puts the service to sleep. Open the site: "Đang đánh thức máy chủ…" shows, and within about a minute the page loads by itself. Resume the monitor afterwards.

## Free-plan limits to keep in mind

- **Netlify credits:** 300 credits per month on the free plan; each production deploy costs 15 (about 20 production deploys per month). Deploy Previews and branch deploys cost 0. Merge to `main` in batches rather than many tiny PRs.
- **Proxy timeout vs. cold start:** Netlify proxy requests time out after 26 seconds, but a sleeping Render free service takes about a minute to wake up. The web app then shows its wake-up screen, checks `/api/health` every 3 seconds and carries on once the server answers (spec §13.1). The UptimeRobot monitor calling `/api/health` every 5 minutes keeps the service awake within the 750 free instance hours per month, so the screen mostly shows after a deploy or a restart.
- **Render free build minutes** are limited per month; build filters keep web-only commits from using them.

## Checklist after the first deploy

- [ ] `<render-url>/api/health` returns `status: ok`
- [ ] `netlify.toml` points `/api/*` at the actual Render URL
- [ ] `https://ancestorstree.netlify.app` shows the Vietnamese server status message with version `0.1.0`
- [ ] `https://ancestorstree.netlify.app/api/health` returns JSON (proxy works)
- [ ] Netlify branch deploys are limited to `main`; Render auto-deploy is "After CI checks pass"
- [ ] `MONGODB_URI` (with the database name `ancestors-tree`) is set in Render and `<render-url>/api/health` reports the database as connected
- [ ] `JWT_SECRET` exists in Render (generated from `render.yaml`) and in `apps/api/.env` (`openssl rand -base64 48`)
- [ ] `APP_ORIGIN` is `https://ancestorstree.netlify.app`, `TRUST_PROXY_HOPS` is `2` and `CLOUDINARY_FOLDER` is `ancestors-tree/prod`
- [ ] Google: both redirect URIs are authorized, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set in Render and locally, and the consent screen is published
- [ ] Optional: `RESEND_API_KEY` is set; `MAIL_FROM` uses your verified domain if you want to email other people
- [ ] Sign up, sign out and sign in again on the Netlify domain; create a clan
- [ ] When P6 starts: `CLOUDINARY_URL` is set in `apps/api/.env` and in the Render dashboard (the API rejects malformed values at startup without printing them)
- [ ] `PROXY_SIGNATURE_SECRET` has the same value on Render and Netlify (on Netlify with all scopes, or at least Runtime); `<render-url>/api/clans` answers 403 and `<render-url>/api/health` answers 200 (section 7, step 7)
- [ ] The request log's `clientIp` is the visitor's own address
- [ ] Sentry: the web and API projects each received the test event, with the commit as release; the web release lists its source maps, and `/assets/*.map` answers the HTML fallback, not a map
- [ ] The UptimeRobot monitor on `<render-url>/api/health` (HTTP(s), every 5 minutes) is green (section 7, step 6)
