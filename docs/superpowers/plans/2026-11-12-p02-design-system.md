# P2 Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the web app its "family scrapbook" identity. The result must include:
- design tokens with light and dark themes;
- self-hosted Vietnamese-ready fonts;
- base components (Button, TextField, Dialog);
- scrapbook primitives (Polaroid with three levels of detail, DateMark, Thread, Stitch, Board);
- a router-based app shell with a sample family tree on the home page;
- a `/design` gallery;
- a production CSP;
- Playwright screenshots with axe checks;
- an anti-slop review.

**Architecture:**
- **Tokens.** `apps/web/src/shared/ui/tokens.css` holds every color as a CSS custom property. It has a light `:root` block and a `:root[data-theme="dark"]` override block. Tailwind v4 maps these properties into utilities through `@theme inline`, after removing Tailwind's default palette, so components can only use tokens.
- **Theme.** A small theme module resolves the preference (`light` / `dark` / `system`) and writes `data-theme` on `<html>`.
- **Components.** Base components follow shadcn/ui source patterns on top of `radix-ui`, but are written by hand (no shadcn CLI, see ADR 0004).
- **Scrapbook primitives.** These are pure, presentational components plus pure geometry helpers. P5–P7 reuse them inside React Flow.
- **Routing.** React Router 8 (data router) renders an `AppShell`. The shell holds the skip link, primary navigation, theme switch, the page and the server-status footer.

**Tech Stack:** React 19, Vite 8, Tailwind CSS 4.3 (`@tailwindcss/vite`), radix-ui 1.8, class-variance-authority, clsx + tailwind-merge, lucide-react 1.72, React Router 8.5, Fontsource (Be Vietnam Pro, Patrick Hand, JetBrains Mono), Vitest 5 + Testing Library, Playwright 1.65 + @axe-core/playwright.

**Spec:** [`docs/superpowers/specs/2026-11-11-ancestors-tree-design.md`](../specs/2026-11-11-ancestors-tree-design.md) — §7.1, §7.4 (LOD), §7.8, §13.2, §13.3 (tokens, type, anti-slop checklist). Roadmap: [`2026-11-12-roadmap.md`](2026-11-12-roadmap.md) (P2 row and "Carry-over from the P1 review → P2").

## Global Constraints

**Repository and language**
- Node `>=24.0.0`, `"packageManager": "pnpm@11.17.0"`, TypeScript `~6.0.3` (do not upgrade).
- Everything in the repository is written in English (code, identifiers, comments, docs, commit messages).
- User-facing text lives only in `apps/web/src/locales/{vi,en}.json`. Vietnamese is the default, the keys are English, and both files must have identical keys (`locales.test.ts` enforces it). There are two exceptions:
  - The bootstrap failure screen (`BootFailure`) hard-codes a bilingual message, because i18n itself may be what failed.
  - Sample family data (names, years, dates in `features/home/sampleFamily.ts`) is content, not UI copy.
  - The Vietnamese meta description in `apps/web/index.html` is the pre-JavaScript fallback; `useDocumentLanguage` (Task 9) replaces it from `app.description` at runtime.

**Colors and styling**
- Colors come only from tokens.
- Tailwind's default palette is removed, so `bg-red-500` and similar classes do not exist.
- Raw hex values are allowed only in `tokens.css`.
- Washi tape colors are used through `var(--tape-*)`, via `tapeColor()`.

**Typography and icons**
- Only three font families: `font-ui` (Be Vietnam Pro, the default), `font-hand` (Patrick Hand, only for captions on photos and handwritten notes) and `font-mono` (JetBrains Mono, for dates, stamps and numbers).
- Icons only from `lucide-react`, always with `strokeWidth={1.75}` and `aria-hidden="true"` (the accessible name comes from the control).
- No emoji anywhere in the UI.

**Motion and accessibility**
- Durations use `--duration-fast|base|settle` and easing uses `ease-settle`.
- `prefers-reduced-motion: reduce` disables animations and transitions globally (`styles/index.css`).
- Every interactive element is reachable by keyboard and has a visible `:focus-visible` outline in `accent`.
- Text contrast is at least 4.5:1, and borders and lines are at least 3:1. `tokens.test.ts` enforces this for every token pair.

**Imports and component structure**
- Web imports are relative and have no file extension (bundler resolution), as in P1.
- Features import shared UI only through `src/shared/ui/index.ts`.
- Features import other features only through their `index.ts`.

**Tests and commits**
- Component tests use `const user = userEvent.setup()`, never the bare `userEvent` API (carry-over item).
- Tests that need i18n, React Query or the theme use `renderWithProviders`. Pure presentational tests may use `render`.
- Design docs are bilingual: any change to the spec updates both `*-design.md` and `*-design.vi.md` in the same commit. The spec changes for P2 were already committed together with this plan.
- Commit messages follow Conventional Commits and end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run `pnpm format` before every commit. `pnpm check` must be green at the end of every task.

## File Map

```
apps/web/
├─ index.html                         color-scheme meta, Vietnamese meta description
├─ package.json                       new deps, split typecheck
├─ tsconfig.json                      browser code (src) only — no node types
├─ tsconfig.node.json                 vite.config.ts + vitest.config.ts (node types)
├─ vite.config.ts                     + @tailwindcss/vite
└─ src/
   ├─ main.tsx                        fonts + CSS, theme before first paint, error boundary
   ├─ styles/
   │  ├─ fonts.ts                     Fontsource imports
   │  └─ index.css                    tailwind import, tokens, base layer, utilities, reduced motion
   ├─ app/
   │  ├─ App.tsx                      RouterProvider (browser router)
   │  ├─ routes.tsx                   route table shared by the app and tests
   │  ├─ AppShell.tsx                 skip link, header, nav, theme switch, main, footer
   │  ├─ AppErrorBoundary.tsx         AppErrorBoundary + BootFailure
   │  ├─ RouteError.tsx               router errorElement
   │  ├─ NotFoundPage.tsx
   │  └─ providers.tsx                + ThemeProvider
   ├─ features/
   │  ├─ system/ServerStatus.tsx      restyled; persistent live region; retry progress
   │  ├─ home/                        HomePage, SampleFamilyBoard, sampleFamily, index
   │  └─ design-gallery/              DesignGalleryPage, index
   ├─ shared/
   │  ├─ lib/cn.ts                    clsx + tailwind-merge
   │  ├─ i18n/useDocumentLanguage.ts  <html lang> + meta description
   │  └─ ui/
   │     ├─ index.ts                  public API of the design system
   │     ├─ tokens.css / tokens.test.ts / contrast.ts
   │     ├─ Button.tsx / TextField.tsx / Dialog.tsx
   │     ├─ theme/                    theme.ts, ThemeProvider.tsx, ThemeToggle.tsx
   │     ├─ motion/useReducedMotion.ts
   │     └─ scrapbook/                tilt.ts, tape.ts, initials.ts, threads.ts,
   │                                  Polaroid.tsx, DateMark.tsx, Thread.tsx, Stitch.tsx, Board.tsx
   └─ test/render.tsx / setup.ts      + renderRoute, theme cleanup
e2e/                                  Playwright specs + tsconfig
playwright.config.ts
netlify.toml                          + Content-Security-Policy
.github/workflows/ci.yml              + e2e job
docs/design-system.md, docs/adr/0004-scrapbook-design-system.md, docs/design/screenshots/
```

---

### Task 1: Dependencies, Tailwind and a tsconfig split

**Files:**
- Modify: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.node.json`, `apps/web/src/shared/lib/cn.ts`
- Test: `apps/web/src/shared/lib/cn.test.ts`

**Interfaces:**
- Consumes: the P1 web app.
- Produces: `cn(...inputs: ClassValue[]): string` from `src/shared/lib/cn.ts`. Tailwind is active in Vite. `pnpm --filter @ancestors-tree/web typecheck` checks the browser code without `node` types.

- [ ] **Step 1: Switch to the feature branch**

The branch `feat/p2-design-system` was created together with this plan.

```bash
git switch feat/p2-design-system || (git switch main && git pull && git switch -c feat/p2-design-system)
```

- [ ] **Step 2: Install the dependencies**

```bash
pnpm --filter @ancestors-tree/web add radix-ui@^1.8.1 class-variance-authority@^0.7.1 clsx@^2.1.1 tailwind-merge@^3.7.0 lucide-react@^1.72.0 react-router@^8.5.1 @fontsource/be-vietnam-pro@^5.3.0 @fontsource/patrick-hand@^5.3.0 @fontsource/jetbrains-mono@^5.3.0
pnpm --filter @ancestors-tree/web add -D tailwindcss@^4.3.5 @tailwindcss/vite@^4.3.5
```

Expected: both commands finish without peer-dependency errors.

- [ ] **Step 3: Write the failing test for `cn`**

`apps/web/src/shared/lib/cn.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins class names and skips falsy values', () => {
    const hidden = false;
    expect(cn('flex', hidden && 'hidden', undefined, null, 'gap-2')).toBe('flex gap-2');
  });

  it('lets later Tailwind classes win over conflicting earlier ones', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `pnpm vitest run --project web src/shared/lib/cn.test.ts`
Expected: FAIL. `Failed to resolve import "./cn"`.

- [ ] **Step 5: Implement `cn`**

`apps/web/src/shared/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and resolves Tailwind conflicts (the last class wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Run the test again**

Run: `pnpm vitest run --project web src/shared/lib/cn.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Split the tsconfig so `node` types stay out of browser code**

Replace `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2024", "dom", "dom.iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

Create `apps/web/tsconfig.node.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["node"]
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

In `apps/web/package.json` replace the `typecheck` script:

```json
"typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json"
```

- [ ] **Step 8: Prove that `node` types no longer leak into `src`**

Temporarily add this line at the end of `apps/web/src/shared/lib/cn.ts`:

```ts
export const leak = process.env.NODE_ENV;
```

Run: `pnpm --filter @ancestors-tree/web typecheck`
Expected: FAIL. The output contains `Cannot find name 'process'`.

Remove the line again, then run: `pnpm --filter @ancestors-tree/web typecheck`
Expected: PASS.

- [ ] **Step 9: Enable Tailwind in Vite**

`apps/web/vite.config.ts`:

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Same-origin /api in development, mirroring the Netlify proxy used in production.
      '/api': { target: 'http://localhost:3000' },
    },
  },
});
```

- [ ] **Step 10: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: every step passes. The build still produces `apps/web/dist`.

```bash
git add apps/web pnpm-lock.yaml
git commit -m "chore(web): add design-system dependencies, Tailwind and a browser-only tsconfig

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Design tokens, contrast check, global styles and fonts

**Files:**
- Create: `apps/web/src/shared/ui/contrast.ts`, `apps/web/src/shared/ui/tokens.css`, `apps/web/src/styles/index.css`, `apps/web/src/styles/fonts.ts`
- Modify: `apps/web/src/main.tsx`, `apps/web/index.html`, `vitest.config.ts` (root), `apps/web/vitest.config.ts` (`test.css.include: [/\.css\?raw$/]`, because Vitest stubs CSS imports, `?raw` included, unless they are included)
- Test: `apps/web/src/shared/ui/contrast.test.ts`, `apps/web/src/shared/ui/tokens.test.ts`

**Interfaces:**
- Consumes: Tailwind (Task 1).
- Produces:
  - `contrastRatio(a: string, b: string): number` and `relativeLuminance(hex: string): number` (hex `#rrggbb` only).
  - CSS variables:
    - themed colors: `--paper`, `--paper-grid`, `--surface`, `--ink`, `--ink-muted`, `--line`, `--line-strong`, `--stamp`, `--on-stamp`, `--accent`, `--on-accent`, `--success`, `--photo`, `--thread`, `--pin`;
    - theme-invariant colors: `--photo-ink`, `--photo-muted`, `--photo-stamp`, `--sticker`, `--on-sticker`, `--scrim`, `--tape-progenitor`, `--tape-1` … `--tape-6`, `--tape-in-law`, `--tape-loose`;
    - motion: `--duration-fast`, `--duration-base`, `--duration-settle`.
  - Tailwind utilities:
    - one per color token: `bg-paper`, `text-ink`, `border-line-strong`, `stroke-thread`, `fill-pin`, …;
    - fonts: `font-ui`, `font-hand`, `font-mono`;
    - radius: `rounded-photo`, `rounded-control`, `rounded-pill`;
    - shadow: `shadow-lift`;
    - easing: `ease-settle`;
    - custom utilities: `board-grid`, `animate-overlay-in`, `animate-dialog-in`.

- [ ] **Step 1: Write the failing contrast tests**

`apps/web/src/shared/ui/contrast.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
  });

  it('rejects anything that is not #rrggbb', () => {
    expect(() => relativeLuminance('#fff')).toThrow('#rrggbb');
    expect(() => relativeLuminance('red')).toThrow('#rrggbb');
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#2b59ff', '#2b59ff')).toBe(1);
  });

  it('does not depend on argument order', () => {
    expect(contrastRatio('#2b59ff', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#2b59ff'), 10);
  });

  it('matches a known value', () => {
    expect(contrastRatio('#2B59FF', '#FFFFFF')).toBeCloseTo(5.28, 2);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run --project web src/shared/ui/contrast.test.ts`
Expected: FAIL. `Failed to resolve import "./contrast"`.

- [ ] **Step 3: Implement the contrast helpers**

`apps/web/src/shared/ui/contrast.ts`:

