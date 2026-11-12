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
3. Click **Apply**. No secret is needed yet (later sub-plans add `MONGODB_URI`, JWT secrets and similar; they are entered in the dashboard, never committed).
4. When the first deploy is live, copy the service URL from the service page (normally `https://ancestors-tree-api.onrender.com`).
   - If Render added a suffix because the name was taken (for example `https://ancestors-tree-api-x1y2.onrender.com`), replace the URL in the `/api/*` redirect of `netlify.toml` and commit.
5. Check it: open `<render-url>/api/health` → `{"status":"ok","version":"0.1.0",...}` and `<render-url>/api/docs`.

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
| Env vars          | `LOG_LEVEL=info`, `APP_VERSION=0.1.0`                                                      | `NODE_ENV=production` and `PORT` are set by Render automatically       |

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
