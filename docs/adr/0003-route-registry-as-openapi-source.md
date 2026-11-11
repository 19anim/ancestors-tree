# ADR 0003: Route registry as the single source of the OpenAPI document

- Status: Accepted
- Date: 2026-11-12

## Context

The spec requires 100% of API routes to appear in the generated API reference (success criterion S8). Inspecting Express's internal router stack to compare routes against the document is fragile across Express versions.

## Decision

Every API route is declared once with `api.define({ method, path, request, responses, handler })`. That single call validates params/query/body with Zod, optionally validates the response outside production, mounts the Express handler and registers the OpenAPI path. A test asserts that the generated document contains exactly the registered routes.

## Consequences

- Undocumented routes cannot exist as long as routes are not added with `router.get/post/...` directly (enforced in code review and CONTRIBUTING.md).
- Handlers return `{ status, body }` instead of writing to `res`, which also makes them easier to test.
- Exception: the infrastructure endpoints `GET /api/openapi.json` and `/api/docs` are mounted directly in `app.ts`. They serve the generated document itself and are intentionally not part of the documented API.