```ts
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a #rrggbb color. */
export function relativeLuminance(hex: string): number {
  if (!HEX_COLOR.test(hex)) {
    throw new Error(`Expected a #rrggbb color, got "${hex}"`);
  }
  const r = linearChannel(Number.parseInt(hex.slice(1, 3), 16));
  const g = linearChannel(Number.parseInt(hex.slice(3, 5), 16));
  const b = linearChannel(Number.parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two #rrggbb colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}
```

Run: `pnpm vitest run --project web src/shared/ui/contrast.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 4: Write the failing token test**

`apps/web/src/shared/ui/tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import tokensCss from './tokens.css?raw';

function declarations(selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(tokensCss)?.[1];
  if (block === undefined) throw new Error(`Block "${selector}" not found in tokens.css`);
  const result = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (name && value) result.set(name, value.trim().toLowerCase());
  }
  return result;
}

const light = declarations(':root');
const darkOverrides = declarations(":root[data-theme='dark']");
const dark = new Map([...light, ...darkOverrides]);

const THEMED = [
  '--paper',
  '--paper-grid',
  '--surface',
  '--ink',
  '--ink-muted',
  '--line',
  '--line-strong',
  '--stamp',
  '--on-stamp',
  '--accent',
  '--on-accent',
  '--success',
  '--photo',
  '--thread',
  '--pin',
];

const TAPES = [
  '--tape-progenitor',
  '--tape-1',
  '--tape-2',
  '--tape-3',
  '--tape-4',
  '--tape-5',
  '--tape-6',
  '--tape-in-law',
  '--tape-loose',
];

/** Text (or icon) on background: WCAG AA 4.5:1. */
const TEXT_PAIRS: Array<[string, string]> = [
  ['--ink', '--paper'],
  ['--ink', '--surface'],
  ['--ink-muted', '--paper'],
  ['--ink-muted', '--surface'],
  ['--stamp', '--paper'],
  ['--stamp', '--surface'],
  ['--accent', '--paper'],
  ['--accent', '--surface'],
  ['--paper', '--ink'],
  ['--on-accent', '--accent'],
  ['--on-stamp', '--stamp'],
  ['--on-sticker', '--sticker'],
  ['--photo-ink', '--photo'],
  ['--photo-muted', '--photo'],
  ['--photo-stamp', '--photo'],
];

/** Borders, lines, focus rings and status dots: WCAG 1.4.11 3:1. */
const NON_TEXT_PAIRS: Array<[string, string]> = [
  ['--line-strong', '--paper'],
  ['--line-strong', '--surface'],
  ['--success', '--paper'],
  ['--thread', '--paper'],
  ['--pin', '--paper'],
];

describe('design tokens', () => {
  it('redefines exactly the themed tokens in the dark theme', () => {
    expect([...darkOverrides.keys()].sort()).toEqual([...THEMED].sort());
  });

  it('uses #rrggbb values for every color token', () => {
    for (const [name, value] of [...light, ...darkOverrides]) {
      if (name.startsWith('--duration-')) continue;
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('defines the washi tape palette', () => {
    for (const name of TAPES) expect(light.has(name), name).toBe(true);
  });

  it('maps every Tailwind color to a defined token', () => {
    const theme = declarations('@theme inline');
    expect(theme.size).toBeGreaterThan(0);
    for (const [name, value] of theme) {
      const reference = /^var\((--[\w-]+)\)$/.exec(value)?.[1] ?? '';
      expect(light.has(reference), `${name}: ${value}`).toBe(true);
    }
  });

  for (const [themeName, tokens] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it(`meets 4.5:1 text contrast in the ${themeName} theme`, () => {
      for (const [foreground, background] of TEXT_PAIRS) {
        const ratio = contrastRatio(tokens.get(foreground) ?? '', tokens.get(background) ?? '');
        expect(ratio, `${foreground} on ${background} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`meets 3:1 non-text contrast in the ${themeName} theme`, () => {
      for (const [foreground, background] of NON_TEXT_PAIRS) {
        const ratio = contrastRatio(tokens.get(foreground) ?? '', tokens.get(background) ?? '');
        expect(ratio, `${foreground} on ${background} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
```

Run: `pnpm vitest run --project web src/shared/ui/tokens.test.ts`
Expected: FAIL. `Failed to resolve import "./tokens.css?raw"`.

- [ ] **Step 5: Create the tokens**

`apps/web/src/shared/ui/tokens.css`:

```css
/*
 * Design tokens for the "family scrapbook" direction (spec §13.3).
 * Light = grid paper by day, dark = desk at night. Polaroid paper stays light in both themes.
 *
 * Rules:
 * - Every color is a 6-digit hex value so tokens.test.ts can check WCAG contrast.
 * - Themed tokens are redefined in the dark block; theme-invariant tokens (photo inks,
 *   sticker, scrim, tape) are defined once in :root.
 * - Components never use raw hex values. They use Tailwind utilities generated from the
 *   @theme blocks below (bg-paper, text-ink, …) or var(--tape-*) for washi tape.
 * - Adding a color: define it here (and in the dark block if themed), map it in
 *   @theme inline, add its contrast pairs to tokens.test.ts and list it in the /design gallery.
 */
:root {
  color-scheme: light;

  /* Themed */
  --paper: #fafaf8;
  --paper-grid: #ecece7;
  --surface: #ffffff;
  --ink: #1a1a1a;
  --ink-muted: #5b5f66;
  --line: #e2e2dc;
  --line-strong: #8a8f98;
  --stamp: #d7263d;
  --on-stamp: #ffffff;
  --accent: #2b59ff;
  --on-accent: #ffffff;
  --success: #12805c;
  --photo: #ffffff;
  --thread: #5b5f66;
  --pin: #d7263d;

  /* Theme-invariant */
  --photo-ink: #1a1a1a;
  --photo-muted: #5b5f66;
  --photo-stamp: #b8202f;
  --sticker: #ffd23f;
  --on-sticker: #1a1a1a;
  --scrim: #000000;

  /* Washi tape: progenitor, Okabe–Ito branch palette, in-law, loose */
  --tape-progenitor: #d55e00;
  --tape-1: #e69f00;
  --tape-2: #56b4e9;
  --tape-3: #009e73;
  --tape-4: #f0e442;
  --tape-5: #0072b2;
  --tape-6: #cc79a7;
  --tape-in-law: #b8bcc4;
  --tape-loose: #c9c9c2;

  /* Motion */
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-settle: 380ms;
}

:root[data-theme='dark'] {
  color-scheme: dark;

  --paper: #14161c;
  --paper-grid: #1e2129;
  --surface: #1c1f27;
  --ink: #eceae4;
  --ink-muted: #a4a9b3;
  --line: #2c303a;
  --line-strong: #737882;
  --stamp: #ff5a6e;
  --on-stamp: #14161c;
  --accent: #7c9cff;
  --on-accent: #14161c;
  --success: #3ccb91;
  --photo: #e9e6dd;
  --thread: #a4a9b3;
  --pin: #ff5a6e;
}

/* Before main.tsx sets data-theme, follow the OS so dark-mode users do not see a white flash. */
@media (prefers-color-scheme: dark) {
  html:not([data-theme]) {
    background-color: #14161c;
  }
}

@theme {
  --color-*: initial;
  --font-*: initial;
  --radius-*: initial;
  --shadow-*: initial;

  --font-ui: "Be Vietnam Pro", system-ui, sans-serif;
  --font-hand: "Patrick Hand", "Be Vietnam Pro", cursive;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --default-font-family: var(--font-ui);
  --default-mono-font-family: var(--font-mono);

  --radius-photo: 2px;
  --radius-control: 0.5rem;
  --radius-pill: 999px;

  --shadow-lift: 0 10px 22px rgb(0 0 0 / 0.13);

  --ease-settle: cubic-bezier(0.2, 0.8, 0.2, 1);
}

@theme inline {
  --color-paper: var(--paper);
  --color-paper-grid: var(--paper-grid);
  --color-surface: var(--surface);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-stamp: var(--stamp);
  --color-on-stamp: var(--on-stamp);
  --color-accent: var(--accent);
  --color-on-accent: var(--on-accent);
  --color-success: var(--success);
  --color-photo: var(--photo);
  --color-photo-ink: var(--photo-ink);
  --color-photo-muted: var(--photo-muted);
  --color-photo-stamp: var(--photo-stamp);
  --color-sticker: var(--sticker);
  --color-on-sticker: var(--on-sticker);
  --color-scrim: var(--scrim);
  --color-thread: var(--thread);
  --color-pin: var(--pin);
}
```

Run: `pnpm vitest run --project web src/shared/ui/tokens.test.ts`
Expected: PASS (8 tests). If a contrast test fails, the message names the pair and its ratio. Fix the token value. Never lower the threshold.

- [ ] **Step 6: Create the global stylesheet**

`apps/web/src/styles/index.css`:

```css
@import "tailwindcss";
@import "../shared/ui/tokens.css";

@layer base {
  html {
    background-color: var(--paper);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }

  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  h1,
  h2,
  h3 {
    letter-spacing: -0.02em;
    text-wrap: balance;
  }
}

/* The scrapbook board: grid paper with 22 px squares. */
@utility board-grid {
  background-color: var(--paper);
  background-image:
    linear-gradient(var(--paper-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--paper-grid) 1px, transparent 1px);
  background-size: 22px 22px;
}

@keyframes overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Animates `scale` (not `transform`) so it never fights Tailwind's translate utilities. */
@keyframes dialog-in {
  from {
    opacity: 0;
    scale: 0.98;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}

@utility animate-overlay-in {
  animation: overlay-in var(--duration-base) ease-out;
}

@utility animate-dialog-in {
  animation: dialog-in var(--duration-base) var(--ease-settle);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 7: Self-host the fonts**

`apps/web/src/styles/fonts.ts`:

```ts
// Self-hosted fonts. Each file declares latin, latin-ext and vietnamese faces with
// unicode-range, so the browser downloads only the subsets a page actually uses.
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/patrick-hand/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
```

Add these two lines at the top of `apps/web/src/main.tsx`, before the other imports:

```tsx
import './styles/fonts';
import './styles/index.css';
```

- [ ] **Step 8: Update `index.html`**

Replace `apps/web/index.html`:

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta
      name="description"
      content="AncestorsTree — cùng con cháu dựng cây gia phả, không quên ngày giỗ."
    />
    <title>AncestorsTree</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Exclude the import-only style files from coverage**

In the root `vitest.config.ts`, add `'apps/web/src/styles/**'` to `coverage.exclude`:

```ts
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        '**/src/test/**',
        'apps/api/src/server.ts',
        'apps/web/src/main.tsx',
        'apps/web/src/styles/**',
      ],
```

- [ ] **Step 10: Verify the build emits the tokens and fonts**

Run: `pnpm --filter @ancestors-tree/web build`
Expected: PASS.

Run: `grep -l -- "--paper:#fafaf8" apps/web/dist/assets/*.css && ls apps/web/dist/assets | grep -c woff2`
Expected: one CSS file is listed, and the count is greater than 0.

- [ ] **Step 11: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/web vitest.config.ts
git commit -m "feat(web): add scrapbook design tokens, global styles and self-hosted fonts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Theme preference, theme switch and reduced-motion hook

**Files:**
- Create:
  - theme module: `apps/web/src/shared/ui/theme/theme.ts`, `apps/web/src/shared/ui/theme/ThemeProvider.tsx`, `apps/web/src/shared/ui/theme/ThemeToggle.tsx`;
  - motion hook: `apps/web/src/shared/ui/motion/useReducedMotion.ts`;
  - barrel: `apps/web/src/shared/ui/index.ts`.
- Modify: `apps/web/src/app/providers.tsx`, `apps/web/src/main.tsx`, `apps/web/src/test/setup.ts`, `apps/web/src/locales/vi.json`, `apps/web/src/locales/en.json`
- Test: `apps/web/src/shared/ui/theme/theme.test.ts`, `apps/web/src/shared/ui/theme/ThemeToggle.test.tsx`, `apps/web/src/shared/ui/motion/useReducedMotion.test.ts`

**Interfaces:**
- Consumes: `[data-theme="dark"]` token block (Task 2).
- Produces (all exported from `src/shared/ui/index.ts`):
  - types `ThemePreference = 'light' | 'dark' | 'system'` and `ResolvedTheme = 'light' | 'dark'`;
  - `THEME_STORAGE_KEY = 'ancestors-tree:theme'`;
  - storage helpers: `getLocalStorage(): Storage | undefined`, `readThemePreference(storage: Pick<Storage, 'getItem'> | undefined): ThemePreference`, `writeThemePreference(storage: Pick<Storage, 'setItem'> | undefined, preference: ThemePreference): void`;
  - resolution helpers: `resolveTheme(preference, systemPrefersDark: boolean): ResolvedTheme`, `systemPrefersDark(): boolean`, `applyTheme(theme: ResolvedTheme, root?: HTMLElement): void` (writes `data-theme`);
  - React API: `ThemeProvider`, `useTheme(): { preference, resolved, setPreference }`, `ThemeToggle`, `useReducedMotion(): boolean`.

- [ ] **Step 1: Write the failing tests for the pure theme functions**

`apps/web/src/shared/ui/theme/theme.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
  THEME_STORAGE_KEY,
  writeThemePreference,
} from './theme';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readThemePreference', () => {
  it('returns a stored preference', () => {
    expect(readThemePreference({ getItem: () => 'dark' })).toBe('dark');
  });

  it('falls back to system for missing or unknown values', () => {
    expect(readThemePreference({ getItem: () => null })).toBe('system');
    expect(readThemePreference({ getItem: () => 'purple' })).toBe('system');
    expect(readThemePreference(undefined)).toBe('system');
  });

  it('falls back to system when storage throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('denied');
      },
    };
    expect(readThemePreference(storage)).toBe('system');
  });
});

describe('writeThemePreference', () => {
  it('stores the preference under the theme key', () => {
    const setItem = vi.fn();
    writeThemePreference({ setItem }, 'light');
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');
  });

  it('ignores storage errors', () => {
    const storage = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => writeThemePreference(storage, 'dark')).not.toThrow();
  });
});

describe('resolveTheme', () => {
  it('follows the operating system only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('applyTheme', () => {
  it('writes data-theme on the given root', () => {
    const root = document.createElement('html');
    applyTheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
  });
});

describe('systemPrefersDark', () => {
  it('is false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(systemPrefersDark()).toBe(false);
  });

  it('reads the prefers-color-scheme media query', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', matchMedia);
    expect(systemPrefersDark()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
  });
});
```

Run: `pnpm vitest run --project web src/shared/ui/theme/theme.test.ts`
Expected: FAIL. `Failed to resolve import "./theme"`.

- [ ] **Step 2: Implement the theme functions**

`apps/web/src/shared/ui/theme/theme.ts`:

```ts
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'ancestors-tree:theme';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const PREFERENCES: readonly string[] = ['light', 'dark', 'system'];

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && PREFERENCES.includes(value);
}

/** localStorage, or undefined when the browser blocks it (private mode, disabled cookies). */
export function getLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readThemePreference(storage: Pick<Storage, 'getItem'> | undefined): ThemePreference {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePreference(
  storage: Pick<Storage, 'setItem'> | undefined,
  preference: ThemePreference,
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be full or blocked; the preference then lasts for this page only.
  }
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_SCHEME_QUERY).matches;
}

/** Selects the token block: tokens.css switches colors and color-scheme on data-theme. */
export function applyTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme;
}
```

Run: `pnpm vitest run --project web src/shared/ui/theme/theme.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 3: Write the failing reduced-motion test**

`apps/web/src/shared/ui/motion/useReducedMotion.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './useReducedMotion';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useReducedMotion', () => {
  it('is false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('follows the media query and its changes', () => {
    let notify: () => void = () => undefined;
    const query = {
      matches: true,
      addEventListener: vi.fn((_event: string, listener: () => void) => {
        notify = listener;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query),
    );

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);

    act(() => {
      query.matches = false;
      notify();
    });
    expect(result.current).toBe(false);
  });
});
```

Run: `pnpm vitest run --project web src/shared/ui/motion/useReducedMotion.test.ts`
Expected: FAIL. `Failed to resolve import "./useReducedMotion"`.

- [ ] **Step 4: Implement `useReducedMotion`**

`apps/web/src/shared/ui/motion/useReducedMotion.ts`:

```ts
import { useSyncExternalStore } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * True when the user asked the OS to reduce motion. CSS already disables animations
 * globally; use this hook for motion driven by JavaScript (fly-to, drag settle).
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
```

Run: `pnpm vitest run --project web src/shared/ui/motion/useReducedMotion.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the theme strings**

In `apps/web/src/locales/vi.json`, add this top-level object after `"app"`:

```json
  "theme": {
    "legend": "Giao diện",
    "light": "Sáng",
    "dark": "Tối",
    "system": "Theo máy"
  },
```

In `apps/web/src/locales/en.json`, add it at the same position:

```json
  "theme": {
    "legend": "Appearance",
    "light": "Light",
    "dark": "Dark",
    "system": "Match device"
  },
```

- [ ] **Step 6: Write the failing theme-switch test**

`apps/web/src/shared/ui/theme/ThemeToggle.test.tsx`:

```tsx
import { renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { THEME_STORAGE_KEY } from './theme';
import { useTheme } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ThemeToggle', () => {
  it('groups the three options under a labelled fieldset', () => {
    renderWithProviders(<ThemeToggle />);
    expect(screen.getByRole('group', { name: 'Giao diện' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('starts on "match device" and switches to dark', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'Theo máy' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Tối' }));

    expect(screen.getByRole('radio', { name: 'Tối' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('restores a stored preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderWithProviders(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'Sáng' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('follows the operating system in "match device" mode', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    renderWithProviders(<ThemeToggle />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('useTheme', () => {
  it('fails loudly outside ThemeProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useTheme())).toThrow('useTheme must be used inside ThemeProvider');
  });
});
```

- [ ] **Step 7: Clean up the theme between tests**

Replace `apps/web/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { i18nReady } from '../shared/i18n';

await i18nReady;

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
```

Run: `pnpm vitest run --project web src/shared/ui/theme/ThemeToggle.test.tsx`
Expected: FAIL. `Failed to resolve import "./ThemeProvider"`.

- [ ] **Step 8: Implement the provider**

`apps/web/src/shared/ui/theme/ThemeProvider.tsx`:

```tsx
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyTheme,
  DARK_SCHEME_QUERY,
  getLocalStorage,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState(() => readThemePreference(getLocalStorage()));
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(DARK_SCHEME_QUERY);
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeThemePreference(getLocalStorage(), next);
    setPreferenceState(next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
```

- [ ] **Step 9: Implement the switch**

`apps/web/src/shared/ui/theme/ThemeToggle.tsx`:

```tsx
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemePreference } from './theme';
import { useTheme } from './ThemeProvider';

const OPTIONS = [
  { value: 'light', Icon: Sun, labelKey: 'theme.light' },
  { value: 'dark', Icon: Moon, labelKey: 'theme.dark' },
  { value: 'system', Icon: Monitor, labelKey: 'theme.system' },
] as const satisfies ReadonlyArray<{ value: ThemePreference; Icon: LucideIcon; labelKey: string }>;

/** Three native radios (free keyboard support) styled as a compact segmented control. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  const name = useId();

  return (
    <fieldset className="flex items-center gap-0.5 rounded-pill border border-line p-0.5">
      <legend className="sr-only">{t('theme.legend')}</legend>
      {OPTIONS.map(({ value, Icon, labelKey }) => (
        <label
          key={value}
          title={t(labelKey)}
          className="grid size-8 cursor-pointer place-items-center rounded-full text-ink-muted transition-colors duration-(--duration-fast) ease-settle hover:text-ink has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
        >
          <input
            type="radio"
            name={name}
            value={value}
            checked={preference === value}
            onChange={() => setPreference(value)}
            className="sr-only"
          />
          <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
          <span className="sr-only">{t(labelKey)}</span>
        </label>
      ))}
    </fieldset>
  );
}
```

- [ ] **Step 10: Create the design-system barrel**

`apps/web/src/shared/ui/index.ts`:

```ts
export { useReducedMotion } from './motion/useReducedMotion';
export {
  applyTheme,
  getLocalStorage,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
  THEME_STORAGE_KEY,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from './theme/theme';
export { ThemeProvider, useTheme } from './theme/ThemeProvider';
export { ThemeToggle } from './theme/ThemeToggle';
```

- [ ] **Step 11: Provide the theme to the whole app**

`apps/web/src/app/providers.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ThemeProvider } from '../shared/ui';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
    },
  });
}

interface AppProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

export function AppProviders({ children, queryClient }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
```

In `apps/web/src/main.tsx`, apply the theme before the first render so the page never flashes the wrong theme. Add this import:

```tsx
import { applyTheme, getLocalStorage, readThemePreference, resolveTheme, systemPrefersDark } from './shared/ui';
```

and this statement directly after the imports:

```tsx
applyTheme(resolveTheme(readThemePreference(getLocalStorage()), systemPrefersDark()));
```

- [ ] **Step 12: Run the tests and the full check, then commit**

Run: `pnpm vitest run --project web src/shared/ui`
Expected: PASS.

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/web
git commit -m "feat(web): add light/dark/system theme with a persistent switch and reduced-motion hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Base components — Button, TextField, Dialog

**Files:**
- Create: `apps/web/src/shared/ui/Button.tsx`, `apps/web/src/shared/ui/TextField.tsx`, `apps/web/src/shared/ui/Dialog.tsx`
- Modify: `apps/web/src/shared/ui/index.ts`, `apps/web/src/locales/vi.json`, `apps/web/src/locales/en.json`
- Test: `apps/web/src/shared/ui/Button.test.tsx`, `apps/web/src/shared/ui/TextField.test.tsx`, `apps/web/src/shared/ui/Dialog.test.tsx`

**Interfaces:**
- Consumes: `cn` (Task 1), token utilities (Task 2).
- Produces (exported from `src/shared/ui/index.ts`):
  - `Button` with props `ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'icon'; asChild?: boolean }`, plus `buttonVariants`. The default `type` is `"button"`. The rendered element carries `data-variant` and `data-size`.
  - `TextField` with props `ComponentProps<'input'> & { label: string; hint?: string; error?: string }`. The label is linked to the input. Hint and error are linked through `aria-describedby`. `aria-invalid` is set when there is an error. `ref` is forwarded.
  - Dialog parts: `Dialog` (Root), `DialogTrigger`, `DialogClose`, `DialogContent` with props `{ title: string; description?: string; children; className? }`. `DialogContent` renders a portal, an overlay, the title, the optional description, the children and a close button labelled `common.close`.

- [ ] **Step 1: Write the failing Button test**

`apps/web/src/shared/ui/Button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders a non-submitting primary button by default', () => {
    render(<Button>Lưu thay đổi</Button>);
    const button = screen.getByRole('button', { name: 'Lưu thay đổi' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-size', 'md');
  });

  it('applies the requested variant and size', () => {
    render(
      <Button variant="danger" size="sm">
        Xoá
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Xoá' });
    expect(button).toHaveAttribute('data-variant', 'danger');
    expect(button.className).toContain('bg-stamp');
    expect(button.className).toContain('h-8');
  });

  it('lets custom classes override variant classes', () => {
    render(<Button className="h-12">Tiếp</Button>);
    const button = screen.getByRole('button', { name: 'Tiếp' });
    expect(button.className).toContain('h-12');
    expect(button.className).not.toContain('h-10');
  });

  it('styles its child element with asChild', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/design">Bộ thiết kế</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Bộ thiết kế' });
    expect(link).toHaveAttribute('href', '/design');
    expect(link).not.toHaveAttribute('type');
    expect(link.className).toContain('border-line-strong');
  });

  it('calls onClick unless disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Đi</Button>);
    await user.click(screen.getByRole('button', { name: 'Đi' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        Đi
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Đi' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

Run: `pnpm vitest run --project web src/shared/ui/Button.test.tsx`
Expected: FAIL. `Failed to resolve import "./Button"`.

- [ ] **Step 2: Implement Button**

`apps/web/src/shared/ui/Button.tsx`:

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition-colors duration-(--duration-fast) ease-settle disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-paper hover:bg-ink/85',
        secondary: 'border border-line-strong bg-surface text-ink hover:bg-paper-grid',
        ghost: 'text-ink hover:bg-paper-grid',
        danger: 'bg-stamp text-on-stamp hover:bg-stamp/85',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the single child (for example a link) with button styles instead of a <button>. */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: ButtonProps) {
  const resolvedVariant = variant ?? 'primary';
  const resolvedSize = size ?? 'md';
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant: resolvedVariant, size: resolvedSize }), className)}
      {...props}
    />
  );
}
```

Run: `pnpm vitest run --project web src/shared/ui/Button.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 3: Write the failing TextField test**

`apps/web/src/shared/ui/TextField.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { TextField } from './TextField';

describe('TextField', () => {
  it('labels the input and links the hint', () => {
    render(<TextField label="Họ và tên" hint="Viết đầy đủ, có dấu." />);
    const input = screen.getByRole('textbox', { name: 'Họ và tên' });
    expect(input).toHaveAccessibleDescription('Viết đầy đủ, có dấu.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('marks the input invalid and describes the error after the hint', () => {
    render(
      <TextField
        label="Ngày mất (âm lịch)"
        hint="Theo âm lịch."
        error="Tháng này chỉ có 29 ngày."
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Ngày mất (âm lịch)' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Theo âm lịch. Tháng này chỉ có 29 ngày.');
  });

  it('forwards input props and the ref', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLInputElement>();
    render(<TextField label="Tên gọi" ref={ref} defaultValue="Hà" />);
    expect(ref.current?.value).toBe('Hà');
    await user.type(screen.getByRole('textbox', { name: 'Tên gọi' }), ' Anh');
    expect(ref.current?.value).toBe('Hà Anh');
  });

  it('keeps a caller-provided id', () => {
    render(<TextField label="Quê quán" id="hometown" />);
    expect(screen.getByRole('textbox', { name: 'Quê quán' })).toHaveAttribute('id', 'hometown');
  });
});
```

Run: `pnpm vitest run --project web src/shared/ui/TextField.test.tsx`
Expected: FAIL. `Failed to resolve import "./TextField"`.

- [ ] **Step 4: Implement TextField**

`apps/web/src/shared/ui/TextField.tsx`:

```tsx
import { useId, type ComponentProps } from 'react';
import { cn } from '../lib/cn';

export interface TextFieldProps extends ComponentProps<'input'> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, id, className, ...inputProps }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="h-10 rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-muted aria-invalid:border-stamp"
        {...inputProps}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-stamp">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

Run: `pnpm vitest run --project web src/shared/ui/TextField.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the close label**

In `apps/web/src/locales/vi.json`, add this top-level object after `"theme"`:

```json
  "common": {
    "close": "Đóng"
  },
```

In `apps/web/src/locales/en.json`:

```json
  "common": {
    "close": "Close"
  },
```

- [ ] **Step 6: Write the failing Dialog test**

`apps/web/src/shared/ui/Dialog.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { Button } from './Button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from './Dialog';

function Example() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Mở</Button>
      </DialogTrigger>
      <DialogContent title="Xoá Cô Hà khỏi cây?" description="Có thể hoàn tác ngay sau đó.">
        <DialogClose asChild>
          <Button variant="secondary">Giữ lại</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

async function openExample() {
  const user = userEvent.setup();
  renderWithProviders(<Example />);
  await user.click(screen.getByRole('button', { name: 'Mở' }));
  return user;
}

describe('Dialog', () => {
  it('opens with an accessible name and description', async () => {
    await openExample();
    const dialog = screen.getByRole('dialog', { name: 'Xoá Cô Hà khỏi cây?' });
    expect(dialog).toHaveAccessibleDescription('Có thể hoàn tác ngay sau đó.');
  });

  it('closes with the close button', async () => {
    const user = await openExample();
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes from a DialogClose action', async () => {
    const user = await openExample();
    await user.click(screen.getByRole('button', { name: 'Giữ lại' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes with Escape and returns focus to the trigger', async () => {
    const user = await openExample();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở' })).toHaveFocus();
  });
});
```

Run: `pnpm vitest run --project web src/shared/ui/Dialog.test.tsx`
Expected: FAIL. `Failed to resolve import "./Dialog"`.

- [ ] **Step 7: Implement Dialog**

`apps/web/src/shared/ui/Dialog.tsx`:

```tsx
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { Button } from './Button';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps
  extends Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> {
  /** Required so every dialog has an accessible name. */
  title: string;
  description?: string;
}

export function DialogContent({
  title,
  description,
  className,
  children,
  ...props
}: DialogContentProps) {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 animate-overlay-in bg-scrim/45" />
      <DialogPrimitive.Content
        // Without a description, tell Radix there is intentionally none (no console warning).
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 animate-dialog-in rounded-control border border-line bg-surface p-6 text-ink',
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="pr-8 text-lg font-bold">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-2 text-ink-muted">
            {description}
          </DialogPrimitive.Description>
        ) : null}
        <div className="mt-6">{children}</div>
        <DialogPrimitive.Close asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 size-8"
            aria-label={t('common.close')}
          >
            <X aria-hidden="true" size={16} strokeWidth={1.75} />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
```

Run: `pnpm vitest run --project web src/shared/ui/Dialog.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 8: Export the components**

Append to `apps/web/src/shared/ui/index.ts`:

```ts
export { Button, buttonVariants, type ButtonProps } from './Button';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  type DialogContentProps,
} from './Dialog';
export { TextField, type TextFieldProps } from './TextField';
```

- [ ] **Step 9: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/web
git commit -m "feat(web): add Button, TextField and Dialog on Radix with scrapbook tokens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Scrapbook primitives — tilt, tape, initials, Polaroid, DateMark

**Files:**
- Create: `apps/web/src/shared/ui/scrapbook/tilt.ts`, `tape.ts`, `initials.ts`, `Polaroid.tsx`, `DateMark.tsx` (all in `apps/web/src/shared/ui/scrapbook/`)
- Modify: `apps/web/src/shared/ui/index.ts`
- Test: `apps/web/src/shared/ui/scrapbook/tilt.test.ts`, `tape.test.ts`, `initials.test.ts`, `Polaroid.test.tsx`, `DateMark.test.tsx`

**Interfaces:**
- Consumes: `cn`, tokens (`bg-photo`, `text-photo-ink`, `var(--tape-*)`, …).
- Produces (exported from `src/shared/ui/index.ts`):
  - `MAX_TILT = 2.5`; `tiltFor(id: string): number` returns a deterministic angle in degrees in [−2.5, 2.5], in steps of 0.1.
  - `type TapeKind = 'progenitor' | 'in-law' | 'loose' | number`, `BRANCH_TAPE_COUNT = 6`, and `tapeColor(tape: TapeKind): string`, which returns `var(--tape-…)`. A number picks a branch, cycling through 1–6.
  - `initialsOf(name: string): string` returns the uppercase first letter of the last word, after NFC normalisation, or `'?'`.
  - `type PolaroidLod = 'full' | 'label' | 'strip'`.
  - `POLAROID_SIZE`: full 100×124, label 100×40, strip 100×14.
  - `Polaroid` props: `{ name, label, tape, tilt?, lod?, photoUrl?, lifeYears?, marks?, className?, style?, ...figure props }`. It renders a `<figure aria-label={label} data-lod={lod} data-tape={…}>`.
  - `type DateMarkKind = 'death-anniversary' | 'birthday'`; `DateMark` props: `{ kind, children, className? }`. It renders `<span data-kind={kind}>`.

- [ ] **Step 1: Write the failing tests for the pure helpers**

`apps/web/src/shared/ui/scrapbook/tilt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_TILT, tiltFor } from './tilt';

describe('tiltFor', () => {
  it('is deterministic for the same id', () => {
    expect(tiltFor('64f1a2b3c4d5e6f708192a3b')).toBe(tiltFor('64f1a2b3c4d5e6f708192a3b'));
  });

  it('stays within ±MAX_TILT degrees in 0.1° steps', () => {
    for (let index = 0; index < 500; index += 1) {
      const tilt = tiltFor(`person-${index}`);
      expect(Math.abs(tilt)).toBeLessThanOrEqual(MAX_TILT);
      expect(Math.round(tilt * 10) / 10).toBe(tilt);
    }
  });

  it('spreads different ids over many angles', () => {
    const angles = new Set(Array.from({ length: 200 }, (_, index) => tiltFor(`person-${index}`)));
    expect(angles.size).toBeGreaterThanOrEqual(25);
  });
});
```

`apps/web/src/shared/ui/scrapbook/tape.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BRANCH_TAPE_COUNT, tapeColor } from './tape';

