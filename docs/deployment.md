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
3. Click **Apply**. Render asks for the values of `MONGODB_URI` and `CLOUDINARY_URL` (marked `sync: false`). Paste the production values from sections 3 and 4, or leave them empty for now: the API starts without them until P3 (database) and P6 (photo upload). If the Blueprint already exists, add them under the service's **Environment** tab instead. Secrets are entered in the dashboard only, never committed.
4. When the first deploy is live, copy the service URL from the service page (normally `https://ancestors-tree-api.onrender.com`).
   - If Render added a suffix because the name was taken (for example `https://ancestors-tree-api-x1y2.onrender.com`), replace the URL in the `/api/*` redirect of `netlify.toml` and commit.
5. Check it: open `<render-url>/api/health` → `{"status":"ok","version":"0.1.0",...}` and `<render-url>/api/docs`.

What the Blueprint sets (visible under the service's **Settings**):

| Setting           | Value                                                                                                                   | Why                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Region            | Singapore                                                                                                               | lowest latency from Vietnam; cannot be changed later                   |
| Instance type     | Free                                                                                                                    | spins down after 15 minutes without traffic, about 1 minute to wake up |
| Build command     | `corepack enable && pnpm install --frozen-lockfile --prod --filter @ancestors-tree/api...`                              | installs only the API and `packages/shared` runtime dependencies       |
| Start command     | `cd apps/api && node src/server.ts`                                                                                     | Node runs the TypeScript sources directly (ADR 0002)                   |
| Health check path | `/api/health`                                                                                                           | Render only switches traffic to a new deploy once it answers           |
| Auto-deploy       | After CI checks pass                                                                                                    | a red CI run on `main` never reaches production                        |
| Build filters     | `apps/api/**`, `packages/shared/**`, root tooling files                                                                 | web-only commits do not redeploy the API                               |
| Env vars          | `LOG_LEVEL=info`, `APP_VERSION=0.1.0`, `CLOUDINARY_FOLDER=ancestors-tree/prod`; secrets `MONGODB_URI`, `CLOUDINARY_URL` | `NODE_ENV=production` and `PORT` are set by Render automatically       |

Notes:

- Bump `APP_VERSION` in `render.yaml` on releases; it is what `GET /api/health` reports.
- Blueprint changes to `render.yaml` are applied on the next sync. Env vars entered by hand in the dashboard are kept.
- If the build fails at `corepack enable` (permissions), change the build command to `npx --yes pnpm@11.17.0 install --frozen-lockfile --prod --filter @ancestors-tree/api...` (keep the version equal to `packageManager`).

## 2. Netlify (web)

1. Sign in at https://app.netlify.com with GitHub.
2. **Add new project → Import an existing project → GitHub**, select `ancestors-tree`.
3. On the build settings screen leave everything as detected — `netlify.toml` overrides the UI:
   - Base directory: empty (repository root)
   - Build command: `pnpm --filter @ancestors-tree/web build`
   - Publish directory: `apps/web/dist`
   - Do not add `NODE_VERSION` or `PNPM_VERSION` variables (they would override `.nvmrc` / `packageManager`).
4. Deploy. Then **Project configuration → General → Project details → Change project name** to get a readable URL (for example `ancestors-tree.netlify.app`).
5. **Project configuration → Build & deploy → Continuous deployment → Branches and deploy contexts**:
   - Production branch: `main`
   - Deploy Previews: **Any pull request against your production branch** (free: previews cost 0 credits)
   - Branch deploys: **Deploy only the production branch**
6. Optional: **Deploy notifications → GitHub commit status / pull request comments** so each PR shows its preview link.
7. Check it: open `https://<project>.netlify.app` → the page shows "Máy chủ đang hoạt động (phiên bản 0.1.0)". Also open `https://<project>.netlify.app/api/health` directly.

What `netlify.toml` sets:

| Setting           | Value                                                                  | Why                                                            |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| `/api/*` redirect | 200 proxy to the Render URL                                            | same-origin API, first-party cookies (spec §4)                 |
| `/*` redirect     | `/index.html` (200)                                                    | client-side routing for the single-page app                    |
| Security headers  | `nosniff`, `X-Frame-Options: DENY`, referrer and permissions policy    | baseline hardening; a CSP is added with the design system (P2) |
| Asset caching     | `/assets/*` immutable for 1 year                                       | Vite fingerprints file names                                   |
| Ignore command    | skip when `apps/web`, `packages/shared` and root tooling are unchanged | production deploys cost 15 credits each                        |

## 3. MongoDB Atlas (database)

One free M0 cluster serves both environments; each environment uses its own database on it.

1. Sign in at https://cloud.mongodb.com, create a project `ancestors-tree`, then **Create cluster → M0 (Free)**, provider AWS, region **Singapore (ap-southeast-1)** (same region as Render).
2. **Database Access → Add new database user**: user `ancestors-tree-app`, a generated password, role **Read and write to any database**. Save the password in your password manager.
3. **Network Access → Add IP address → Allow access from anywhere (`0.0.0.0/0`)**. Render free services have no fixed outbound IP, so an allowlist is not possible; the long generated password is the protection.
4. **Connect → Drivers** and copy the `mongodb+srv://…` string. Replace `<db_password>` and insert the database name after the host:
   - local development (`apps/api/.env`): `mongodb+srv://ancestors-tree-app:<password>@<cluster-host>/ancestors-tree-dev?retryWrites=true&w=majority`
   - Render (`MONGODB_URI` in the dashboard): the same string with `/ancestors-tree` instead of `/ancestors-tree-dev`
5. If the password contains `@ : / ? # [ ] %`, percent-encode it (or generate one with letters and digits only).

Tests never use Atlas: they start an in-memory MongoDB (`mongodb-memory-server`, spec §15).

## 4. Cloudinary (photos)

1. Sign up at https://cloudinary.com (free plan). Optionally rename the cloud under **Settings → Product environment** to something readable, before the first upload (the cloud name is part of every photo URL).
2. **Settings → API Keys**: copy the **API environment variable** (`cloudinary://<api_key>:<api_secret>@<cloud_name>`).
3. Put it in `CLOUDINARY_URL`: in `apps/api/.env` locally and in the Render dashboard for production. Both environments share the cloud; `CLOUDINARY_FOLDER` keeps them apart (`ancestors-tree/dev` locally, `ancestors-tree/prod` on Render).
4. Do not create folders or upload presets by hand: the API signs every upload with its folder, formats and size limit (spec §12, image storage).

The API secret must never reach the browser or the repository. The web app only ever sees the cloud name and public photo IDs.

## Free-plan limits to keep in mind

- **Netlify credits:** 300 credits per month on the free plan; each production deploy costs 15 (about 20 production deploys per month). Deploy Previews and branch deploys cost 0. Merge to `main` in batches rather than many tiny PRs.
- **Proxy timeout vs. cold start:** Netlify proxy requests time out after 26 seconds, but a sleeping Render free service takes about a minute to wake up. The first request after a quiet period can therefore fail with a gateway error; retrying after a few seconds works (the server status widget has a retry button). The deploy sub-plan (P8) adds a proper wake-up screen; optionally, an external monitor (for example cron-job.org) calling `/api/health` every 14 minutes keeps the service awake within the 750 free instance hours per month.
- **Render free build minutes** are limited per month; build filters keep web-only commits from using them.

## Checklist after the first deploy

- [ ] `https://<render-url>/api/health` returns `status: ok`
- [ ] `netlify.toml` points `/api/*` at the actual Render URL
- [ ] `https://<project>.netlify.app` shows the Vietnamese server status message with version `0.1.0`
- [ ] `https://<project>.netlify.app/api/health` returns JSON (proxy works)
- [ ] Netlify branch deploys are limited to `main`; Render auto-deploy is "After CI checks pass"
- [ ] When P3/P6 start: `MONGODB_URI` and `CLOUDINARY_URL` are set in `apps/api/.env` and in the Render dashboard, and the API still starts (it rejects malformed values at startup without printing them)
