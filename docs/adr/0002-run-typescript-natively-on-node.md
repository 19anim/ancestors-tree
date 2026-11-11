# ADR 0002: Run the API's TypeScript natively on Node 24

- Status: Accepted
- Date: 2026-11-12

## Context

Node 24 strips TypeScript types natively. A separate compile step (tsc emit, tsup, esbuild) adds configuration and a `dist/` folder that can drift from the sources.

## Decision

`apps/api` and `packages/shared` run as `.ts` files directly (`node src/server.ts`, `node --watch` in development). TypeScript is used only for type checking (`tsc --noEmit`). `tsconfig.base.json` enables `erasableSyntaxOnly`, `verbatimModuleSyntax` and `allowImportingTsExtensions`.

## Consequences

- Relative imports must include the `.ts` extension.
- Only erasable syntax is allowed: no `enum`, `namespace` or constructor parameter properties (use `as const` objects and explicit fields instead).
- The workspace package resolves through a symlink to `packages/shared`, which is outside `node_modules`, so Node strips its types too (verified on Node 24.12).
- TypeScript stays on 6.0.x until typescript-eslint supports 7.x.