describe('tapeColor', () => {
  it('maps the named kinds to their tokens', () => {
    expect(tapeColor('progenitor')).toBe('var(--tape-progenitor)');
    expect(tapeColor('in-law')).toBe('var(--tape-in-law)');
    expect(tapeColor('loose')).toBe('var(--tape-loose)');
  });

  it('cycles branch numbers through the six branch tapes', () => {
    expect(BRANCH_TAPE_COUNT).toBe(6);
    expect(tapeColor(0)).toBe('var(--tape-1)');
    expect(tapeColor(5)).toBe('var(--tape-6)');
    expect(tapeColor(6)).toBe('var(--tape-1)');
  });

  it('accepts negative and fractional branch numbers', () => {
    expect(tapeColor(-1)).toBe('var(--tape-2)');
    expect(tapeColor(2.7)).toBe('var(--tape-3)');
  });
});
```

`apps/web/src/shared/ui/scrapbook/initials.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

describe('initialsOf', () => {
  it('uses the given name, which is the last word of a Vietnamese name', () => {
    expect(initialsOf('Nguyễn Văn Thịnh')).toBe('T');
    expect(initialsOf('  Bà   Hoa ')).toBe('H');
  });

  it('keeps Vietnamese diacritics on the letter', () => {
    expect(initialsOf('Lê Thị ánh')).toBe('Á');
    expect(initialsOf('Ánh')).toBe('Á');
  });

  it('returns a placeholder for empty names', () => {
    expect(initialsOf('   ')).toBe('?');
  });
});
```

Run: `pnpm vitest run --project web src/shared/ui/scrapbook`
Expected: FAIL. The imports `./tilt`, `./tape` and `./initials` cannot be resolved.

- [ ] **Step 2: Implement the helpers**

`apps/web/src/shared/ui/scrapbook/tilt.ts`:

```ts
/** Largest tilt of a card, in degrees, either way. */
export const MAX_TILT = 2.5;

