# ADR 0003: Route registry as the single source of the OpenAPI document

- Status: Accepted
- Date: 2026-11-12

## Context

The spec requires 100% of API routes to appear in the generated API reference (success criterion S8). A document generated from the same registry it is compared with proves nothing on its own: a route added with `router.get(...)` or `app.get(...)` would be served but never documented. The check therefore has to look at the routes Express actually serves. Express does not expose a public API for listing routes, so that means reading its router stack, whose shape is an internal detail that may change between Express versions.

## Decision

Every API route is declared once with `api.define({ method, path, request, responses, handler })`. That single call validates params/query/body with Zod, optionally validates the response outside production, mounts the Express handler and registers the OpenAPI path.

`apps/api/src/openapi/openapi.test.ts` enforces this against the real Express app:

- the generated document contains exactly the routes in the registry (`api.routes`);
- the route layers on the API router's stack (`api.router.stack`) are exactly the routes in the registry, so nothing is mounted on the API router behind `api.define`'s back;
- the only route layer on the app's own router stack (`app.router.stack`) is the allow-listed `GET /api/openapi.json`, and the only nested router mounted on the app is the API router.

The test reads only a few layer fields (`route.path`, `route.methods`, `handle`) and checks their shape at runtime, so if Express changes its internals the test fails loudly instead of passing vacuously.

## Consequences

- An undocumented route makes the test suite fail, whether it is added with `router.get/post/...`, `app.get(...)` or a separately mounted router. Routes are still declared only via `api.define` (also stated in CONTRIBUTING.md).
- An Express upgrade that changes the router stack shape breaks the route-coverage test; the fix is to update the layer reading in the test, not to drop the check.
- Handlers return `{ status, body }` instead of writing to `res`, which also makes them easier to test.
- Exception: the infrastructure endpoints `GET /api/openapi.json` and `/api/docs` are mounted directly in `app.ts`. They serve the generated document itself and are intentionally not part of the documented API. `/api/docs` is mounted with `app.use` (middleware, not a route layer); `GET /api/openapi.json` is the one allow-listed route layer.
