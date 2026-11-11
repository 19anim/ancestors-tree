# ADR 0001: Monorepo with a shared package

- Status: Accepted
- Date: 2026-11-12

## Context

The web app and the API must agree on data shapes (Zod schemas), business rules (`applyOp`), the lunar calendar and error codes. Keeping them in separate repositories would force copying code or publishing an npm package on every change.

## Decision

Use one pnpm workspace with `apps/web`, `apps/api`, `apps/cron-worker` (planned; added in a later sub-plan, it does not exist yet) and `packages/shared`. The web and API apps import `@ancestors-tree/shared` directly from source. Each app is deployed separately (Netlify base directory `apps/web`, Render root directory `apps/api`).

## Consequences

- A change to a schema is one commit and one PR, and TypeScript reports mismatches on both sides immediately.
- CI runs for the whole repository; deploy hooks must be scoped to the folders each app depends on.