const STEPS = Math.round(MAX_TILT * 10) * 2 + 1; // -2.5 … 2.5 in 0.1° steps = 51 values

/**
 * A small, stable tilt for a person's card, derived from their id (FNV-1a hash), so the
 * board looks hand-made but a card never changes angle between renders or devices.
 */
export function tiltFor(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const step = (hash >>> 0) % STEPS;
  return (step - (STEPS - 1) / 2) / 10;
}
```

`apps/web/src/shared/ui/scrapbook/tape.ts`:

```ts
/**
 * Which washi tape a card wears. A number is the index of the person's branch (the child
 * of the progenitor the person descends from); it cycles through the Okabe–Ito palette.
 */
export type TapeKind = 'progenitor' | 'in-law' | 'loose' | number;

export const BRANCH_TAPE_COUNT = 6;

export function tapeColor(tape: TapeKind): string {
  if (tape === 'progenitor') return 'var(--tape-progenitor)';
  if (tape === 'in-law') return 'var(--tape-in-law)';
  if (tape === 'loose') return 'var(--tape-loose)';
  const branch = Math.abs(Math.trunc(tape)) % BRANCH_TAPE_COUNT;
  return `var(--tape-${branch + 1})`;
}
```

`apps/web/src/shared/ui/scrapbook/initials.ts`:

```ts
/**
 * The letter shown on a card without a photo. Vietnamese names put the given name last,
 * and that is the name people are called by.
 */
export function initialsOf(name: string): string {
  const lastWord = name.trim().split(/\s+/).at(-1);
  if (!lastWord) return '?';
  return lastWord.normalize('NFC').charAt(0).toLocaleUpperCase('vi');
}
```

Run: `pnpm vitest run --project web src/shared/ui/scrapbook`
Expected: PASS (9 tests).

- [ ] **Step 3: Write the failing component tests**

`apps/web/src/shared/ui/scrapbook/DateMark.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DateMark } from './DateMark';

describe('DateMark', () => {
  it('renders a death anniversary as a stamp', () => {
    render(<DateMark kind="death-anniversary">Giỗ 15/10</DateMark>);
    const mark = screen.getByText('Giỗ 15/10');
    expect(mark).toHaveAttribute('data-kind', 'death-anniversary');
    expect(mark.className).toContain('text-photo-stamp');
  });

  it('renders a birthday as a round sticker', () => {
    render(<DateMark kind="birthday">SN 21/11</DateMark>);
    const mark = screen.getByText('SN 21/11');
    expect(mark).toHaveAttribute('data-kind', 'birthday');
    expect(mark.className).toContain('bg-sticker');
  });
});
```

`apps/web/src/shared/ui/scrapbook/Polaroid.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Polaroid } from './Polaroid';

const LABEL = 'Ông Thịnh, 1931–2004';

describe('Polaroid', () => {
  it('renders the full card with tape, initials, caption and accessible name', () => {
    render(<Polaroid name="Ông Thịnh" label={LABEL} tape="progenitor" tilt={1.5} />);
    const card = screen.getByRole('figure', { name: LABEL });
    expect(card).toHaveAttribute('data-lod', 'full');
    expect(card).toHaveAttribute('data-tape', 'progenitor');
    expect(within(card).getByText('Ông Thịnh')).toBeInTheDocument();
    expect(within(card).getByText('T')).toBeInTheDocument();
    expect(card.querySelector('img')).toBeNull();
  });

  it('shows the photo instead of initials when there is one', () => {
    render(<Polaroid name="Bà Hoa" label="Bà Hoa" tape="in-law" photoUrl="/hoa.jpg" />);
    const card = screen.getByRole('figure', { name: 'Bà Hoa' });
    expect(card.querySelector('img')).toHaveAttribute('src', '/hoa.jpg');
    expect(card.querySelector('img')).toHaveAttribute('alt', '');
    expect(within(card).queryByText('H')).not.toBeInTheDocument();
  });

  it('renders date marks on the full card only', () => {
    const marks = <span>Giỗ 15/10</span>;
    const { rerender } = render(
      <Polaroid name="Ông Thịnh" label={LABEL} tape="progenitor" marks={marks} />,
    );
    expect(screen.getByText('Giỗ 15/10')).toBeInTheDocument();

    rerender(
      <Polaroid name="Ông Thịnh" label={LABEL} tape="progenitor" marks={marks} lod="label" />,
    );
    expect(screen.queryByText('Giỗ 15/10')).not.toBeInTheDocument();
  });

  it('renders a taped name label at medium zoom', () => {
    render(
      <Polaroid name="Bố Tuấn" label="Bố Tuấn, 1962" tape={0} lod="label" lifeYears="1962" />,
    );
    const card = screen.getByRole('figure', { name: 'Bố Tuấn, 1962' });
    expect(card).toHaveAttribute('data-lod', 'label');
    expect(card).toHaveAttribute('data-tape', 'branch-1');
    expect(within(card).getByText('Bố Tuấn')).toBeInTheDocument();
    expect(within(card).getByText('1962')).toBeInTheDocument();
  });

  it('renders only a strip of tape when zoomed far out, keeping the accessible name', () => {
    render(<Polaroid name="Cô Hà" label="Cô Hà, 1968" tape={1} lod="strip" />);
    const card = screen.getByRole('figure', { name: 'Cô Hà, 1968' });
    expect(card).toHaveAttribute('data-lod', 'strip');
    expect(card.textContent).toBe('');
  });

  it('passes extra props and classes through', () => {
    render(
      <Polaroid
        name="Mẹ Lan"
        label="Mẹ Lan"
        tape="in-law"
        className="absolute"
        data-testid="lan"
      />,
    );
    expect(screen.getByTestId('lan').className).toContain('absolute');
  });
});
```

Run: `pnpm vitest run --project web src/shared/ui/scrapbook`
Expected: FAIL. `./DateMark` and `./Polaroid` cannot be resolved.

- [ ] **Step 4: Implement DateMark**

`apps/web/src/shared/ui/scrapbook/DateMark.tsx`:

```tsx
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type DateMarkKind = 'death-anniversary' | 'birthday';

interface DateMarkProps {
  kind: DateMarkKind;
  children: ReactNode;
  className?: string;
}

