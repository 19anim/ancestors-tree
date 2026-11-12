# Contributing

## Requirements

- Node 24 (`.nvmrc`), pnpm 11 (`corepack enable` picks the version from `package.json`).

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev          # web on http://localhost:5173, API on http://localhost:3000
```

API reference: http://localhost:3000/api/docs

## Scripts

| Command                         | What it does                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                      | Run web and API in watch mode                                                                              |
| `pnpm test` / `pnpm test:watch` | Run all Vitest projects (shared, api, web)                                                                 |
| `pnpm test:coverage`            | Tests with coverage thresholds (shared ≥ 90%, overall ≥ 70%)                                               |
| `pnpm lint`                     | ESLint                                                                                                     |
| `pnpm format`                   | Prettier: rewrite all files in place                                                                       |
| `pnpm format:check`             | Prettier: report unformatted files without changing them                                                   |
| `pnpm typecheck`                | `tsc --noEmit` in every package                                                                            |
| `pnpm docs:errors`              | Regenerate `docs/error-codes.md` from `packages/shared/src/errors.ts`                                      |
| `pnpm docs:errors:check`        | Fail if `docs/error-codes.md` is out of date                                                               |
| `pnpm build`                    | Run every package's build: Vite bundle for web, type check for the API (Node runs its TypeScript directly) |
| `pnpm check`                    | Everything CI runs                                                                                         |

## Conventions

- **English only** in code, comments, docs and commits. User-facing text lives in `apps/web/src/locales/{vi,en}.json` (Vietnamese is the default).
- **Design docs are bilingual**: update `docs/superpowers/specs/*-design.md` and `*-design.vi.md` together.
- **API routes** are declared only with `api.define(...)` (see ADR 0003), except the infrastructure endpoints `GET /api/openapi.json` and `/api/docs`, which are mounted directly in `app.ts`. Errors are thrown as `AppError` with a code from `ERROR_CODES`.
- **Node-run code** (`apps/api`, `packages/shared`): relative imports end in `.ts`; no `enum`, `namespace` or parameter properties (see ADR 0002).
- **Web features** live in `apps/web/src/features/<feature>/` and expose a public API through `index.ts`; features do not import each other's internals.
- **TDD**: write the failing test first. Commits follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`).
