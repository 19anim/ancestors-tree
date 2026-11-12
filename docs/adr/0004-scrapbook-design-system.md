# 4. Scrapbook design system with hand-written Radix components

- Status: accepted
- Date: 2026-11-12

## Context

The first visual direction ("modern heritage": lacquer, dó paper, serif headings) felt too antique for the
people who will enter most of the data — younger family members — and did not leave room for birthday
reminders. Interactive prototypes of several directions were compared; a "family scrapbook" on grid paper
was chosen because every decoration can carry data (tape color = branch, thread = parent/child, stitch =
marriage, stamp = death anniversary, sticker = birthday) and because dragging photos is a natural way to fix
relationships (spec §7.6).

## Decision

- Colors are CSS custom properties in `apps/web/src/shared/ui/tokens.css` (light `:root`, dark
  `:root[data-theme="dark"]`), mapped into Tailwind v4 with `@theme inline`. Tailwind's default palette,
  fonts, radii and shadows are reset, so only tokens can be used. A unit test checks WCAG contrast for every
  text and line pair in both themes.
- Branch tape uses the Okabe–Ito colorblind-safe palette.
- Fonts are self-hosted with Fontsource (Be Vietnam Pro, Patrick Hand, JetBrains Mono); no third-party font
  requests, so the CSP can stay `font-src 'self'`.
- Base components follow shadcn/ui's source patterns (cva variants, `cn`, Radix primitives from `radix-ui`)
  but are written by hand. The shadcn CLI (4.23) was tried: with this repo's folder layout it generated
  `import { cn } from "cn"`, and every component would be restyled anyway, so the CLI adds a moving part
  without saving work.
- Scrapbook primitives (Polaroid with three levels of detail, DateMark, Thread, Stitch, Board) and their
  geometry are pure and presentational, so the tree canvas (P5–P7) can reuse them inside React Flow.

## Consequences

- New components are added by copying the shadcn/ui source for the Radix primitive and mapping it to tokens;
  `components.json` does not exist.
- Changing a color means editing one token and passing the contrast test; the `/design` gallery shows the
  result in both themes.
- A site-wide CSP with `style-src 'unsafe-inline'` is required by React style attributes and Radix
  positioning; scripts stay `'self'` only.