/** A rubber stamp for death anniversaries, a round sticker for birthdays (spec §13.3). */
export function DateMark({ kind, children, className }: DateMarkProps) {
  if (kind === 'death-anniversary') {
    return (
      <span
        data-kind={kind}
        className={cn(
          'inline-block -rotate-[10deg] rounded-[3px] border-[1.5px] border-photo-stamp bg-photo px-1 py-px font-mono text-[10px] leading-tight font-bold whitespace-nowrap text-photo-stamp uppercase',
          className,
        )}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      data-kind={kind}
      className={cn(
        'inline-flex size-10 rotate-[8deg] items-center justify-center rounded-full bg-sticker text-center font-mono text-[9px] leading-tight font-bold text-on-sticker',
        className,
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 5: Implement Polaroid**

`apps/web/src/shared/ui/scrapbook/Polaroid.tsx`:

```tsx
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { initialsOf } from './initials';
import { BRANCH_TAPE_COUNT, tapeColor, type TapeKind } from './tape';

/** Level of detail by zoom (spec §7.4): full card > 0.8, name label 0.4–0.8, tape strip < 0.4. */
export type PolaroidLod = 'full' | 'label' | 'strip';

export const POLAROID_SIZE: Record<PolaroidLod, { width: number; height: number }> = {
  full: { width: 100, height: 124 },
  label: { width: 100, height: 40 },
  strip: { width: 100, height: 14 },
};

export interface PolaroidProps extends Omit<ComponentProps<'figure'>, 'children'> {
  /** Shown in the handwritten caption. */
  name: string;
  /** Accessible name: name, life years and, on the tree, the generation (spec §7.8). */
  label: string;
  tape: TapeKind;
  /** Degrees; use tiltFor(person.id). */
  tilt?: number;
  lod?: PolaroidLod;
  photoUrl?: string;
  lifeYears?: string;
  /** Date marks (stamps, stickers), shown on the full card only. */
  marks?: ReactNode;
}

function tapeName(tape: TapeKind): string {
  return typeof tape === 'number'
    ? `branch-${(Math.abs(Math.trunc(tape)) % BRANCH_TAPE_COUNT) + 1}`
    : tape;
}

export function Polaroid({
  name,
  label,
  tape,
  tilt = 0,
  lod = 'full',
  photoUrl,
  lifeYears,
  marks,
  className,
  style,
  ...props
}: PolaroidProps) {
  const tapeBackground = tapeColor(tape);
  const { width, height } = POLAROID_SIZE[lod];
  // `rotate` (not `transform`) so it combines with Tailwind's translate/scale utilities.
  const frame: CSSProperties = { width, height, rotate: `${tilt}deg`, ...style };
  const common = { 'aria-label': label, 'data-lod': lod, 'data-tape': tapeName(tape), ...props };

  if (lod === 'strip') {
    return (
      <figure
        {...common}
        className={cn('m-0 rounded-photo', className)}
        style={{ ...frame, backgroundColor: tapeBackground }}
      />
    );
  }

  if (lod === 'label') {
    return (
      <figure
        {...common}
        className={cn(
          'relative m-0 flex items-center gap-2 overflow-hidden rounded-photo border border-line bg-photo pr-2 text-photo-ink',
          className,
        )}
        style={frame}
      >
        <span
          aria-hidden="true"
          className="h-full w-2 shrink-0"
          style={{ backgroundColor: tapeBackground }}
        />
        <figcaption className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-hand text-base">{name}</span>
          {lifeYears ? (
            <span className="block font-mono text-[10px] text-photo-muted">{lifeYears}</span>
          ) : null}
        </figcaption>
      </figure>
    );
  }

  return (
    <figure
      {...common}
      className={cn(
        'relative m-0 rounded-photo border border-line bg-photo px-[7px] pt-[7px] text-photo-ink',
        className,
      )}
      style={frame}
    >
      <span
        aria-hidden="true"
        className="absolute -top-2 left-7 h-3.5 w-11 -rotate-3 opacity-85"
        style={{ backgroundColor: tapeBackground }}
      />
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-[74px] w-full object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-[74px] items-center justify-center text-2xl font-bold"
          style={{ backgroundColor: `color-mix(in oklab, ${tapeBackground} 18%, var(--photo))` }}
        >
          {initialsOf(name)}
        </span>
      )}
      <figcaption className="mt-1.5 truncate text-center font-hand text-base">{name}</figcaption>
      {marks ? (
        <div className="absolute -right-3 bottom-3 flex flex-col items-end gap-1">{marks}</div>
      ) : null}
    </figure>
  );
}
```

Run: `pnpm vitest run --project web src/shared/ui/scrapbook`
Expected: PASS (17 tests).

- [ ] **Step 6: Export the primitives**

Append to `apps/web/src/shared/ui/index.ts`:

```ts
export { DateMark, type DateMarkKind } from './scrapbook/DateMark';
export { initialsOf } from './scrapbook/initials';
export {
  Polaroid,
  POLAROID_SIZE,
  type PolaroidLod,
  type PolaroidProps,
} from './scrapbook/Polaroid';
export { BRANCH_TAPE_COUNT, tapeColor, type TapeKind } from './scrapbook/tape';
export { MAX_TILT, tiltFor } from './scrapbook/tilt';
```

- [ ] **Step 7: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/web
git commit -m "feat(web): add polaroid card with three levels of detail, washi tape and date marks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Relationship lines — thread geometry, Thread, Stitch, Board

**Files:**
- Create: `apps/web/src/shared/ui/scrapbook/threads.ts`, `Thread.tsx`, `Stitch.tsx`, `Board.tsx` (in `apps/web/src/shared/ui/scrapbook/`)
- Modify: `apps/web/src/shared/ui/index.ts`
- Test: `apps/web/src/shared/ui/scrapbook/threads.test.ts`, `Thread.test.tsx`, `Board.test.tsx`

**Interfaces:**
- Consumes: `cn`, the `board-grid` utility, the `stroke-*` / `fill-*` token utilities.
- Produces (exported from `src/shared/ui/index.ts`):
  - Types `Point { x; y }` and `Size { width; height }`. Constants `PIN_OFFSET = 16` and `THREAD_DROP = 8`.
  - `midpoint(a, b): Point`.
  - `stitchEnds(a, b, size)`. The arguments are top-left card corners. It returns `{ left, right }`: the facing edge points at mid-height.
  - `stitchPath(left, right): string`.
  - `pinPoint(child, size): Point`: the centre of the card top, `PIN_OFFSET` above it.
  - `threadPath(from, dropTo, to): string`: straight down from `from` to `dropTo`, then an S-curve to `to`.
  - `Thread({ from, dropTo, to, selected? })`: an SVG `<g data-relation="parent-child">` with a path and a red pin.
  - `Stitch({ left, right, selected? })`: an SVG `<g data-relation="marriage">` with a dashed path and a round knot.
  - `Board({ width, height, label, children, ...div props })`: a grid-paper `role="group"` container.

- [ ] **Step 1: Write the failing geometry tests**

`apps/web/src/shared/ui/scrapbook/threads.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { midpoint, pinPoint, stitchEnds, stitchPath, threadPath } from './threads';

const CARD = { width: 100, height: 124 };

describe('thread geometry', () => {
  it('finds the midpoint of two points', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });

  it('joins the facing edges of two cards at mid-height, in either order', () => {
    const thinh = { x: 170, y: 40 };
    const hoa = { x: 298, y: 40 };
    const expected = { left: { x: 270, y: 102 }, right: { x: 298, y: 102 } };
    expect(stitchEnds(thinh, hoa, CARD)).toEqual(expected);
    expect(stitchEnds(hoa, thinh, CARD)).toEqual(expected);
  });

  it('draws the stitch as a straight line', () => {
    expect(stitchPath({ x: 270, y: 102 }, { x: 298, y: 102 })).toBe('M270 102 L298 102');
  });

  it('puts the pin above the centre of the child card', () => {
    expect(pinPoint({ x: 90, y: 240 }, CARD)).toEqual({ x: 140, y: 224 });
  });

  it('drops straight down, then curves to the pin', () => {
    expect(threadPath({ x: 284, y: 102 }, 172, { x: 140, y: 224 })).toBe(
      'M284 102 L284 172 C284 198 140 198 140 224',
    );
  });

  it('keeps a minimum bend for short gaps', () => {
    expect(threadPath({ x: 0, y: 0 }, 100, { x: 50, y: 110 })).toBe(
      'M0 0 L0 100 C0 112 50 98 50 110',
    );
  });
});
```

Run: `pnpm vitest run --project web src/shared/ui/scrapbook/threads.test.ts`
Expected: FAIL. `Failed to resolve import "./threads"`.

- [ ] **Step 2: Implement the geometry**

`apps/web/src/shared/ui/scrapbook/threads.ts`:

```ts
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Distance between the top of a child's card and the red pin where its thread ends. */
export const PIN_OFFSET = 16;

/** How far below the parents' cards a thread runs straight down before it bends. */
export const THREAD_DROP = 8;

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Facing edge points (mid-height) of two cards given by their top-left corners. */
export function stitchEnds(a: Point, b: Point, size: Size): { left: Point; right: Point } {
  const [first, second] = a.x <= b.x ? [a, b] : [b, a];
  return {
    left: { x: first.x + size.width, y: first.y + size.height / 2 },
    right: { x: second.x, y: second.y + size.height / 2 },
  };
}

export function stitchPath(left: Point, right: Point): string {
  return `M${left.x} ${left.y} L${right.x} ${right.y}`;
}

/** Where a child's thread ends: above the centre of the card's top edge. */
export function pinPoint(child: Point, size: Size): Point {
  return { x: child.x + size.width / 2, y: child.y - PIN_OFFSET };
}

/**
 * A parent → child thread: straight down from the couple's knot (or a single parent's
 * bottom edge) to `dropTo`, between the cards, then an S-curve to the child's pin.
 */
export function threadPath(from: Point, dropTo: number, to: Point): string {
  const bend = Math.max(12, (to.y - dropTo) / 2);
  return `M${from.x} ${from.y} L${from.x} ${dropTo} C${from.x} ${dropTo + bend} ${to.x} ${to.y - bend} ${to.x} ${to.y}`;
}
```

Run: `pnpm vitest run --project web src/shared/ui/scrapbook/threads.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Write the failing component tests**

`apps/web/src/shared/ui/scrapbook/Thread.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stitch } from './Stitch';
import { Thread } from './Thread';

function inSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>).container;
}

describe('Thread', () => {
  it('draws the thread path and a pin at the child', () => {
    const container = inSvg(
      <Thread from={{ x: 284, y: 102 }} dropTo={172} to={{ x: 140, y: 224 }} />,
    );
    const group = container.querySelector('[data-relation="parent-child"]');
    expect(group?.querySelector('path')).toHaveAttribute(
      'd',
      'M284 102 L284 172 C284 198 140 198 140 224',
    );
    const pin = group?.querySelector('circle');
    expect(pin).toHaveAttribute('cx', '140');
    expect(pin).toHaveAttribute('cy', '224');
    expect(group).not.toHaveAttribute('data-selected');
  });

  it('marks a selected thread', () => {
    const container = inSvg(
      <Thread from={{ x: 0, y: 0 }} dropTo={10} to={{ x: 0, y: 40 }} selected />,
    );
    const group = container.querySelector('[data-relation="parent-child"]');
    expect(group).toHaveAttribute('data-selected', 'true');
    expect(group?.querySelector('path')?.getAttribute('class')).toContain('stroke-stamp');
  });
});

describe('Stitch', () => {
  it('draws a dashed stitch with a knot in the middle', () => {
    const container = inSvg(<Stitch left={{ x: 270, y: 102 }} right={{ x: 298, y: 102 }} />);
    const group = container.querySelector('[data-relation="marriage"]');
    const path = group?.querySelector('path');
    expect(path).toHaveAttribute('d', 'M270 102 L298 102');
    expect(path).toHaveAttribute('stroke-dasharray', '4 4');
    const knot = group?.querySelector('circle');
    expect(knot).toHaveAttribute('cx', '284');
    expect(knot).toHaveAttribute('cy', '102');
  });
});
```

`apps/web/src/shared/ui/scrapbook/Board.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Board } from './Board';

describe('Board', () => {
  it('is a labelled group of the given size on grid paper', () => {
    render(
      <Board width={560} height={420} label="Cây gia phả mẫu">
        <p>nội dung</p>
      </Board>,
    );
    const board = screen.getByRole('group', { name: 'Cây gia phả mẫu' });
    expect(board).toHaveStyle({ width: '560px', height: '420px' });
    expect(board.className).toContain('board-grid');
    expect(screen.getByText('nội dung')).toBeInTheDocument();
  });
});
```

Run: `pnpm vitest run --project web src/shared/ui/scrapbook`
Expected: FAIL. `./Thread`, `./Stitch` and `./Board` cannot be resolved.

- [ ] **Step 4: Implement Thread, Stitch and Board**

`apps/web/src/shared/ui/scrapbook/Thread.tsx`:

```tsx
import { threadPath, type Point } from './threads';

interface ThreadProps {
  from: Point;
  dropTo: number;
  to: Point;
  selected?: boolean;
}

/** Parent → child: a thread ending in a red pin above the child's card. Render inside <svg>. */
export function Thread({ from, dropTo, to, selected = false }: ThreadProps) {
  return (
    <g data-relation="parent-child" data-selected={selected || undefined}>
      <path
        d={threadPath(from, dropTo, to)}
        fill="none"
        strokeWidth={selected ? 2.6 : 1.5}
        className={selected ? 'stroke-stamp' : 'stroke-thread'}
      />
      <circle cx={to.x} cy={to.y} r={selected ? 5 : 4} className="fill-pin" />
    </g>
  );
}
```

`apps/web/src/shared/ui/scrapbook/Stitch.tsx`:

```tsx
import { cn } from '../../lib/cn';
import { midpoint, stitchPath, type Point } from './threads';

interface StitchProps {
  left: Point;
  right: Point;
  selected?: boolean;
}

/** Marriage: a dashed stitch with a round knot in the middle. Render inside <svg>. */
export function Stitch({ left, right, selected = false }: StitchProps) {
  const knot = midpoint(left, right);
  const stroke = selected ? 'stroke-stamp' : 'stroke-thread';
  return (
    <g data-relation="marriage" data-selected={selected || undefined}>
      <path
        d={stitchPath(left, right)}
        fill="none"
        strokeDasharray="4 4"
        strokeWidth={selected ? 2.6 : 1.6}
        className={stroke}
      />
      <circle cx={knot.x} cy={knot.y} r={6} strokeWidth={1.8} className={cn('fill-photo', stroke)} />
    </g>
  );
}
```

`apps/web/src/shared/ui/scrapbook/Board.tsx`:

```tsx
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export interface BoardProps extends ComponentProps<'div'> {
  width: number;
  height: number;
  /** Accessible name of the board, for example the clan or "sample tree". */
  label: string;
}

/** Grid-paper surface that holds positioned polaroids and an SVG layer of threads. */
export function Board({ width, height, label, className, style, children, ...props }: BoardProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'board-grid relative shrink-0 overflow-hidden rounded-control border border-line',
        className,
      )}
      style={{ width, height, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
```

Run: `pnpm vitest run --project web src/shared/ui/scrapbook`
Expected: PASS (all scrapbook tests).

- [ ] **Step 5: Export them**

Append to `apps/web/src/shared/ui/index.ts`:

```ts
export { Board, type BoardProps } from './scrapbook/Board';
export { Stitch } from './scrapbook/Stitch';
export { Thread } from './scrapbook/Thread';
export {
  midpoint,
  PIN_OFFSET,
  pinPoint,
  stitchEnds,
  stitchPath,
  THREAD_DROP,
  threadPath,
  type Point,
  type Size,
} from './scrapbook/threads';
```

- [ ] **Step 6: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/web
git commit -m "feat(web): add thread, stitch and grid-paper board for relationship lines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: ServerStatus — restyle, persistent live region, retry progress

This task covers two P2 carry-over items: retry feedback through `isFetching` with a persistent live region, and `userEvent.setup()`.

**Files:**
- Modify: `apps/web/src/features/system/ServerStatus.tsx`
- Test: `apps/web/src/features/system/ServerStatus.test.tsx`

**Interfaces:**
- Consumes: `Button` (Task 4), `cn`, the `bg-success` / `bg-stamp` / `bg-line-strong` tokens.
- Produces: `ServerStatus`, still exported from `features/system/index.ts`. It always renders exactly one `<p role="status" aria-live="polite" data-state="checking|error|ok">`. While a request is in flight it shows the "checking" text, even during a retry after an error. The retry button appears only after an error and is disabled while the retry runs.

- [ ] **Step 1: Rewrite the test**

Replace `apps/web/src/features/system/ServerStatus.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { ServerStatus } from './ServerStatus';

const healthy = () =>
  new Response(JSON.stringify({ status: 'ok', version: '1.4.0', uptimeSeconds: 12 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ServerStatus', () => {
  it('announces checking, then the running version, in one polite live region', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => healthy()),
    );
    renderWithProviders(<ServerStatus />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Đang kết nối máy chủ…');

    await waitFor(() =>
      expect(status).toHaveTextContent('Máy chủ đang hoạt động (phiên bản 1.4.0)'),
    );
    expect(status).toHaveAttribute('data-state', 'ok');
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('shows a translated error, then progress while retrying, then the version', async () => {
    const user = userEvent.setup();
    let finishRetry: (response: Response) => void = () => undefined;
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishRetry = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<ServerStatus />);
    const status = screen.getByRole('status');

    await waitFor(() =>
      expect(status).toHaveTextContent(
        'Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.',
      ),
    );
    expect(status).toHaveAttribute('data-state', 'error');

    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(status).toHaveTextContent('Đang kết nối máy chủ…'));
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeDisabled();

    finishRetry(healthy());

    await waitFor(() =>
      expect(status).toHaveTextContent('Máy chủ đang hoạt động (phiên bản 1.4.0)'),
    );
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

Run: `pnpm vitest run --project web src/features/system`
Expected: FAIL. The current component uses `role="alert"` for errors and has no `aria-live` / `data-state`.

- [ ] **Step 2: Rewrite the component**

Replace `apps/web/src/features/system/ServerStatus.tsx`:

```tsx
import { HealthResponseSchema } from '@ancestors-tree/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../shared/lib/apiClient';
import { errorMessageKey } from '../../shared/lib/apiError';
import { cn } from '../../shared/lib/cn';
import { Button } from '../../shared/ui';

type ServerState = 'checking' | 'error' | 'ok';

const DOT: Record<ServerState, string> = {
  checking: 'bg-line-strong',
  error: 'bg-stamp',
  ok: 'bg-success',
};

export function ServerStatus() {
  const { t } = useTranslation();
  const health = useQuery({
    queryKey: ['system', 'health'],
    queryFn: () => apiRequest('/health', HealthResponseSchema),
  });

  let state: ServerState = 'checking';
  let message = t('system.serverStatus.checking');
  if (health.isSuccess) {
    state = 'ok';
    message = t('system.serverStatus.ok', { version: health.data.version });
  } else if (health.isError && !health.isFetching) {
    state = 'error';
    message = t(errorMessageKey(health.error));
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', DOT[state])} />
      {/* One persistent live region: screen readers hear every change of state. */}
      <p role="status" aria-live="polite" data-state={state} className="text-ink-muted">
        {message}
      </p>
      {/* TanStack Query v5 resets a query without data to "pending" while it refetches, so
          isError is false during a retry; errorUpdateCount keeps the button (disabled) on screen. */}
      {!health.isSuccess && health.errorUpdateCount > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={health.isFetching}
          onClick={() => void health.refetch()}
        >
          {t('system.serverStatus.retry')}
        </Button>
      ) : null}
    </div>
  );
}
```

Run: `pnpm vitest run --project web src/features/system`
Expected: PASS (2 tests).

- [ ] **Step 3: Run the full check and commit**

`App.test.tsx` still passes, because the status text is unchanged.

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/web
git commit -m "feat(web): restyle server status with a persistent live region and retry progress

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Home page with a sample family board

**Files:**
- Create:
  - `apps/web/src/features/home/sampleFamily.ts`
  - `apps/web/src/features/home/SampleFamilyBoard.tsx`
  - `apps/web/src/features/home/HomePage.tsx`
  - `apps/web/src/features/home/index.ts`
- Modify: `apps/web/src/locales/vi.json`, `apps/web/src/locales/en.json`
- Test: `apps/web/src/features/home/sampleFamily.test.ts`, `apps/web/src/features/home/SampleFamilyBoard.test.tsx`, `apps/web/src/features/home/HomePage.test.tsx`

**Interfaces:**
- Consumes:
  - from Task 5: `Polaroid`, `POLAROID_SIZE`, `DateMark`, `tiltFor`, `TapeKind`;
  - from Task 6: `Board`, `Thread`, `Stitch`, `stitchEnds`, `midpoint`, `pinPoint`, `THREAD_DROP`;
  - `Button` (Task 4), `Link` (react-router).
- Produces (exported from `features/home/index.ts`):
  - `HomePage`;
  - `SampleFamilyBoard`;
  - `SAMPLE_PEOPLE: readonly SamplePerson[]`, where `SamplePerson` is `{ id, name, years, tape: TapeKind, x, y, deathAnniversary?, birthday? }`;
  - `SAMPLE_MARRIAGES` and `SAMPLE_CHILDREN`.

- [ ] **Step 1: Add the strings**

In `apps/web/src/locales/vi.json`, add these top-level objects after `"common"`:

```json
  "home": {
    "title": "Gia phả nhà mình, dán từng tấm ảnh.",
    "galleryLink": "Xem bộ thiết kế",
    "boardLabel": "Cây gia phả mẫu",
    "legend": "Sợi chỉ có ghim đỏ nối cha mẹ với con · đường khâu nối vợ chồng · tem đỏ là ngày giỗ · sticker vàng là sinh nhật."
  },
  "scrapbook": {
    "personLabel": "{{name}}, {{years}}",
    "deathAnniversary": "Giỗ {{date}}",
    "birthday": "SN {{date}}"
  },
```

In `apps/web/src/locales/en.json`:

```json
  "home": {
    "title": "Your family tree, one photo at a time.",
    "galleryLink": "See the design system",
    "boardLabel": "Sample family tree",
    "legend": "Threads with a red pin join parents to children · stitches join spouses · red stamps are death anniversaries · yellow stickers are birthdays."
  },
  "scrapbook": {
    "personLabel": "{{name}}, {{years}}",
    "deathAnniversary": "Memorial {{date}}",
    "birthday": "Bday {{date}}"
  },
```

- [ ] **Step 2: Write the failing data test**

`apps/web/src/features/home/sampleFamily.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { POLAROID_SIZE } from '../../shared/ui';
import { SAMPLE_BOARD, SAMPLE_CHILDREN, SAMPLE_MARRIAGES, SAMPLE_PEOPLE } from './sampleFamily';

const ids = new Set(SAMPLE_PEOPLE.map((person) => person.id));

describe('sample family', () => {
  it('has unique ids', () => {
    expect(ids.size).toBe(SAMPLE_PEOPLE.length);
  });

  it('only links people who exist', () => {
    for (const [a, b] of SAMPLE_MARRIAGES) {
      expect(ids.has(a) && ids.has(b), `${a} + ${b}`).toBe(true);
    }
    for (const { child, parents } of SAMPLE_CHILDREN) {
      expect([child, ...parents].every((id) => ids.has(id)), child).toBe(true);
    }
  });

  it('keeps every card and its pin inside the board', () => {
    const { width, height } = POLAROID_SIZE.full;
    for (const person of SAMPLE_PEOPLE) {
      expect(person.x >= 0 && person.x + width <= SAMPLE_BOARD.width, person.id).toBe(true);
      expect(person.y >= 20 && person.y + height <= SAMPLE_BOARD.height, person.id).toBe(true);
    }
  });
});
```

Run: `pnpm vitest run --project web src/features/home`
Expected: FAIL. `Failed to resolve import "./sampleFamily"`.

- [ ] **Step 3: Create the sample data**

`apps/web/src/features/home/sampleFamily.ts`:

```ts
import type { TapeKind } from '../../shared/ui';

/** Content for the home page and the design gallery — not UI copy, so not in the locales. */
export interface SamplePerson {
  id: string;
  name: string;
  years: string;
  tape: TapeKind;
  /** Top-left corner of the full polaroid on the board. */
  x: number;
  y: number;
  deathAnniversary?: string;
  birthday?: string;
}

export const SAMPLE_BOARD = { width: 560, height: 420 } as const;

export const SAMPLE_PEOPLE: readonly SamplePerson[] = [
  {
    id: 'thinh',
    name: 'Ông Thịnh',
    years: '1931–2004',
    tape: 'progenitor',
    x: 170,
    y: 40,
    deathAnniversary: '15/10',
  },
  {
    id: 'hoa',
    name: 'Bà Hoa',
    years: '1935–2019',
    tape: 'in-law',
    x: 298,
    y: 40,
    deathAnniversary: '02/03',
  },
  { id: 'tuan', name: 'Bố Tuấn', years: '1962', tape: 0, x: 90, y: 240 },
  { id: 'lan', name: 'Mẹ Lan', years: '1965', tape: 'in-law', x: 218, y: 240, birthday: '21/11' },
  { id: 'ha', name: 'Cô Hà', years: '1968', tape: 1, x: 376, y: 240, birthday: '08/03' },
];

export const SAMPLE_MARRIAGES: ReadonlyArray<readonly [string, string]> = [
  ['thinh', 'hoa'],
  ['tuan', 'lan'],
];

export const SAMPLE_CHILDREN: ReadonlyArray<{
  child: string;
  parents: readonly [string, string];
}> = [
  { child: 'tuan', parents: ['thinh', 'hoa'] },
  { child: 'ha', parents: ['thinh', 'hoa'] },
];
```

Run: `pnpm vitest run --project web src/features/home/sampleFamily.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Write the failing board and page tests**

`apps/web/src/features/home/SampleFamilyBoard.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { SAMPLE_CHILDREN, SAMPLE_MARRIAGES, SAMPLE_PEOPLE } from './sampleFamily';
import { SampleFamilyBoard } from './SampleFamilyBoard';

describe('SampleFamilyBoard', () => {
  it('shows every sample person as a labelled photo on the board', () => {
    renderWithProviders(<SampleFamilyBoard />);
    const board = screen.getByRole('group', { name: 'Cây gia phả mẫu' });
    for (const person of SAMPLE_PEOPLE) {
      expect(
        within(board).getByRole('figure', { name: `${person.name}, ${person.years}` }),
      ).toBeInTheDocument();
    }
  });

  it('draws one stitch per marriage and one thread per child', () => {
    const { container } = renderWithProviders(<SampleFamilyBoard />);
    expect(container.querySelectorAll('[data-relation="marriage"]')).toHaveLength(
      SAMPLE_MARRIAGES.length,
    );
    expect(container.querySelectorAll('[data-relation="parent-child"]')).toHaveLength(
      SAMPLE_CHILDREN.length,
    );
  });

  it('stamps death anniversaries and stickers birthdays', () => {
    renderWithProviders(<SampleFamilyBoard />);
    expect(screen.getByText('Giỗ 15/10')).toHaveAttribute('data-kind', 'death-anniversary');
    expect(screen.getByText('SN 21/11')).toHaveAttribute('data-kind', 'birthday');
  });
});
```

`apps/web/src/features/home/HomePage.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('shows the headline, the sample tree with its legend and a link to the gallery', () => {
    renderWithProviders(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Gia phả nhà mình, dán từng tấm ảnh.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cùng con cháu dựng cây gia phả, không quên ngày giỗ.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Cây gia phả mẫu' })).toBeInTheDocument();
    expect(screen.getByText(/Sợi chỉ có ghim đỏ nối cha mẹ với con/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem bộ thiết kế' })).toHaveAttribute(
      'href',
      '/design',
    );
  });
});
```

Run: `pnpm vitest run --project web src/features/home`
Expected: FAIL. `./SampleFamilyBoard` and `./HomePage` cannot be resolved.

- [ ] **Step 5: Implement the board**

`apps/web/src/features/home/SampleFamilyBoard.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import {
  Board,
  DateMark,
  midpoint,
  pinPoint,
  Polaroid,
  POLAROID_SIZE,
  Stitch,
  stitchEnds,
  THREAD_DROP,
  Thread,
  tiltFor,
} from '../../shared/ui';
import {
  SAMPLE_BOARD,
  SAMPLE_CHILDREN,
  SAMPLE_MARRIAGES,
  SAMPLE_PEOPLE,
  type SamplePerson,
} from './sampleFamily';

const CARD = POLAROID_SIZE.full;

function personById(id: string): SamplePerson {
  const person = SAMPLE_PEOPLE.find((candidate) => candidate.id === id);
  if (!person) throw new Error(`Unknown sample person "${id}"`);
  return person;
}

export function SampleFamilyBoard() {
  const { t } = useTranslation();

  return (
    <Board width={SAMPLE_BOARD.width} height={SAMPLE_BOARD.height} label={t('home.boardLabel')}>
      <svg
        aria-hidden="true"
        className="absolute inset-0"
        width={SAMPLE_BOARD.width}
        height={SAMPLE_BOARD.height}
      >
        {/* Threads first, so the stitch knots sit on top of where threads start. */}
        {SAMPLE_CHILDREN.map(({ child, parents: [a, b] }) => {
          const first = personById(a);
          const second = personById(b);
          const { left, right } = stitchEnds(first, second, CARD);
          return (
            <Thread
              key={child}
              from={midpoint(left, right)}
              dropTo={Math.max(first.y, second.y) + CARD.height + THREAD_DROP}
              to={pinPoint(personById(child), CARD)}
            />
          );
        })}
        {SAMPLE_MARRIAGES.map(([a, b]) => {
          const { left, right } = stitchEnds(personById(a), personById(b), CARD);
          return <Stitch key={`${a}+${b}`} left={left} right={right} />;
        })}
      </svg>

      {SAMPLE_PEOPLE.map((person) => {
        const marks = [
          person.deathAnniversary ? (
            <DateMark key="death" kind="death-anniversary">
              {t('scrapbook.deathAnniversary', { date: person.deathAnniversary })}
            </DateMark>
          ) : null,
          person.birthday ? (
            <DateMark key="birthday" kind="birthday">
              {t('scrapbook.birthday', { date: person.birthday })}
            </DateMark>
          ) : null,
        ].filter(Boolean);

        return (
          <Polaroid
            key={person.id}
            className="absolute"
            style={{ left: person.x, top: person.y }}
            name={person.name}
            label={t('scrapbook.personLabel', { name: person.name, years: person.years })}
            lifeYears={person.years}
            tape={person.tape}
            tilt={tiltFor(person.id)}
            marks={marks.length > 0 ? marks : undefined}
          />
        );
      })}
    </Board>
  );
}
```

- [ ] **Step 6: Implement the page and the feature entry**

`apps/web/src/features/home/HomePage.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../shared/ui';
import { SampleFamilyBoard } from './SampleFamilyBoard';

export function HomePage() {
  const { t } = useTranslation();
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="max-w-md">
        <h1 className="text-4xl font-bold sm:text-5xl">{t('home.title')}</h1>
        <p className="mt-4 text-lg text-ink-muted">{t('app.tagline')}</p>
        <Button asChild variant="secondary" className="mt-8">
          <Link to="/design">{t('home.galleryLink')}</Link>
        </Button>
      </div>
      <figure className="m-0 min-w-0">
        <div className="overflow-x-auto pb-2">
          <SampleFamilyBoard />
        </div>
        <figcaption className="mt-3 max-w-[560px] text-sm text-ink-muted">
          {t('home.legend')}
        </figcaption>
      </figure>
    </div>
  );
}
```

`apps/web/src/features/home/index.ts`:

```ts
export { HomePage } from './HomePage';
export { SampleFamilyBoard } from './SampleFamilyBoard';
export {
  SAMPLE_CHILDREN,
  SAMPLE_MARRIAGES,
  SAMPLE_PEOPLE,
  type SamplePerson,
} from './sampleFamily';
```

Run: `pnpm vitest run --project web src/features/home`
Expected: PASS (7 tests).

- [ ] **Step 7: Run the full check and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

```bash
git add apps/web
git commit -m "feat(web): add home page with a sample family on the scrapbook board

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Router, app shell, error handling and document language

This task covers three P2 carry-over items: the error boundary, the localized meta description and keeping `<html lang>` in sync with the active language.

**Files:**
- Create: `apps/web/src/app/routes.tsx`, `apps/web/src/app/AppShell.tsx`, `apps/web/src/app/AppErrorBoundary.tsx`, `apps/web/src/app/RouteError.tsx`, `apps/web/src/app/NotFoundPage.tsx`, `apps/web/src/shared/i18n/useDocumentLanguage.ts`
- Modify: `apps/web/src/app/App.tsx`, `apps/web/src/main.tsx`, `apps/web/src/test/render.tsx`, `apps/web/src/locales/vi.json`, `apps/web/src/locales/en.json`
- Test: `apps/web/src/app/App.test.tsx` (rewrite), `apps/web/src/app/AppShell.test.tsx`, `apps/web/src/app/AppErrorBoundary.test.tsx`, `apps/web/src/app/RouteError.test.tsx`, `apps/web/src/shared/i18n/useDocumentLanguage.test.ts`

**Interfaces:**
- Consumes: `HomePage` (Task 8), `ServerStatus` (Task 7), `ThemeToggle` and `Button` (Tasks 3–4).
- Produces:
  - `routes: RouteObject[]`: `/` → `AppShell` with an index `HomePage` and a `*` `NotFoundPage`, using `RouteError` as `errorElement`. Task 10 adds `/design`.
  - `App`: a `RouterProvider` with a browser router.
  - `AppErrorBoundary` and `BootFailure`.
  - `useDocumentLanguage(): void`.
  - The test helper `renderRoute(path: string): RenderResult`.

- [ ] **Step 1: Add the strings**

In `apps/web/src/locales/vi.json`:
- Add `"description"` to the `app` object:

  ```json
  "app": {
    "name": "AncestorsTree",
    "tagline": "Cùng con cháu dựng cây gia phả, không quên ngày giỗ.",
    "description": "AncestorsTree — cùng con cháu dựng cây gia phả, không quên ngày giỗ."
  },
  ```

- Add `"loading"` to `common`:

  ```json
  "common": {
    "close": "Đóng",
    "loading": "Đang tải…"
  },
  ```

- Add these top-level objects after `"scrapbook"`:

  ```json
  "nav": {
    "skipToContent": "Bỏ qua, tới nội dung chính",
    "primary": "Điều hướng chính",
    "home": "Trang chủ"
  },
  "notFound": {
    "title": "Không tìm thấy trang này",
    "body": "Đường dẫn có thể đã cũ hoặc bị gõ nhầm.",
    "home": "Về trang chủ"
  },
  "routeError": {
    "title": "Trang này gặp lỗi",
    "body": "Hãy tải lại trang. Nếu vẫn lỗi, quay về trang chủ.",
    "reload": "Tải lại trang"
  },
  ```

In `apps/web/src/locales/en.json`, make the same three changes with the English text:

```json
  "app": {
    "name": "AncestorsTree",
    "tagline": "Build your family tree together and never miss a death anniversary.",
    "description": "AncestorsTree — build your family tree together and never miss a death anniversary."
  },
```

```json
  "common": {
    "close": "Close",
    "loading": "Loading…"
  },
```

```json
  "nav": {
    "skipToContent": "Skip to main content",
    "primary": "Main navigation",
    "home": "Home"
  },
  "notFound": {
    "title": "We could not find this page",
    "body": "The link may be outdated or mistyped.",
    "home": "Back to home"
  },
  "routeError": {
    "title": "Something went wrong on this page",
    "body": "Reload the page. If it keeps failing, go back to the home page.",
    "reload": "Reload page"
  },
```

- [ ] **Step 2: Write the failing document-language test**

`apps/web/src/shared/i18n/useDocumentLanguage.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../locales/en.json';
import vi from '../../locales/vi.json';
import i18n from './index';
import { useDocumentLanguage } from './useDocumentLanguage';

afterEach(async () => {
  await i18n.changeLanguage('vi');
  document.head.querySelector('meta[name="description"]')?.remove();
});

describe('useDocumentLanguage', () => {
  it('keeps <html lang> and the meta description in sync with the language', async () => {
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = 'placeholder';
    document.head.append(meta);

    renderHook(() => useDocumentLanguage());
    expect(document.documentElement.lang).toBe('vi');
    expect(meta.content).toBe(vi.app.description);

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(document.documentElement.lang).toBe('en');
    expect(meta.content).toBe(en.app.description);
  });
});
```

Run: `pnpm vitest run --project web src/shared/i18n`
Expected: FAIL. `Failed to resolve import "./useDocumentLanguage"`.

- [ ] **Step 3: Implement it**

`apps/web/src/shared/i18n/useDocumentLanguage.ts`:

```ts
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/** Keeps <html lang> and the meta description in the active language (SEO, screen readers). */
export function useDocumentLanguage(): void {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const description = t('app.description');

  useEffect(() => {
    document.documentElement.lang = language;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [language, description]);
}
```

Run: `pnpm vitest run --project web src/shared/i18n`
Expected: PASS.

- [ ] **Step 4: Write the failing error-handling tests**

`apps/web/src/app/AppErrorBoundary.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

function Boom(): never {
  throw new Error('boom');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it('renders its children when nothing fails', () => {
    render(
      <AppErrorBoundary>
        <p>bình thường</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('bình thường')).toBeInTheDocument();
  });

  it('shows a bilingual recovery message when rendering fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Ứng dụng gặp lỗi khi khởi động. Hãy tải lại trang.');
    expect(alert).toHaveTextContent('The app failed to start. Please reload the page.');
    expect(screen.getByRole('button', { name: 'Tải lại trang · Reload' })).toBeInTheDocument();
  });
});
```

`apps/web/src/app/RouteError.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { RouteError } from './RouteError';

function Boom(): never {
  throw new Error('route failed');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RouteError', () => {
  it('shows a translated recovery page when a route throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter([
      { path: '/', element: <Boom />, errorElement: <RouteError /> },
    ]);
    renderWithProviders(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Trang này gặp lỗi' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại trang' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
  });
});
```

Run: `pnpm vitest run --project web src/app`
Expected: FAIL. `./AppErrorBoundary` and `./RouteError` cannot be resolved.

- [ ] **Step 5: Implement the error components**

`apps/web/src/app/AppErrorBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Shown when the app cannot start (i18n failed to load, or a render error outside the
 * router). The text is hard-coded in both languages because i18n may be what failed.
 */
export function BootFailure() {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col gap-3 px-6 py-16 text-ink">
      <p lang="vi">Ứng dụng gặp lỗi khi khởi động. Hãy tải lại trang.</p>
      <p lang="en" className="text-ink-muted">
        The app failed to start. Please reload the page.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 h-10 self-start rounded-control bg-ink px-4 text-sm font-medium text-paper"
      >
        Tải lại trang · Reload
      </button>
    </div>
  );
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.error ? <BootFailure /> : this.props.children;
  }
}
```

`apps/web/src/app/RouteError.tsx`:

```tsx
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router';
import { Button } from '../shared/ui';

export function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4 px-6 py-16">
      <h1 className="text-3xl font-bold">{t('routeError.title')}</h1>
      <p className="text-ink-muted">{t('routeError.body')}</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => window.location.reload()}>{t('routeError.reload')}</Button>
        <Button asChild variant="secondary">
          {/* A full page load: after an error the router state may be broken. */}
          <a href="/">{t('notFound.home')}</a>
        </Button>
      </div>
    </section>
  );
}
```

`apps/web/src/app/NotFoundPage.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../shared/ui';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <section className="flex max-w-md flex-col gap-4">
      <h1 className="text-3xl font-bold">{t('notFound.title')}</h1>
      <p className="text-ink-muted">{t('notFound.body')}</p>
      <Button asChild variant="secondary" className="self-start">
        <Link to="/">{t('notFound.home')}</Link>
      </Button>
    </section>
  );
}
```

Run: `pnpm vitest run --project web src/app/AppErrorBoundary.test.tsx src/app/RouteError.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Create the shell and the route table**

`apps/web/src/app/AppShell.tsx`:

```tsx
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router';
import { ServerStatus } from '../features/system';
import { useDocumentLanguage } from '../shared/i18n/useDocumentLanguage';
import { cn } from '../shared/lib/cn';
import { ThemeToggle } from '../shared/ui';

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'rounded-control px-3 py-2 text-sm transition-colors duration-(--duration-fast) ease-settle',
    isActive ? 'bg-paper-grid font-medium text-ink' : 'text-ink-muted hover:text-ink',
  );
}

export function AppShell() {
  const { t } = useTranslation();
  useDocumentLanguage();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only rounded-control bg-surface px-4 py-2 text-ink focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
      >
        {t('nav.skipToContent')}
      </a>

      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link to="/" className="relative text-lg font-bold tracking-tight text-ink">
            {t('app.name')}
            <span
              aria-hidden="true"
              className="absolute -bottom-1 left-0 h-1.5 w-10 -rotate-2 bg-(--tape-progenitor) opacity-85"
            />
          </Link>
          <nav aria-label={t('nav.primary')} className="flex-1">
            <ul className="flex flex-wrap gap-1">
              <li>
                <NavLink to="/" end className={navLinkClass}>
                  {t('nav.home')}
                </NavLink>
              </li>
            </ul>
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 focus:outline-none"
      >
        <Suspense fallback={<p className="text-ink-muted">{t('common.loading')}</p>}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-4">
          <ServerStatus />
        </div>
      </footer>
    </div>
  );
}
```

`apps/web/src/app/routes.tsx`:

```tsx
import type { RouteObject } from 'react-router';
import { HomePage } from '../features/home';
import { AppShell } from './AppShell';
import { NotFoundPage } from './NotFoundPage';
import { RouteError } from './RouteError';

/** Shared by the browser router (App) and memory routers in tests (renderRoute). */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
```

Replace `apps/web/src/app/App.tsx`:

```tsx
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { routes } from './routes';

export function App() {
  const [router] = useState(() => createBrowserRouter(routes));
  return <RouterProvider router={router} />;
}
```

Replace `apps/web/src/test/render.tsx`:

```tsx
import { QueryClient } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProviders } from '../app/providers';
import { routes } from '../app/routes';

