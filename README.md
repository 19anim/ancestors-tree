# AncestorsTree

A collaborative family-tree (gia phả) platform for Vietnamese families: build and co-edit large genealogy trees, link trees across families, and get reminded of death anniversaries computed from the Vietnamese lunar calendar.

> 🚧 **Status:** design phase — implementation has not started yet.

## Highlights (planned)

- **Large, smooth trees** — 1,000–2,000 people at 60 fps (React Flow + custom layout in a Web Worker, level-of-detail rendering)
- **Edit history** — every change is an operation: undo/redo, full timeline, revert any past change
- **Lunar calendar** — Hồ Ngọc Đức algorithm for UTC+7, anniversary rules for leap months and 30th days
- **Reminders** — email + web push, idempotent daily job with catch-up
- **Linked trees** — hover a person to preview their family's tree, click to jump there
- **AI-assisted import** — bring your own AI chat; validated JSON with a diff preview
- **Installable PWA** — works offline (read-only) on Android and iOS

## Tech stack

pnpm monorepo · React 19 + TypeScript + Vite · TanStack Query · Zustand · React Flow · Tailwind + shadcn/ui · Express · MongoDB (Mongoose) · Zod · Vitest · Playwright

## Design docs

- [Design spec (English)](docs/superpowers/specs/2026-11-11-ancestors-tree-design.md)
- [Tài liệu thiết kế (Tiếng Việt)](docs/superpowers/specs/2026-11-11-ancestors-tree-design.vi.md)

## Repository layout (planned)

```
apps/web           React PWA        → Netlify
apps/api           Express API      → Render
apps/cron-worker   Cloudflare Worker (daily reminder trigger)
packages/shared    Zod schemas, applyOp, lunar calendar, error codes
docs/              Architecture, ADRs, user guide, specs
```

## License

[MIT](LICENSE) — free to use, modify and distribute, including commercially, as long as the copyright notice is kept.