export function renderWithProviders(ui: ReactElement): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<AppProviders queryClient={queryClient}>{ui}</AppProviders>);
}

/** Renders the real route table at `path`, inside the app providers. */
export function renderRoute(path: string): RenderResult {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return renderWithProviders(<RouterProvider router={router} />);
}
```

- [ ] **Step 7: Write the shell and App tests**

`apps/web/src/app/AppShell.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '../test/render';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'ok', version: '0.1.0', uptimeSeconds: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('wraps the page with a skip link, navigation, theme switch and server status', async () => {
    renderRoute('/');
    expect(screen.getByRole('link', { name: 'Bỏ qua, tới nội dung chính' })).toHaveAttribute(
      'href',
      '#main',
    );
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trang chủ' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('group', { name: 'Giao diện' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(
      await screen.findByText('Máy chủ đang hoạt động (phiên bản 0.1.0)'),
    ).toBeInTheDocument();
  });

  it('shows the not-found page for unknown paths', async () => {
    renderRoute('/khong-co-trang-nay');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Không tìm thấy trang này' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
  });
});
```

Replace `apps/web/src/app/App.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { App } from './App';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the home page inside the app shell with the server status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: 'ok', version: '2.0.0', uptimeSeconds: 1 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    renderWithProviders(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gia phả nhà mình, dán từng tấm ảnh.' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Máy chủ đang hoạt động (phiên bản 2.0.0)'),
    ).toBeInTheDocument();
  });
});
```

Run: `pnpm vitest run --project web src/app`
Expected: PASS.

- [ ] **Step 8: Wire the boundary into `main.tsx`**

Replace `apps/web/src/main.tsx`:

```tsx
import './styles/fonts';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AppErrorBoundary, BootFailure } from './app/AppErrorBoundary';
import { AppProviders } from './app/providers';
import { i18nReady } from './shared/i18n';
import {
  applyTheme,
  getLocalStorage,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
} from './shared/ui';

// Before the first render, so the page never flashes the wrong theme.
applyTheme(resolveTheme(readThemePreference(getLocalStorage()), systemPrefersDark()));

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element in index.html');
const root = createRoot(rootElement);

void i18nReady.then(
  () => {
    root.render(
      <StrictMode>
        <AppErrorBoundary>
          <AppProviders>
            <App />
          </AppProviders>
        </AppErrorBoundary>
      </StrictMode>,
    );
  },
  (error: unknown) => {
    console.error(error);
    root.render(<BootFailure />);
  },
);
```

- [ ] **Step 9: Run the full check, try it in the browser, and commit**

Run: `pnpm format && pnpm check`
Expected: PASS.

Run `pnpm dev` and open http://localhost:5173. Check:
- The page shows the sample board and the header.
- The theme switch changes the colors.
- Pressing Tab first focuses "Bỏ qua, tới nội dung chính".
- `/khong-co` shows the not-found page.

Stop the dev server.

```bash
git add apps/web
git commit -m "feat(web): add router, app shell, error boundaries and document language sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Design gallery page

**Files:**
- Create: `apps/web/src/features/design-gallery/DesignGalleryPage.tsx`, `apps/web/src/features/design-gallery/index.ts`
- Modify: `apps/web/src/app/routes.tsx`, `apps/web/src/app/AppShell.tsx`, `apps/web/src/locales/vi.json`, `apps/web/src/locales/en.json`
- Test: `apps/web/src/features/design-gallery/DesignGalleryPage.test.tsx`, `apps/web/src/app/AppShell.test.tsx` (one more test)

**Interfaces:**
- Consumes: everything exported from `shared/ui`; `SampleFamilyBoard` and `SAMPLE_PEOPLE` from `features/home`.
- Produces: `DesignGalleryPage`, lazy-loaded at `/design`, and a "Bộ thiết kế" link in the primary navigation.

- [ ] **Step 1: Add the strings**

In `apps/web/src/locales/vi.json`:
- Add `"designGallery": "Bộ thiết kế"` to `nav`.
- Add this top-level object after `"routeError"`:

```json
  "designGallery": {
    "title": "Bộ thiết kế",
    "intro": "Mọi màu, chữ và thành phần của AncestorsTree ở cùng một chỗ. Đổi giao diện sáng/tối ở góc trên để xem cả hai.",
    "sections": {
      "colors": "Màu",
      "type": "Chữ",
      "controls": "Nút và ô nhập",
      "dialog": "Hộp thoại",
      "photos": "Ảnh polaroid theo mức thu phóng",
      "marks": "Tem ngày",
      "threads": "Chỉ và đường khâu"
    },
    "type": {
      "display": "Gia phả họ Nguyễn",
      "body": "Mỗi người là một tấm ảnh. Màu băng dính cho biết người đó thuộc chi nào.",
      "hand": "Ông nội giỗ rằm tháng Mười",
      "mono": "GIỖ 15/10 · SN 21/11 · 1931–2004"
    },
    "controls": {
      "primary": "Lưu thay đổi",
      "secondary": "Huỷ",
      "ghost": "Xem thêm",
      "danger": "Xoá người này",
      "nameLabel": "Họ và tên",
      "nameHint": "Viết đầy đủ, có dấu. Ví dụ: Nguyễn Văn Thịnh.",
      "dateLabel": "Ngày mất (âm lịch)",
      "dateError": "Tháng Mười âm lịch năm đó chỉ có 29 ngày."
    },
    "dialog": {
      "open": "Mở hộp thoại mẫu",
      "title": "Xoá Cô Hà khỏi cây?",
      "body": "Cô Hà sẽ được cất vào “Ảnh chưa dán”. Bạn có thể hoàn tác ngay sau đó.",
      "confirm": "Xoá khỏi cây",
      "cancel": "Giữ lại"
    },
    "photos": {
      "full": "Phóng to: ảnh đầy đủ",
      "label": "Vừa: nhãn tên",
      "strip": "Thu nhỏ: dải băng dính"
    },
    "marks": {
      "note": "Tem đỏ là ngày giỗ (âm lịch), sticker vàng là sinh nhật."
    },
    "threads": {
      "note": "Sợi chỉ có ghim đỏ nối cha mẹ với con. Đường khâu có nút tròn nối vợ chồng."
    }
  },
```

In `apps/web/src/locales/en.json`:
- Add `"designGallery": "Design system"` to `nav`.
- Add:

```json
  "designGallery": {
    "title": "Design system",
    "intro": "Every color, typeface and component of AncestorsTree in one place. Switch between light and dark at the top to see both.",
    "sections": {
      "colors": "Colors",
      "type": "Type",
      "controls": "Buttons and inputs",
      "dialog": "Dialog",
      "photos": "Polaroids by zoom level",
      "marks": "Date marks",
      "threads": "Threads and stitches"
    },
    "type": {
      "display": "The Nguyễn family tree",
      "body": "Each person is a photo. The color of the tape shows which branch they belong to.",
      "hand": "Grandpa's memorial is on the full moon of the tenth month",
      "mono": "MEMORIAL 15/10 · BDAY 21/11 · 1931–2004"
    },
    "controls": {
      "primary": "Save changes",
      "secondary": "Cancel",
      "ghost": "See more",
      "danger": "Delete this person",
      "nameLabel": "Full name",
      "nameHint": "Write it in full, with diacritics. Example: Nguyễn Văn Thịnh.",
      "dateLabel": "Date of death (lunar)",
      "dateError": "The tenth lunar month of that year has only 29 days."
    },
    "dialog": {
      "open": "Open sample dialog",
      "title": "Remove Cô Hà from the tree?",
      "body": "Cô Hà will be moved to “Loose photos”. You can undo right after.",
      "confirm": "Remove from tree",
      "cancel": "Keep"
    },
    "photos": {
      "full": "Zoomed in: full photo",
      "label": "Medium: name label",
      "strip": "Zoomed out: tape strip"
    },
    "marks": {
      "note": "Red stamps are death anniversaries (lunar), yellow stickers are birthdays."
    },
    "threads": {
      "note": "Threads with a red pin join parents to children. Stitches with a round knot join spouses."
    }
  },
```

- [ ] **Step 2: Write the failing gallery test**

`apps/web/src/features/design-gallery/DesignGalleryPage.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { DesignGalleryPage } from './DesignGalleryPage';

describe('DesignGalleryPage', () => {
  it('shows every section of the design system', () => {
    renderWithProviders(<DesignGalleryPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bộ thiết kế' })).toBeInTheDocument();
    for (const name of [
      'Màu',
      'Chữ',
      'Nút và ô nhập',
      'Hộp thoại',
      'Ảnh polaroid theo mức thu phóng',
      'Tem ngày',
      'Chỉ và đường khâu',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('lists the color and tape tokens', () => {
    renderWithProviders(<DesignGalleryPage />);
    for (const token of ['--paper', '--ink', '--stamp', '--tape-progenitor', '--tape-6']) {
      expect(screen.getByText(token)).toBeInTheDocument();
    }
  });

  it('shows the polaroid at each level of detail', () => {
    renderWithProviders(<DesignGalleryPage />);
    const levels = screen
      .getAllByRole('figure', { name: 'Ông Thịnh, 1931–2004' })
      .map((figure) => figure.getAttribute('data-lod'));
    expect(levels).toEqual(expect.arrayContaining(['full', 'label', 'strip']));
  });

  it('shows a field with an error and opens the sample dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DesignGalleryPage />);
    expect(screen.getByRole('textbox', { name: 'Ngày mất (âm lịch)' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại mẫu' }));
    expect(screen.getByRole('dialog', { name: 'Xoá Cô Hà khỏi cây?' })).toBeInTheDocument();
  });
});
```

Run: `pnpm vitest run --project web src/features/design-gallery`
Expected: FAIL. `Failed to resolve import "./DesignGalleryPage"`.

- [ ] **Step 3: Implement the gallery**

`apps/web/src/features/design-gallery/DesignGalleryPage.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DateMark,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Polaroid,
  TextField,
  tiltFor,
  type PolaroidLod,
} from '../../shared/ui';
import { SAMPLE_PEOPLE, SampleFamilyBoard } from '../home';

const COLOR_TOKENS = [
  'paper',
  'paper-grid',
  'surface',
  'ink',
  'ink-muted',
  'line',
  'line-strong',
  'stamp',
  'on-stamp',
  'accent',
  'on-accent',
  'success',
  'photo',
  'photo-ink',
  'photo-muted',
  'photo-stamp',
  'sticker',
  'on-sticker',
  'thread',
  'pin',
  'scrim',
] as const;

const TAPE_TOKENS = [
  'tape-progenitor',
  'tape-1',
  'tape-2',
  'tape-3',
  'tape-4',
  'tape-5',
  'tape-6',
  'tape-in-law',
  'tape-loose',
] as const;

const LODS = [
  { lod: 'full', labelKey: 'designGallery.photos.full' },
  { lod: 'label', labelKey: 'designGallery.photos.label' },
  { lod: 'strip', labelKey: 'designGallery.photos.strip' },
] as const satisfies ReadonlyArray<{ lod: PolaroidLod; labelKey: string }>;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line pt-8">
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Swatch({ token }: { token: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="size-10 shrink-0 rounded-control border border-line"
        style={{ backgroundColor: `var(--${token})` }}
      />
      <code className="font-mono text-sm">--{token}</code>
    </li>
  );
}

export function DesignGalleryPage() {
  const { t } = useTranslation();
  const progenitor = SAMPLE_PEOPLE[0];

  return (
    <div className="flex flex-col gap-12">
      <header className="max-w-2xl">
        <h1 className="text-4xl font-bold">{t('designGallery.title')}</h1>
        <p className="mt-3 text-lg text-ink-muted">{t('designGallery.intro')}</p>
      </header>

      <Section id="gallery-colors" title={t('designGallery.sections.colors')}>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4">
          {[...COLOR_TOKENS, ...TAPE_TOKENS].map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </ul>
      </Section>

      <Section id="gallery-type" title={t('designGallery.sections.type')}>
        <div className="flex flex-col gap-4">
          <p className="text-4xl font-bold tracking-tight">{t('designGallery.type.display')}</p>
          <p className="max-w-prose text-base">{t('designGallery.type.body')}</p>
          <p className="font-hand text-2xl">{t('designGallery.type.hand')}</p>
          <p className="font-mono text-sm">{t('designGallery.type.mono')}</p>
        </div>
      </Section>

      <Section id="gallery-controls" title={t('designGallery.sections.controls')}>
        <div className="flex flex-wrap gap-3">
          <Button>{t('designGallery.controls.primary')}</Button>
          <Button variant="secondary">{t('designGallery.controls.secondary')}</Button>
          <Button variant="ghost">{t('designGallery.controls.ghost')}</Button>
          <Button variant="danger">{t('designGallery.controls.danger')}</Button>
          <Button disabled>{t('designGallery.controls.primary')}</Button>
        </div>
        <div className="mt-8 grid max-w-2xl gap-6 sm:grid-cols-2">
          <TextField
            label={t('designGallery.controls.nameLabel')}
            hint={t('designGallery.controls.nameHint')}
          />
          <TextField
            label={t('designGallery.controls.dateLabel')}
            defaultValue="30/10"
            error={t('designGallery.controls.dateError')}
          />
        </div>
      </Section>

      <Section id="gallery-dialog" title={t('designGallery.sections.dialog')}>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">{t('designGallery.dialog.open')}</Button>
          </DialogTrigger>
          <DialogContent
            title={t('designGallery.dialog.title')}
            description={t('designGallery.dialog.body')}
          >
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="secondary">{t('designGallery.dialog.cancel')}</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="danger">{t('designGallery.dialog.confirm')}</Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </Section>

      <Section id="gallery-photos" title={t('designGallery.sections.photos')}>
        {progenitor ? (
          <ul className="flex flex-wrap items-start gap-12">
            {LODS.map(({ lod, labelKey }) => (
              <li key={lod} className="flex flex-col items-start gap-5">
                <span className="text-sm text-ink-muted">{t(labelKey)}</span>
                <Polaroid
                  name={progenitor.name}
                  label={t('scrapbook.personLabel', {
                    name: progenitor.name,
                    years: progenitor.years,
                  })}
                  lifeYears={progenitor.years}
                  tape={progenitor.tape}
                  tilt={tiltFor(progenitor.id)}
                  lod={lod}
                  marks={
                    <DateMark kind="death-anniversary">
                      {t('scrapbook.deathAnniversary', { date: '15/10' })}
                    </DateMark>
                  }
                />
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section id="gallery-marks" title={t('designGallery.sections.marks')}>
        <div className="flex items-center gap-8">
          <DateMark kind="death-anniversary">
            {t('scrapbook.deathAnniversary', { date: '15/10' })}
          </DateMark>
          <DateMark kind="birthday">{t('scrapbook.birthday', { date: '21/11' })}</DateMark>
        </div>
        <p className="mt-4 text-sm text-ink-muted">{t('designGallery.marks.note')}</p>
      </Section>

      <Section id="gallery-threads" title={t('designGallery.sections.threads')}>
        <div className="overflow-x-auto pb-2">
          <SampleFamilyBoard />
        </div>
        <p className="mt-4 text-sm text-ink-muted">{t('designGallery.threads.note')}</p>
      </Section>
    </div>
  );
}
```

`apps/web/src/features/design-gallery/index.ts`:

```ts
export { DesignGalleryPage } from './DesignGalleryPage';
```

Run: `pnpm vitest run --project web src/features/design-gallery`
Expected: PASS (4 tests).

- [ ] **Step 4: Add the route and the navigation link**

In `apps/web/src/app/routes.tsx`, make three changes:
1. Add the lazy import.
2. Add the route between the index route and `*`.
3. Change the import line to include `lazy`.

The full file becomes:

```tsx
import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { HomePage } from '../features/home';
import { AppShell } from './AppShell';
import { NotFoundPage } from './NotFoundPage';
import { RouteError } from './RouteError';

// The gallery is a separate chunk: visitors of the home page never download it.
const DesignGalleryPage = lazy(() =>
  import('../features/design-gallery').then((module) => ({ default: module.DesignGalleryPage })),
);

/** Shared by the browser router (App) and memory routers in tests (renderRoute). */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'design', element: <DesignGalleryPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
```

In `apps/web/src/app/AppShell.tsx`, add a second item to the navigation list:

```tsx
              <li>
                <NavLink to="/design" className={navLinkClass}>
                  {t('nav.designGallery')}
                </NavLink>
              </li>
```

Add this test inside the `describe` of `apps/web/src/app/AppShell.test.tsx`:

```tsx
  it('opens the design gallery from the navigation', async () => {
    renderRoute('/design');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bộ thiết kế' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bộ thiết kế' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
```

Run: `pnpm vitest run --project web src/app`
Expected: PASS.

- [ ] **Step 5: Run the full check, try it in the browser, and commit**

Run: `pnpm format && pnpm check`
Expected: PASS. The build output lists a separate chunk for the gallery.

Run `pnpm dev`, open http://localhost:5173/design and check:
- every section is there;
- the dialog opens and closes;
- both themes look right.

Stop the dev server.

```bash
git add apps/web
git commit -m "feat(web): add the /design gallery with tokens, type, controls and scrapbook pieces

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Content-Security-Policy and Playwright checks (screenshots, axe, fonts, theme, motion)

**Files:**
- Modify: `netlify.toml`, `package.json` (root), `eslint.config.js`, `.github/workflows/ci.yml`
- Create: `playwright.config.ts`, `e2e/tsconfig.json`, `e2e/design-system.spec.ts`

**Interfaces:**
- Consumes: the built web app (`pnpm --filter @ancestors-tree/web build` / `preview`), plus routes `/` and `/design`.
- Produces:
  - the root scripts `pnpm e2e` and `pnpm typecheck`; `typecheck` now also checks `e2e/`;
  - screenshots in `test-results/screenshots/<project>-<page>-<theme>.png`;
  - a CI job `e2e` that uploads the screenshots as the artifact `playwright-screenshots`.

- [ ] **Step 1: Add the CSP to Netlify**

In `netlify.toml`, add the policy to the existing `[[headers]] for = "/*"` block:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "DENY"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
    # Everything is self-hosted (fonts included). 'unsafe-inline' for styles only: React style
    # attributes (card positions, tilt, tape colors) and Radix positioning need it.
    Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
```

- [ ] **Step 2: Install Playwright**

```bash
pnpm add -Dw @playwright/test@^1.65.0 @axe-core/playwright@^4.14.0
pnpm exec playwright install chromium
```

In the root `package.json`:
- add the script `"e2e": "playwright test"`;
- change `typecheck` to `"pnpm -r run typecheck && tsc --noEmit -p e2e/tsconfig.json"`.

In `eslint.config.js`, extend the global ignores:

```js
  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    '**/dev-dist/**',
    '.superpowers/**',
    'playwright-report/**',
    'test-results/**',
  ]),
```

- [ ] **Step 3: Configure Playwright**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // The production build, served by `vite preview` (same files Netlify serves).
    command:
      'pnpm --filter @ancestors-tree/web build && pnpm --filter @ancestors-tree/web preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
```

`e2e/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["es2024", "dom", "dom.iterable"],
    "types": ["node"]
  },
  "include": ["./**/*.ts", "../playwright.config.ts"]
}
```

- [ ] **Step 4: Write the end-to-end checks**

`e2e/design-system.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PAGES = [
  { name: 'home', path: '/', heading: 'Gia phả nhà mình, dán từng tấm ảnh.' },
  { name: 'design', path: '/design', heading: 'Bộ thiết kế' },
] as const;

const THEMES = ['light', 'dark'] as const;

const CSP = /Content-Security-Policy = "([^"]+)"/.exec(
  readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8'),
)?.[1];

async function mockHealthyApi(page: Page): Promise<void> {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', version: '0.1.0', uptimeSeconds: 1 } }),
  );
}

async function presetTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem('ancestors-tree:theme', value);
  }, theme);
}

for (const { name, path, heading } of PAGES) {
  for (const theme of THEMES) {
    test(`${name} page, ${theme} theme: screenshot and accessibility`, async ({ page }, testInfo) => {
      await mockHealthyApi(page);
      await presetTheme(page, theme);
      await page.goto(path);

      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByText('Máy chủ đang hoạt động (phiên bản 0.1.0)')).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      await page.screenshot({
        path: `test-results/screenshots/${testInfo.project.name}-${name}-${theme}.png`,
        fullPage: true,
      });

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const serious = results.violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`);
      expect(serious).toEqual([]);
    });
  }
}

test('loads all three typefaces, including the Vietnamese subset', async ({ page }) => {
  await mockHealthyApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((face) => face.status === 'loaded')
      .map((face) => ({ family: face.family.replaceAll('"', ''), range: face.unicodeRange }));
  });

  const families = new Set(loaded.map((face) => face.family));
  expect([...families]).toEqual(
    expect.arrayContaining(['Be Vietnam Pro', 'Patrick Hand', 'JetBrains Mono']),
  );
  // "Gia phả" in the heading needs U+1EA3, which only the vietnamese subset contains.
  expect(
    loaded.some((face) => face.family === 'Be Vietnam Pro' && face.range.includes('U+1EA0')),
  ).toBe(true);
});

test('remembers the chosen theme after a reload', async ({ page }) => {
  await mockHealthyApi(page);
  await page.goto('/');
  await page.locator('label', { has: page.getByRole('radio', { name: 'Tối' }) }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Tối' })).toBeChecked();
});

test('the skip link is the first thing keyboard users reach', async ({ page }) => {
  await mockHealthyApi(page);
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Bỏ qua, tới nội dung chính' })).toBeFocused();
});

test('turns animations off when the user asks for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockHealthyApi(page);
  await page.goto('/design');
  await page.getByRole('button', { name: 'Mở hộp thoại mẫu' }).click();

  const dialog = page.getByRole('dialog', { name: 'Xoá Cô Hà khỏi cây?' });
  await expect(dialog).toBeVisible();
  const seconds = await dialog.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).animationDuration),
  );
  expect(seconds).toBeLessThan(0.01);
});

test('runs under the production Content-Security-Policy without violations', async ({ page }) => {
  expect(CSP, 'Content-Security-Policy in netlify.toml').toBeTruthy();

  // Serve every document with the same CSP header that Netlify adds in production.
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    return route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': CSP ?? '' },
    });
  });
  await mockHealthyApi(page);

  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
      violations.push(message.text());
    }
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Bộ thiết kế' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bộ thiết kế' })).toBeVisible();
  await page.getByRole('button', { name: 'Mở hộp thoại mẫu' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  expect(violations).toEqual([]);
});
```

- [ ] **Step 5: Run the checks**

Run: `pnpm e2e`
Expected: PASS, 18 tests (9 per project). `test-results/screenshots/` contains 8 PNG files.

If axe reports a violation, fix the cause in the component or token, add a unit test for it where possible, and re-run. Never filter a rule out.

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Run the e2e checks in CI**

Append this job to `.github/workflows/ci.yml`, at the same level as `check`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: playwright-screenshots
          path: |
            test-results/screenshots/
            playwright-report/
          retention-days: 14
```

- [ ] **Step 7: Run the full check and commit**

Run: `pnpm format && pnpm check && pnpm e2e`
Expected: PASS.

```bash
git add netlify.toml package.json pnpm-lock.yaml eslint.config.js playwright.config.ts e2e .github/workflows/ci.yml
git commit -m "test: add CSP and Playwright checks for screenshots, axe, fonts, theme and motion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Anti-slop review, design-system docs and ADR

**Files:**
- Create: `docs/design-system.md`, `docs/adr/0004-scrapbook-design-system.md`, `docs/design/screenshots/*.png`
- Modify: `docs/deployment.md`, `docs/superpowers/plans/2026-11-12-roadmap.md`, `README.md`

**Interfaces:**
- Consumes: the screenshots from Task 11 and spec §13.3.
- Produces: the documented design system, ADR 0004, the anti-slop review result (spec S9) and the ticked P2 carry-over items.

- [ ] **Step 1: Capture the reference screenshots**

```bash
pnpm e2e
mkdir -p docs/design/screenshots
cp test-results/screenshots/desktop-home-light.png test-results/screenshots/desktop-home-dark.png test-results/screenshots/desktop-design-light.png test-results/screenshots/desktop-design-dark.png test-results/screenshots/mobile-home-light.png docs/design/screenshots/
```

Expected: five PNG files in `docs/design/screenshots/`.

- [ ] **Step 2: Run the anti-slop review**

Invoke the `design-taste-frontend` skill on the five screenshots and the §13.3 checklist. Record each checklist item as **pass** or **fix** in the table of Step 4. For every **fix**:
- change the code in the smallest possible way;
- add or adjust a unit test when the issue is testable (a token, a class, a label);
- re-run `pnpm check && pnpm e2e`;
- refresh the screenshots with Step 1's commands;
- commit with `fix(web): <what> (anti-slop review)` and the trailer.

The review is done when every item is **pass**.

- [ ] **Step 3: Write ADR 0004**

`docs/adr/0004-scrapbook-design-system.md`:

```markdown
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
```

- [ ] **Step 4: Write the design-system guide**

`docs/design-system.md` must contain the following sections. Write them as prose and tables, without code fences.

1. **Overview.** One paragraph on the "family scrapbook" direction. Link to spec §13.3, ADR 0004 and the live `/design` page.
2. **Where things live.**

   | Path | Contents |
   |---|---|
   | `tokens.css` | tokens |
   | `styles/index.css` | base layer, utilities, reduced motion |
   | `styles/fonts.ts` | fonts |
   | `shared/ui/*` | components |
   | `shared/ui/scrapbook/*` | scrapbook primitives |
   | `shared/ui/theme/*` | theme |

3. **Tokens.**
   - Copy the color table from spec §13.3.
   - List the utilities each token produces (`bg-*`, `text-*`, `border-*`, `stroke-*`, `fill-*`).
   - Say how to add a token: tokens.css, then the dark block, then `@theme inline`, then a contrast pair in `tokens.test.ts`, then the gallery list.
4. **Typography.** The three families, where each one is allowed, the weights that are loaded and the heading style.
5. **Components.**
   - Button variants and sizes, including when to use `danger`.
   - TextField label, hint and error behaviour.
   - Dialog, which always needs a `title`.
6. **Scrapbook primitives.**
   - Polaroid LOD sizes and zoom thresholds (spec §7.4).
   - `TapeKind`.
   - `tiltFor`.
   - DateMark kinds.
   - Thread and Stitch geometry (`PIN_OFFSET`, `THREAD_DROP`, `stitchEnds`).
7. **Theme and motion.**
   - The storage key `ancestors-tree:theme`.
   - How the first paint avoids a flash.
   - `useReducedMotion`.
   - Duration tokens.
8. **Accessibility rules.**
   - Focus outline.
   - Contrast thresholds.
   - Icons must use `aria-hidden` with a labelled control.
   - Card `label` content (name, years, generation).
9. **Anti-slop review (S9).** A table with one row per §13.3 checklist item, the result (pass) and the evidence (a screenshot, a test name or a file). Below the table, embed the five screenshots from `docs/design/screenshots/` as images with descriptive alt text.

- [ ] **Step 5: Update the deployment guide, roadmap and README**

In `docs/deployment.md`, in the "What `netlify.toml` sets" table, replace the "Security headers" row with:

```markdown
| Security headers  | `nosniff`, `X-Frame-Options: DENY`, referrer and permissions policy, Content-Security-Policy (self-hosted scripts, styles, fonts and images only) | baseline hardening; `e2e/design-system.spec.ts` replays the CSP against the built app |
```

Then add this note under "Notes" in section 1 (Render):

```markdown
- Open the API reference on the Render URL (`<render-url>/api/docs`). Through the Netlify domain the site-wide CSP blocks the Scalar CDN script until P3 gives `/api/docs` its own policy.
```

In `docs/superpowers/plans/2026-11-12-roadmap.md`, tick (`- [x]`) all five items under "P2 — Design system".

In `README.md`:
- Add `· [Design system](docs/design-system.md)` to the "More:" line.
- Add this bullet to "Highlights (planned)", right after "Large, smooth trees":

```markdown
- **Family-scrapbook design** — polaroids on grid paper; tape color shows the branch, threads join parents and children, stamps mark death anniversaries (light and dark themes, WCAG AA)
```

- [ ] **Step 6: Run the final check and commit**

Run: `pnpm format && pnpm check && pnpm e2e`
Expected: PASS.

```bash
git add docs README.md
git commit -m "docs: document the scrapbook design system, ADR 0004 and the anti-slop review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Open the pull request**

```bash
git push -u origin feat/p2-design-system
gh pr create --base main --title "P2: scrapbook design system" --body-file - <<'EOF'
## Summary
- "Family scrapbook" design tokens (light/dark), self-hosted Vietnamese-ready fonts, Tailwind v4 with only token colors
- Button, TextField, Dialog (Radix), polaroid with three levels of detail, date marks, threads and stitches
- Router + app shell (skip link, navigation, theme switch, server status), home page with a sample family, `/design` gallery
- CSP in netlify.toml; Playwright screenshots, axe, font, theme, reduced-motion and CSP checks in CI
- P2 carry-over items from the P1 review

## Test plan
- [ ] `pnpm check` green
- [ ] `pnpm e2e` green; screenshots in the `playwright-screenshots` artifact
- [ ] Netlify Deploy Preview: home and `/design` render, no CSP errors in the console, theme switch persists

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Expected: the PR URL is printed. Check the Netlify Deploy Preview by hand, using the checklist in the PR body.
