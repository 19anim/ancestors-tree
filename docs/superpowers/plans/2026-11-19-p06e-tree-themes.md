# P6e Tree Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Families decorate the board: the surface, the polaroid frame, the fastener, and the thread and stitch styles for the whole tree, plus the frame and fastener of one card. Each choice is for the whole clan (an undoable op) or only for me (a saved preference).

**Architecture:**
- **The clan's theme is tree state.** `TreeState.theme` sits next to `progenitorId`. A new `setTreeTheme` op changes it, and `applyOp` gives the inverse. The API stores it in `Clan.theme` inside the op's transaction. So undo, redo, revert and the 409 rebase need no special cases. A card's clan-wide choice is `Person.cardStyle`, changed with `updatePerson`.
- **"Only for me" is a `ViewPreference` document** per (user, clan), read and written through `GET`/`PUT /api/clans/:id/view-preference`. It is not an op and never appears in the history.
- **One pure resolver in `packages/shared`** turns the layers into what is drawn: `resolveCardStyle` (five layers) and `resolveBoardStyle` (layers 3–5).
- **The look is CSS only.** The board root carries `data-surface`, `data-thread` and `data-stitch`. Each card carries `data-frame` and `data-fastener`. Each option is a block of CSS variables in `tokens.css`, with a dark version. Surfaces are repeating CSS gradients: no images, so the CSP stays as it is.
- **Speed.** A theme switch never re-runs the layout. Cards whose resolved style did not change keep their node objects, so their memoised components skip the render.
- **The web side.** The Decorate panel (tree or one card) has an "Apply to: Only me / Whole family" switch:
  - "Whole family" picks go through the existing change runner, so the toast and Undo come for free.
  - "Only me" picks go into the TanStack Query cache at once, and one debounced `PUT` saves them.

**Tech Stack:** Zod 4, Express 5 and Mongoose 9, the route registry (OpenAPI), React 19, Zustand, TanStack Query v5, React Flow (`@xyflow/react`), Tailwind 4 (`@utility`), Radix `ContextMenu`, Vitest with jsdom, Playwright.

## Global Constraints

- **Spec.** All of §13.4, including "Saving" (decided on 2026-11-19). Also §5 (`Clan.theme`, `TreeTheme`, `CardStyle`, `Person.cardStyle`, `ViewPreference`), the §6.1 `setTreeTheme` row, the §3 "Decorate" rows and the §15 rows on themes, in `docs/superpowers/specs/2026-11-11-ancestors-tree-design.md`. The VI twin is `2026-11-11-ancestors-tree-design.vi.md`. Any spec change goes into **both** files in the same commit.
- **One PR.** P10 exports and share links are out of scope. The rule is only noted in ADR 0012: they use the clan-wide layers only, never anyone's `ViewPreference`.
- **Options**, exactly (spec §5, §13.4):
  - surface: `grid-paper` (default), `corkboard`, `fridge`;
  - frame: `classic` (default), `kraft`, `vintage`;
  - fastener: `washi` (default), `pushpin`, `magnet`;
  - thread: `cotton` (default), `yarn`;
  - stitch: `cotton` (default), `yarn`.
- **Matching fastener:** grid-paper → washi, corkboard → pushpin, fridge → magnet.
- **Which choice wins** (spec §13.4). For each card part, the first layer with a value is used:
  1. my card (`ViewPreference.cards[personId]`, when `enabled`);
  2. the clan's card (`Person.cardStyle`);
  3. my tree theme (`ViewPreference.theme`, when `enabled`);
  4. the clan's tree theme (`Clan.theme`);
  5. the default.

  Surface, thread and stitch use layers 3–5 only.
- **Saving:**
  - In "Whole family" mode every pick is its own `setTreeTheme` op and its own undo step. A surface pick sends the surface and its matching fastener in the same op. A card pick is an `updatePerson` op with `cardStyle`, and `null` clears it.
  - In "Only me" mode the board changes at once. The whole `ViewPreference` is saved with one `PUT`, `SAVE_DELAY_MS = 500` after the last pick, and the last save wins. A failed save shows an error with a retry. There is no undo.
  - Any "Only me" pick sets `enabled: true`.
- **The view-preference API:**
  - any member, but only the caller's own document;
  - Zod accepts known option values only, `personId` keys that are ObjectIds, and at most `MAX_PERSONS` (5,000) card entries;
  - card entries for people no longer in the clan are pruned on save;
  - deleting a clan deletes its `ViewPreference` documents.
- **Permissions.** A Viewer's `setTreeTheme` gets 403 through the existing op route (`access: { clanRole: 'editor' }`). No new check is needed, only a test.
- **Rendering:**
  - The fastener is drawn at the `full` LOD only, in the branch colour (`tapeColor(tape)`).
  - Every frame defines `--photo`, `--photo-ink` and `--photo-muted`.
  - Every surface defines `--paper`, `--paper-grid`, `--thread` and `--line-strong`.
  - Colours are `#rrggbb`.
- **Contrast** (`tokens.test.ts`, `contrast.ts`), checked by a unit test in both themes for every surface and every frame:
  - text pairs need WCAG AA 4.5:1;
  - borders, lines, pins and knots need 3:1.
- **Speed.** A theme switch must not re-run `layoutTree`. It must not re-render a card whose resolved style did not change (node objects are reused by `sameNode`).
- **Language:**
  - Code, comments and docs are in English. Vietnamese appears only in `vi.json` and the VI spec.
  - VI strings are natural Vietnamese.
  - No count plurals (one i18n form per message).
  - EN UI strings say "family", never "clan" (the existing EN wording). The spec keeps its own words.
- **Secrets.**
  - Never read, print or edit `apps/api/.env`.
  - No credential-shaped literals in tests or docs: no `user:pass@host` strings.
  - Fake e-mail addresses use `example.test`.
- **Commits.**
  - TDD: write the failing tests first and watch them fail.
  - Use `rtk` before git commands (`rtk git add`, `rtk git commit`) and plain `pnpm` for scripts.
  - One commit per task, through a message file (`rtk git commit -F <file>`). Every message ends exactly with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Checks.**
  - Before each commit, run the covering tests and `pnpm typecheck`.
  - In the last task, run `pnpm check` (format, lint, typecheck, tests with coverage thresholds, `docs:errors:check`, build).
  - A known flake: some web tests time out at 5 s under parallel load. Re-run the failing file alone and report both results.

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/tree/theme.ts` (new) | option lists and schemas, `THEME_DEFAULTS`, `MATCHING_FASTENER`, `TreeTheme`, `TreeThemeChanges`, `CardStyle`, `PersonalTheme`, `ThemeLayers`, `cardPartSource`, `resolveCardStyle`, `resolveBoardStyle` |
| `packages/shared/src/tree/state.ts`, `ops.ts`, `apply-op.ts`, `schemas.ts`, `testing.ts`, `index.ts` (modify) | `TreeState.theme`, the `setTreeTheme` op, `Person.cardStyle`, the property-test command |
| `packages/shared/src/api/viewPreference.ts` (new), `api/tree.ts`, `index.ts` (modify) | `ViewPreferenceSchema`, `EMPTY_VIEW_PREFERENCE`, `TreeResponse.theme` |
| `apps/api/src/models/Clan.ts`, `models/Person.ts`, `tree/dto.ts`, `tree/store.ts`, `routes/tree.ts` (modify) | store and load `Clan.theme` and `Person.cardStyle` |
| `apps/api/src/models/ViewPreference.ts`, `routes/viewPreference.ts` (new) | the "only for me" document and its two routes |
| `apps/api/src/db/indexes.ts`, `clans/scoped.ts`, `app.ts` (modify) | register the model, delete with the clan, mount the routes |
| `apps/web/src/shared/ui/tokens.css`, `styles/index.css` (modify) | option variable blocks, `--yarn`, the `board-grid`, `polaroid-paper`, `fastener`, `thread-*`, `stitch-*` utilities |
| `apps/web/src/shared/ui/tokens.test.ts` (modify) | contrast for every surface and frame in both themes |
| `apps/web/src/shared/ui/scrapbook/Polaroid.tsx`, `Board.tsx`, `Thread.tsx`, `Stitch.tsx` (modify), `ThemeSwatch.tsx` (new) | draw the options; small live previews |
| `apps/web/src/features/design-gallery/DesignGalleryPage.tsx` (modify) | the "Tree themes" section with every option |
| `apps/web/src/features/tree/api.ts`, `store.ts` (modify) | `treeFromResponse` keeps the theme |
| `apps/web/src/features/tree/decorContext.ts` (new) | `PersonalThemeContext`, `useThemeLayers`, `DecorateContext` |
| `apps/web/src/features/tree/flowElements.ts`, `TreeBoard.tsx`, `PersonNode.tsx`, `PersonCard.tsx`, `UnionNode.tsx`, `UnlinkedTray.tsx`, `TreeDnd.tsx` (modify) | resolved styles on the board, with no relayout |
| `apps/web/src/features/tree/changes.ts`, `relateText.ts`, `describeOp.ts` (modify) | the `treeTheme` and `cardStyle` changes, their sentences and history phrases |
| `apps/web/src/features/tree/decor.ts`, `useViewPreference.ts` (new) | pick helpers; the preference query and the debounced save |
| `apps/web/src/features/tree/sidePanel.ts`, `DecoratePanel.tsx`, `ThemeBanner.tsx` (new) | the panel shell, the Decorate panel, the banner and the save error |
| `apps/web/src/features/tree/TreeToolbar.tsx`, `TreePage.tsx`, `CardMenu.tsx`, `ProfilePanel.tsx` (modify) | the entry points and the wiring |
| `apps/web/src/locales/vi.json`, `en.json` (modify) | `tree.decor.*`, `tree.change.*`, `tree.relate.done.*`, `designGallery.*` |
| `e2e/themes.spec.ts`, `docs/adr/0012-tree-themes-in-the-tree-state.md` (new), the roadmap (modify) | e2e, the decision record, the roadmap |

---

### Task 1: Shared theme schemas, the resolver, `setTreeTheme` and `Person.cardStyle`

**Files:**
- Create: `packages/shared/src/tree/theme.ts`, `packages/shared/src/tree/theme.test.ts`
- Create: `packages/shared/src/api/viewPreference.ts`
- Modify: `packages/shared/src/tree/state.ts`, `ops.ts`, `apply-op.ts`, `schemas.ts`, `schemas.test.ts`, `testing.ts`, `index.ts`
- Modify: `packages/shared/src/api/tree.ts`, `packages/shared/src/index.ts`
- Modify: `apps/api/src/models/Person.ts`, `apps/api/src/tree/dto.ts` (so the API still typechecks: every clearable field needs a `PersonRecord` field)
- Modify: `apps/web/src/features/tree/describeOp.ts`, `describeOp.test.ts`, `apps/web/src/locales/vi.json`, `en.json` (the exhaustive switch over op types needs the new case)

**Interfaces:**
- Produces (from `@ancestors-tree/shared/tree`):
  - `SURFACES`, `CARD_FRAMES`, `CARD_FASTENERS`, `LINE_STYLES` (readonly tuples), plus `SurfaceSchema`, `CardFrameSchema`, `CardFastenerSchema`, `LineStyleSchema`;
  - types `Surface`, `CardFrame`, `CardFastener`, `LineStyle`;
  - `THEME_OPTIONS: { surface, frame, fastener, thread, stitch }`, `THEME_PARTS: ThemePart[]`, `type ThemePart`, `type ThemeValue<P extends ThemePart>`;
  - `CARD_PARTS = ['frame', 'fastener']` with `type CardPart`, and `BOARD_PARTS = ['surface', 'thread', 'stitch']` with `type BoardPart`;
  - `THEME_DEFAULTS`, `MATCHING_FASTENER: Record<Surface, CardFastener>`;
  - `TreeThemeSchema` / `type TreeTheme`; `TreeThemeChangesSchema` / `type TreeThemeChanges` (each part `| null`, at least one part); `CardStyleSchema` / `type CardStyle` (at least one of frame and fastener);
  - `interface PersonalTheme { enabled: boolean; theme: TreeTheme; cards: Readonly<Record<string, CardStyle>> }`;
  - `interface ThemeLayers { clan: TreeTheme; mine: PersonalTheme | null }`;
  - `type BoardStyle = { surface: Surface; thread: LineStyle; stitch: LineStyle }` and `type ResolvedCardStyle = { frame: CardFrame; fastener: CardFastener }`;
  - `type ThemeSource = 'myCard' | 'clanCard' | 'myTree' | 'clanTree' | 'default'`;
  - `cardPartSource(layers: ThemeLayers, personId: string, cardStyle: CardStyle | undefined, part: CardPart): ThemeSource`;
  - `resolveCardStyle(layers: ThemeLayers, personId: string, cardStyle?: CardStyle): ResolvedCardStyle`;
  - `resolveBoardStyle(layers: ThemeLayers): BoardStyle`.
- Also produces:
  - `TreeState.theme: TreeTheme`, with `EMPTY_TREE.theme = {}`;
  - `treeStateFromLists(progenitorId, persons, unions, theme: TreeTheme = {})`;
  - the op `{ type: 'setTreeTheme'; payload: { changes: TreeThemeChanges } }`;
  - `Person.cardStyle?: CardStyle` and `PersonChanges.cardStyle?: CardStyle | null`.
- Produces (from `@ancestors-tree/shared`): `ViewPreferenceSchema`, `type ViewPreference` (assignable to `PersonalTheme`), `EMPTY_VIEW_PREFERENCE = { enabled: false, theme: {}, cards: {} }`, and `TreeResponse.theme?: TreeTheme`.
- Produces (web): `OpDescription` kind `'treeTheme'`, and the i18n key `tree.change.treeTheme`.

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/tree/theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ViewPreferenceSchema } from '../api/viewPreference.ts';
import { applyOp } from './apply-op.ts';
import { newObjectId } from './ids.ts';
import { OpSchema, type Op } from './ops.ts';
import { PersonChangesSchema } from './schemas.ts';
import { EMPTY_TREE } from './state.ts';
import {
  CardStyleSchema,
  cardPartSource,
  MATCHING_FASTENER,
  resolveBoardStyle,
  resolveCardStyle,
  THEME_DEFAULTS,
  TreeThemeChangesSchema,
  TreeThemeSchema,
  type PersonalTheme,
} from './theme.ts';

const ID = newObjectId();

function mine(overrides: Partial<PersonalTheme> = {}): PersonalTheme {
  return { enabled: true, theme: {}, cards: {}, ...overrides };
}

describe('theme schemas', () => {
  it('accepts known options only', () => {
    expect(TreeThemeSchema.parse({ surface: 'corkboard', thread: 'yarn' })).toEqual({
      surface: 'corkboard',
      thread: 'yarn',
    });
    expect(TreeThemeSchema.safeParse({ surface: 'chalkboard' }).success).toBe(false);
    expect(TreeThemeSchema.safeParse({ colour: 'red' }).success).toBe(false);
  });

  it('resets a part with null, and needs at least one part', () => {
    expect(TreeThemeChangesSchema.parse({ surface: null })).toEqual({ surface: null });
    expect(TreeThemeChangesSchema.safeParse({}).success).toBe(false);
  });

  it('a card style names a frame or a fastener, and updatePerson clears it with null', () => {
    expect(CardStyleSchema.safeParse({}).success).toBe(false);
    expect(CardStyleSchema.safeParse({ surface: 'fridge' }).success).toBe(false);
    expect(PersonChangesSchema.parse({ cardStyle: null })).toEqual({ cardStyle: null });
    expect(PersonChangesSchema.parse({ cardStyle: { frame: 'kraft' } })).toEqual({
      cardStyle: { frame: 'kraft' },
    });
  });

  it('matches each surface with its fastener, and has a default for every part', () => {
    expect(MATCHING_FASTENER).toEqual({
      'grid-paper': 'washi',
      corkboard: 'pushpin',
      fridge: 'magnet',
    });
    expect(THEME_DEFAULTS).toEqual({
      surface: 'grid-paper',
      frame: 'classic',
      fastener: 'washi',
      thread: 'cotton',
      stitch: 'cotton',
    });
  });
});

describe('ViewPreferenceSchema', () => {
  it('takes ObjectId keys only, and at most 5,000 cards', () => {
    const ok = { enabled: true, theme: {}, cards: { [ID]: { frame: 'vintage' } } };
    expect(ViewPreferenceSchema.safeParse(ok).success).toBe(true);
    const badKey = { enabled: true, theme: {}, cards: { 'not-an-id': { frame: 'vintage' } } };
    expect(ViewPreferenceSchema.safeParse(badKey).success).toBe(false);
    const many = Object.fromEntries(
      Array.from({ length: 5001 }, () => [newObjectId(), { frame: 'kraft' }]),
    );
    expect(ViewPreferenceSchema.safeParse({ enabled: true, theme: {}, cards: many }).success).toBe(
      false,
    );
  });
});

describe('setTreeTheme', () => {
  it('sets parts, resets them with null, and its inverse holds exactly the previous values', () => {
    const op: Op = {
      type: 'setTreeTheme',
      payload: { changes: { surface: 'corkboard', fastener: 'pushpin' } },
    };
    expect(OpSchema.parse(op)).toEqual(op);
    const first = applyOp(EMPTY_TREE, op);
    expect(first.tree.theme).toEqual({ surface: 'corkboard', fastener: 'pushpin' });
    expect(first.inverse).toEqual({
      type: 'setTreeTheme',
      payload: { changes: { surface: null, fastener: null } },
    });

    const second = applyOp(first.tree, {
      type: 'setTreeTheme',
      payload: { changes: { surface: null, thread: 'yarn' } },
    });
    expect(second.tree.theme).toEqual({ fastener: 'pushpin', thread: 'yarn' });
    expect(second.inverse).toEqual({
      type: 'setTreeTheme',
      payload: { changes: { surface: 'corkboard', thread: null } },
    });
    expect(applyOp(second.tree, second.inverse).tree).toEqual(first.tree);
  });

  it('keeps the people and unions objects', () => {
    const { tree } = applyOp(EMPTY_TREE, {
      type: 'setTreeTheme',
      payload: { changes: { stitch: 'yarn' } },
    });
    expect(tree.persons).toBe(EMPTY_TREE.persons);
    expect(tree.unions).toBe(EMPTY_TREE.unions);
  });
});

describe('resolveCardStyle, layer by layer (spec §13.4)', () => {
  const clan = { frame: 'kraft', fastener: 'magnet' } as const;

  it('5: falls back to the defaults', () => {
    const layers = { clan: {}, mine: null };
    expect(resolveCardStyle(layers, ID)).toEqual({ frame: 'classic', fastener: 'washi' });
    expect(cardPartSource(layers, ID, undefined, 'frame')).toBe('default');
  });

  it("4: the clan's tree theme", () => {
    expect(resolveCardStyle({ clan, mine: null }, ID)).toEqual({
      frame: 'kraft',
      fastener: 'magnet',
    });
    expect(cardPartSource({ clan, mine: null }, ID, undefined, 'fastener')).toBe('clanTree');
  });

  it("3: my tree theme beats the clan's, only while enabled", () => {
    const layers = { clan, mine: mine({ theme: { frame: 'vintage' } }) };
    expect(resolveCardStyle(layers, ID)).toEqual({ frame: 'vintage', fastener: 'magnet' });
    expect(cardPartSource(layers, ID, undefined, 'frame')).toBe('myTree');
    const off = { clan, mine: mine({ enabled: false, theme: { frame: 'vintage' } }) };
    expect(resolveCardStyle(off, ID).frame).toBe('kraft');
  });

  it("2: the clan's choice for this card beats both tree themes", () => {
    const layers = { clan, mine: mine({ theme: { frame: 'vintage' } }) };
    expect(resolveCardStyle(layers, ID, { frame: 'classic' })).toEqual({
      frame: 'classic',
      fastener: 'magnet',
    });
    expect(cardPartSource(layers, ID, { frame: 'classic' }, 'frame')).toBe('clanCard');
  });

  it('1: my choice for this card beats everything, part by part', () => {
    const layers = { clan, mine: mine({ cards: { [ID]: { fastener: 'pushpin' } } }) };
    expect(resolveCardStyle(layers, ID, { frame: 'vintage', fastener: 'washi' })).toEqual({
      frame: 'vintage',
      fastener: 'pushpin',
    });
    expect(cardPartSource(layers, ID, { fastener: 'washi' }, 'fastener')).toBe('myCard');
    // Another card has no entry of its own.
    expect(resolveCardStyle(layers, newObjectId()).fastener).toBe('magnet');
  });

  it('never reads a card entry from Object.prototype', () => {
    expect(resolveCardStyle({ clan: {}, mine: mine() }, 'constructor')).toEqual({
      frame: 'classic',
      fastener: 'washi',
    });
  });
});

describe('resolveBoardStyle (layers 3–5)', () => {
  it("uses my tree theme while enabled, then the clan's, then the defaults", () => {
    expect(resolveBoardStyle({ clan: {}, mine: null })).toEqual({
      surface: 'grid-paper',
      thread: 'cotton',
      stitch: 'cotton',
    });
    expect(resolveBoardStyle({ clan: { surface: 'fridge', stitch: 'yarn' }, mine: null })).toEqual({
      surface: 'fridge',
      thread: 'cotton',
      stitch: 'yarn',
    });
    const layers = {
      clan: { surface: 'fridge' as const },
      mine: mine({ theme: { surface: 'corkboard', thread: 'yarn' } }),
    };
    expect(resolveBoardStyle(layers)).toEqual({
      surface: 'corkboard',
      thread: 'yarn',
      stitch: 'cotton',
    });
    const off = {
      clan: { surface: 'fridge' as const },
      mine: mine({ enabled: false, theme: { surface: 'corkboard' } }),
    };
    expect(resolveBoardStyle(off).surface).toBe('fridge');
  });
});
```

In `packages/shared/src/tree/schemas.test.ts`:
- The CLEARABLE list becomes `['bio', 'birth', 'birthFamily', 'branch', 'burialPlace', 'cardStyle', 'photo', 'siblingOrder']`.
- The `EMPTY_TREE` expectation becomes `{ progenitorId: null, persons: {}, unions: {}, theme: {} }`.

In `apps/web/src/features/tree/describeOp.test.ts`, add to the first test:

```ts
    expect(say({ type: 'setTreeTheme', payload: { changes: { surface: 'fridge' } } })).toBe(
      'đổi chủ đề cây',
    );
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --dir packages/shared exec vitest run src/tree/theme.test.ts src/tree/schemas.test.ts`
Expected: FAIL. `theme.ts` and `viewPreference.ts` do not exist, and the CLEARABLE list and `EMPTY_TREE` differ.

- [ ] **Step 3: Implement**

`packages/shared/src/tree/theme.ts`:

```ts
import { z } from 'zod';

/** The first option set of spec §13.4. The first value of each list is the default. */
export const SURFACES = ['grid-paper', 'corkboard', 'fridge'] as const;
export const CARD_FRAMES = ['classic', 'kraft', 'vintage'] as const;
export const CARD_FASTENERS = ['washi', 'pushpin', 'magnet'] as const;
export const LINE_STYLES = ['cotton', 'yarn'] as const;

export const SurfaceSchema = z.enum(SURFACES);
export const CardFrameSchema = z.enum(CARD_FRAMES);
export const CardFastenerSchema = z.enum(CARD_FASTENERS);
export const LineStyleSchema = z.enum(LINE_STYLES);

export type Surface = z.infer<typeof SurfaceSchema>;
export type CardFrame = z.infer<typeof CardFrameSchema>;
export type CardFastener = z.infer<typeof CardFastenerSchema>;
export type LineStyle = z.infer<typeof LineStyleSchema>;

/** Every part of a theme and its options, in the order the Decorate panel lists them. */
export const THEME_OPTIONS = {
  surface: SURFACES,
  frame: CARD_FRAMES,
  fastener: CARD_FASTENERS,
  thread: LINE_STYLES,
  stitch: LINE_STYLES,
} as const;

export type ThemePart = keyof typeof THEME_OPTIONS;
export type ThemeValue<P extends ThemePart> = (typeof THEME_OPTIONS)[P][number];
export const THEME_PARTS = Object.keys(THEME_OPTIONS) as ThemePart[];

/** The parts one card can choose for itself. */
export const CARD_PARTS = ['frame', 'fastener'] as const;
export type CardPart = (typeof CARD_PARTS)[number];

/** The parts that belong to the whole board: a thread or stitch joins two people. */
export const BOARD_PARTS = ['surface', 'thread', 'stitch'] as const;
export type BoardPart = (typeof BOARD_PARTS)[number];

export const THEME_DEFAULTS = {
  surface: 'grid-paper',
  frame: 'classic',
  fastener: 'washi',
  thread: 'cotton',
  stitch: 'cotton',
} as const satisfies { [P in ThemePart]: ThemeValue<P> };

/** Choosing a surface also picks its fastener (spec §13.4); it can be changed afterwards. */
export const MATCHING_FASTENER: Record<Surface, CardFastener> = {
  'grid-paper': 'washi',
  corkboard: 'pushpin',
  fridge: 'magnet',
};

/** A tree theme (spec §5): every part optional; a missing part falls through to the next layer. */
export const TreeThemeSchema = z.strictObject({
  surface: SurfaceSchema.optional(),
  frame: CardFrameSchema.optional(),
  fastener: CardFastenerSchema.optional(),
  thread: LineStyleSchema.optional(),
  stitch: LineStyleSchema.optional(),
});
export type TreeTheme = z.infer<typeof TreeThemeSchema>;

/** The parts a `setTreeTheme` op changes; null resets a part to the default (spec §6.1). */
export const TreeThemeChangesSchema = z
  .strictObject({
    surface: SurfaceSchema.nullable().optional(),
    frame: CardFrameSchema.nullable().optional(),
    fastener: CardFastenerSchema.nullable().optional(),
    thread: LineStyleSchema.nullable().optional(),
    stitch: LineStyleSchema.nullable().optional(),
  })
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), {
    message: 'Send at least one part to change',
  });
export type TreeThemeChanges = z.infer<typeof TreeThemeChangesSchema>;

/** One card's own choice (spec §5). Removing the last part removes the style. */
export const CardStyleSchema = z
  .strictObject({
    frame: CardFrameSchema.optional(),
    fastener: CardFastenerSchema.optional(),
  })
  .refine((style) => style.frame !== undefined || style.fastener !== undefined, {
    message: 'A card style names a frame or a fastener',
  });
export type CardStyle = z.infer<typeof CardStyleSchema>;

/** "Only for me": one member's own decoration of one clan (spec §5 `ViewPreference`). */
export interface PersonalTheme {
  enabled: boolean;
  theme: TreeTheme;
  cards: Readonly<Record<string, CardStyle>>;
}

/** The layers of spec §13.4 that do not live on the card itself. */
export interface ThemeLayers {
  /** The clan's tree theme (`Clan.theme`). */
  clan: TreeTheme;
  /** My own choices; null where nobody's own choices apply (exports and share links, P10). */
  mine: PersonalTheme | null;
}

export type BoardStyle = { surface: Surface; thread: LineStyle; stitch: LineStyle };
export type ResolvedCardStyle = { frame: CardFrame; fastener: CardFastener };

/** The layer a card part's value comes from (spec §13.4, steps 1–5). */
export type ThemeSource = 'myCard' | 'clanCard' | 'myTree' | 'clanTree' | 'default';

function activeMine(layers: ThemeLayers): PersonalTheme | null {
  return layers.mine !== null && layers.mine.enabled ? layers.mine : null;
}

function myCardStyle(mine: PersonalTheme | null, personId: string): CardStyle | undefined {
  return mine !== null && Object.hasOwn(mine.cards, personId) ? mine.cards[personId] : undefined;
}

export function cardPartSource(
  layers: ThemeLayers,
  personId: string,
  cardStyle: CardStyle | undefined,
  part: CardPart,
): ThemeSource {
  const mine = activeMine(layers);
  if (myCardStyle(mine, personId)?.[part] !== undefined) return 'myCard';
  if (cardStyle?.[part] !== undefined) return 'clanCard';
  if (mine?.theme[part] !== undefined) return 'myTree';
  if (layers.clan[part] !== undefined) return 'clanTree';
  return 'default';
}

function cardPart<P extends CardPart>(
  layers: ThemeLayers,
  personId: string,
  cardStyle: CardStyle | undefined,
  part: P,
): ThemeValue<P> {
  const mine = activeMine(layers);
  const value =
    myCardStyle(mine, personId)?.[part] ??
    cardStyle?.[part] ??
    mine?.theme[part] ??
    layers.clan[part] ??
    THEME_DEFAULTS[part];
  return value as ThemeValue<P>;
}

/** A card's frame and fastener: a card beats the whole tree, and mine beats the clan's. */
export function resolveCardStyle(
  layers: ThemeLayers,
  personId: string,
  cardStyle?: CardStyle,
): ResolvedCardStyle {
  return {
    frame: cardPart(layers, personId, cardStyle, 'frame'),
    fastener: cardPart(layers, personId, cardStyle, 'fastener'),
  };
}

/** The board's surface and line styles: my tree theme, the clan's, the default (steps 3–5). */
export function resolveBoardStyle(layers: ThemeLayers): BoardStyle {
  const mine = activeMine(layers)?.theme;
  const pick = <P extends BoardPart>(part: P): ThemeValue<P> =>
    (mine?.[part] ?? layers.clan[part] ?? THEME_DEFAULTS[part]) as ThemeValue<P>;
  return { surface: pick('surface'), thread: pick('thread'), stitch: pick('stitch') };
}
```

`packages/shared/src/tree/state.ts`: import `type TreeTheme` from `./theme.ts` and change:

```ts
export interface TreeState {
  readonly progenitorId: string | null;
  readonly persons: Readonly<Record<string, Person>>;
  readonly unions: Readonly<Record<string, Union>>;
  /** The clan's shared tree theme (spec §13.4): changed by `setTreeTheme`, saved on the Clan. */
  readonly theme: TreeTheme;
}

export const EMPTY_TREE: TreeState = { progenitorId: null, persons: {}, unions: {}, theme: {} };

export function treeStateFromLists(
  progenitorId: string | null,
  persons: readonly Person[],
  unions: readonly Union[],
  theme: TreeTheme = {},
): TreeState {
  return {
    progenitorId,
    persons: Object.fromEntries(persons.map((person) => [person.id, person])),
    unions: Object.fromEntries(unions.map((union) => [union.id, union])),
    theme,
  };
}
```

`packages/shared/src/tree/schemas.ts`:
- Import `CardStyleSchema` from `./theme.ts`.
- In the comment above `PersonSchema`, drop "`cardStyle` (P6e, tree themes)" from the "arrive with their features" sentence, keeping `treeLink` (P10).
- Add `cardStyle: CardStyleSchema.optional(),` as the last field of `PersonSchema`, with the comment `/** The clan's own choice for this card (spec §13.4); cleared with null. */`.
- Add `cardStyle: CardStyleSchema.nullable().optional(),` as the last field of `PersonChangesSchema`.

`packages/shared/src/tree/ops.ts`: import `TreeThemeChangesSchema` from `./theme.ts`. Add the schema after `SetProgenitorOpSchema`, and add it to the end of `SINGLE_OP_SCHEMAS`:

```ts
/** The clan's tree theme (spec §6.1, §13.4). Editors and the Owner, like any edit. */
const SetTreeThemeOpSchema = z.object({
  type: z.literal('setTreeTheme'),
  payload: z.object({ changes: TreeThemeChangesSchema }),
});
```

`packages/shared/src/tree/apply-op.ts`:
- Import `type TreeTheme, type TreeThemeChanges` from `./theme.ts`.
- Add this function after `setProgenitor`, and the case `case 'setTreeTheme': return setTreeTheme(tree, op.payload.changes);` to `applySingle`:

```ts
function setTreeTheme(tree: TreeState, changes: TreeThemeChanges): SingleResult {
  const current = tree.theme as Record<string, unknown>;
  const next: Record<string, unknown> = { ...tree.theme };
  const previous: Record<string, unknown> = {};
  for (const [part, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    // As in updatePerson: null resets a part, and an absent old value goes back as null.
    previous[part] = current[part] ?? null;
    if (value === null) delete next[part];
    else next[part] = value;
  }
  return {
    tree: { ...tree, theme: next as TreeTheme },
    inverse: { type: 'setTreeTheme', payload: { changes: previous as TreeThemeChanges } },
  };
}
```

`packages/shared/src/tree/testing.ts`:
- Import `LINE_STYLES, SURFACES, type LineStyle, type Surface` from `./theme.ts`.
- Add to `TreeCommand`:
  `| { kind: 'setTreeTheme'; surface: Surface | null; thread: LineStyle | null }`
- Add this arm to `treeCommand`, after `setProgenitor`:

```ts
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('setTreeTheme' as const),
      surface: fc.option(fc.constantFrom(...SURFACES)),
      thread: fc.option(fc.constantFrom(...LINE_STYLES)),
    }),
  },
```

- Add this case to `treeCommandOp`, before `undo`:

```ts
    case 'setTreeTheme':
      return {
        type: 'setTreeTheme',
        payload: { changes: { surface: cmd.surface, thread: cmd.thread } },
      };
```

`packages/shared/src/tree/index.ts`: export the new names from `./theme.ts`:
- the values `BOARD_PARTS`, `CARD_FASTENERS`, `CARD_FRAMES`, `CARD_PARTS`, `CardFastenerSchema`, `CardFrameSchema`, `CardStyleSchema`, `cardPartSource`, `LINE_STYLES`, `LineStyleSchema`, `MATCHING_FASTENER`, `resolveBoardStyle`, `resolveCardStyle`, `SURFACES`, `SurfaceSchema`, `THEME_DEFAULTS`, `THEME_OPTIONS`, `THEME_PARTS`, `TreeThemeChangesSchema`, `TreeThemeSchema`;
- every type: `BoardPart`, `BoardStyle`, `CardFastener`, `CardFrame`, `CardPart`, `CardStyle`, `LineStyle`, `PersonalTheme`, `ResolvedCardStyle`, `Surface`, `ThemeLayers`, `ThemePart`, `ThemeSource`, `ThemeValue`, `TreeTheme`, `TreeThemeChanges`.

`packages/shared/src/api/viewPreference.ts`:

```ts
import { z } from 'zod';
import { MAX_PERSONS } from '../tree/schemas.ts';
import { CardStyleSchema, TreeThemeSchema } from '../tree/theme.ts';
import { IdSchema } from './common.ts';

/** GET/PUT /api/clans/:id/view-preference: my own decoration of one clan (spec §5, §13.4). */
export const ViewPreferenceSchema = z.strictObject({
  /** false = "Back to the shared theme", keeping the choices. */
  enabled: z.boolean(),
  theme: TreeThemeSchema,
  cards: z
    .record(IdSchema, CardStyleSchema)
    .refine((cards) => Object.keys(cards).length <= MAX_PERSONS, {
      message: `At most ${MAX_PERSONS} cards`,
    }),
});

export type ViewPreference = z.infer<typeof ViewPreferenceSchema>;

/** What a member who never decorated has. */
export const EMPTY_VIEW_PREFERENCE: ViewPreference = { enabled: false, theme: {}, cards: {} };
```

`packages/shared/src/api/tree.ts`: import `TreeThemeSchema` from `../tree/theme.ts` and add to `TreeResponseSchema`:

```ts
  /** The clan's tree theme. Always sent; optional so older payloads and fixtures still parse. */
  theme: TreeThemeSchema.optional(),
```

`packages/shared/src/index.ts`: add
`export { EMPTY_VIEW_PREFERENCE, ViewPreferenceSchema, type ViewPreference } from './api/viewPreference.ts';`

`apps/api/src/models/Person.ts`: add `cardStyle: { type: Schema.Types.Mixed },` after `photo`.
`apps/api/src/tree/dto.ts`: add `cardStyle?: Person['cardStyle'] | null;` to `PersonRecord`, after `photo`. `toPerson` and `personWrite` already loop over `CLEARABLE_PERSON_FIELDS`.

`apps/web/src/features/tree/describeOp.ts`:
- Add `| { kind: 'treeTheme' }` to `OpDescription`.
- Add `case 'setTreeTheme': return { kind: 'treeTheme' };` to `describeSingle`.
- Add `case 'treeTheme': return t('tree.change.treeTheme');` to `describeAction`.

Locales, under `tree.change`:
- `vi.json`: `"treeTheme": "đổi chủ đề cây"`.
- `en.json`: `"treeTheme": "change the tree's theme"`.

- [ ] **Step 4: Run the tests and the typecheck**

Run:
- `pnpm --dir packages/shared exec vitest run src/tree`
- `pnpm --dir apps/api exec vitest run src/tree/dto.test.ts`
- `pnpm --dir apps/web exec vitest run src/features/tree/describeOp.test.ts src/locales`
- `pnpm typecheck`

Expected: PASS. The property test now also makes `setTreeTheme` ops, and their inverses restore the tree exactly.

If `pnpm typecheck` names a `TreeState` literal without `theme` anywhere else, add `theme: {}` there.

- [ ] **Step 5: Commit**

Message file `.superpowers/sdd/p6e-task-1-commit.txt`, subject `feat(shared): tree theme schemas, setTreeTheme and the theme resolver`. The body:
- `TreeState.theme` and the `setTreeTheme` op, whose inverse holds the previous values of exactly the changed parts;
- `Person.cardStyle` (clearable), `ViewPreferenceSchema` and `TreeResponse.theme`;
- `resolveCardStyle` and `resolveBoardStyle` follow the five layers of spec §13.4, with a test per layer;
- the history phrase for `setTreeTheme`.

End the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

```bash
rtk git add packages/shared apps/api/src/models/Person.ts apps/api/src/tree/dto.ts apps/web/src/features/tree/describeOp.ts apps/web/src/features/tree/describeOp.test.ts apps/web/src/locales
rtk git commit -F .superpowers/sdd/p6e-task-1-commit.txt
```

---

### Task 2: The API stores the clan's theme and card styles through ops

**Files:**
- Modify: `apps/api/src/models/Clan.ts`, `apps/api/src/tree/store.ts`, `apps/api/src/routes/tree.ts`
- Test: `apps/api/src/routes/tree.test.ts`, `apps/api/src/tree/store.test.ts` (create it if it does not exist)

**Interfaces:**
- Consumes (Task 1):
  - `TreeThemeSchema`, `type TreeTheme`, and `treeStateFromLists(…, theme)`;
  - the `setTreeTheme` op and `Person.cardStyle`.
- Produces:
  - `storedTheme(value: unknown): TreeTheme` in `apps/api/src/tree/store.ts`;
  - `GET /api/clans/:id/tree` always sends `theme`;
  - `POST /ops` saves `Clan.theme` in the op's transaction.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/routes/tree.test.ts`:
- The two exact bodies gain `theme: {}`:
  - `'starts empty at version 0'` expects `{ version: 0, progenitorId: null, persons: [], unions: [], theme: {} }`;
  - `'saves an op, bumps the version…'` expects `{ version: 1, progenitorId: null, persons: [tu], unions: [], theme: {} }`.
- Search the file for other `toEqual({ version:` bodies and add `theme: {}` to each.
- Then add:

```ts
describe('tree themes on save', () => {
  it('saves the clan theme with the op, and its logged inverse restores it', async () => {
    const { editor, viewer, clanId } = await setup();
    const pick: Op = {
      type: 'setTreeTheme',
      payload: { changes: { surface: 'corkboard', fastener: 'pushpin' } },
    };
    expect((await submit(editor, clanId, pick, 0)).status).toBe(200);
    const after = await viewer.agent.get(`/api/clans/${clanId}/tree`);
    expect(after.body.theme).toEqual({ surface: 'corkboard', fastener: 'pushpin' });
    const logged = await OperationModel.findOne({ clanId, seq: 1 }).lean();
    expect(logged?.inverse).toEqual({
      type: 'setTreeTheme',
      payload: { changes: { surface: null, fastener: null } },
    });

    // The inverse, sent as an undo of seq 1, puts the defaults back.
    const undo = await submit(editor, clanId, logged?.inverse as Op, 1, { revertsSeq: 1 });
    expect(undo.status).toBe(200);
    expect((await viewer.agent.get(`/api/clans/${clanId}/tree`)).body.theme).toEqual({});
  });

  it('answers 403 to a viewer, and changes nothing', async () => {
    const { viewer, clanId } = await setup();
    const pick: Op = { type: 'setTreeTheme', payload: { changes: { thread: 'yarn' } } };
    expect((await submit(viewer, clanId, pick, 0)).status).toBe(403);
    expect((await viewer.agent.get(`/api/clans/${clanId}/tree`)).body).toMatchObject({
      version: 0,
      theme: {},
    });
  });

  it('rejects an unknown option with 400', async () => {
    const { editor, clanId } = await setup();
    const response = await editor.agent.post(`/api/clans/${clanId}/ops`).send({
      op: { type: 'setTreeTheme', payload: { changes: { surface: 'chalkboard' } } },
      baseVersion: 0,
      expectedUserId: editor.user.id,
    });
    expect(response.status).toBe(400);
  });

  it("stores a card's style with updatePerson and clears it with null", async () => {
    const { editor, viewer, clanId } = await setup();
    const tu = person();
    await submit(editor, clanId, addPerson(tu), 0);
    const style: Op = {
      type: 'updatePerson',
      payload: { id: tu.id, changes: { cardStyle: { frame: 'vintage' } } },
    };
    expect((await submit(editor, clanId, style, 1)).status).toBe(200);
    let tree = await viewer.agent.get(`/api/clans/${clanId}/tree`);
    expect(tree.body.persons[0].cardStyle).toEqual({ frame: 'vintage' });

    const clear: Op = { type: 'updatePerson', payload: { id: tu.id, changes: { cardStyle: null } } };
    expect((await submit(editor, clanId, clear, 2)).status).toBe(200);
    tree = await viewer.agent.get(`/api/clans/${clanId}/tree`);
    expect(tree.body.persons[0]).not.toHaveProperty('cardStyle');
  });
});
```

In `apps/api/src/tree/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { storedTheme } from './store.ts';

describe('storedTheme', () => {
  it('reads a stored theme, and treats anything unreadable as the defaults', () => {
    expect(storedTheme({ surface: 'fridge' })).toEqual({ surface: 'fridge' });
    expect(storedTheme(undefined)).toEqual({});
    expect(storedTheme(null)).toEqual({});
    expect(storedTheme({ surface: 'chalkboard' })).toEqual({});
  });
});
```

If `store.test.ts` already exists, add the `describe` to it.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --dir apps/api exec vitest run src/routes/tree.test.ts src/tree/store.test.ts`
Expected: FAIL. `storedTheme` does not exist, the tree body has no `theme`, and the saved theme is lost.

- [ ] **Step 3: Implement**

`apps/api/src/models/Clan.ts`: add after `progenitorId`:

```ts
    /** The clan's tree theme (spec §5, §13.4); changed only by the setTreeTheme op. */
    theme: { type: Schema.Types.Mixed, default: () => ({}) },
```

`apps/api/src/tree/store.ts`:
- Import `TreeThemeSchema, type TreeTheme` from `@ancestors-tree/shared/tree`.
- Add `storedTheme` below.
- In `loadTreeState`, pass `storedTheme(clan.theme)` as the fourth argument of `treeStateFromLists`.

```ts
/**
 * The clan's stored theme. A document from before themes, or one holding an option that no
 * longer exists, reads as the defaults rather than failing the whole tree.
 */
export function storedTheme(value: unknown): TreeTheme {
  const parsed = TreeThemeSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}
```

`apps/api/src/routes/tree.ts`:
- In the GET handler's body, add `theme: tree.theme,` after `progenitorId`.
- In the POST handler, the clan update becomes:

```ts
        clan.set({ version: next, progenitorId: after.progenitorId });
        // applyOp keeps the theme object unless the op changed it.
        if (after.theme !== before.theme) {
          clan.set('theme', after.theme);
          // A Mixed path: Mongoose cannot see changes inside it on its own.
          clan.markModified('theme');
        }
        await clan.save({ session });
```

`before` and `after` are the handler's existing names, from `loadTreeState` and `applyOrReject`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --dir apps/api exec vitest run src/routes/tree.test.ts src/tree src/routes/history.test.ts`, then `pnpm typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

Message file `.superpowers/sdd/p6e-task-2-commit.txt`, subject `feat(api): save the clan theme and card styles through ops`. The body:
- `Clan.theme` is saved in the op's transaction, and loaded next to `progenitorId`;
- GET /tree sends it;
- a viewer's `setTreeTheme` gets 403 through the existing op permissions;
- `Person.cardStyle` round-trips and clears with null.

End with the Co-Authored-By line.

```bash
rtk git add apps/api/src
rtk git commit -F .superpowers/sdd/p6e-task-2-commit.txt
```

---

### Task 3: The view-preference API

**Files:**
- Create: `apps/api/src/models/ViewPreference.ts`, `apps/api/src/routes/viewPreference.ts`, `apps/api/src/routes/viewPreference.test.ts`
- Modify: `apps/api/src/db/indexes.ts`, `apps/api/src/clans/scoped.ts`, `apps/api/src/app.ts`, `apps/api/src/routes/clans.test.ts`

**Interfaces:**
- Consumes (Task 1): `ViewPreferenceSchema`, `EMPTY_VIEW_PREFERENCE` and `type ViewPreference` (from `@ancestors-tree/shared`).
- Produces:
  - `GET /api/clans/:id/view-preference` → `ViewPreference`, which is `EMPTY_VIEW_PREFERENCE` when the caller never saved one;
  - `PUT /api/clans/:id/view-preference` with a `ViewPreference` body → the saved `ViewPreference`, with cards of people not in the clan pruned;
  - `registerViewPreferenceRoutes(api: RouteRegistry): void`;
  - `ViewPreferenceModel`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/routes/viewPreference.test.ts`:

```ts
import { newObjectId } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { PersonModel } from '../models/Person.ts';
import { ViewPreferenceModel } from '../models/ViewPreference.ts';
import { createTestApp } from '../test/app.ts';
import { addMember, createClan } from '../test/clans.ts';
import { useTestDatabase } from '../test/database.ts';
import { signUp } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();

type Member = Awaited<ReturnType<typeof signUp>>;

async function insertPerson(clanId: string): Promise<string> {
  const id = newObjectId();
  await PersonModel.create({
    _id: id,
    clanId,
    fullName: 'Nguyễn Văn Tư',
    aliases: [],
    gender: 'male',
    death: { isDeceased: false },
    isAdopted: false,
  });
  return id;
}

/** An owner with a new family tree holding one person, plus a viewer of it. */
async function setup() {
  const owner = await signUp(app);
  const viewer = await signUp(app);
  const clan = await createClan(owner.agent);
  await addMember(clan.id, viewer.user.id, 'viewer');
  const personId = await insertPerson(clan.id);
  return { owner, viewer, clanId: clan.id, personId };
}

const path = (clanId: string) => `/api/clans/${clanId}/view-preference`;
const put = (member: Member, clanId: string, body: unknown) =>
  member.agent.put(path(clanId)).send(body);

describe('GET /api/clans/:id/view-preference', () => {
  it('answers the empty preference to a member who never decorated', async () => {
    const { viewer, clanId } = await setup();
    const response = await viewer.agent.get(path(clanId));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enabled: false, theme: {}, cards: {} });
  });

  it('is for members only', async () => {
    const { clanId } = await setup();
    const stranger = await signUp(app);
    expect((await stranger.agent.get(path(clanId))).status).toBe(404);
  });
});

describe('PUT /api/clans/:id/view-preference', () => {
  it("lets a viewer save their own, and each member reads only their own", async () => {
    const { owner, viewer, clanId, personId } = await setup();
    const mine = {
      enabled: true,
      theme: { surface: 'corkboard', fastener: 'pushpin' },
      cards: { [personId]: { frame: 'vintage' } },
    };
    const saved = await put(viewer, clanId, mine);
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual(mine);
    expect((await viewer.agent.get(path(clanId))).body).toEqual(mine);
    expect((await owner.agent.get(path(clanId))).body).toEqual({
      enabled: false,
      theme: {},
      cards: {},
    });
  });

  it('replaces the whole document: the last save wins', async () => {
    const { viewer, clanId } = await setup();
    await put(viewer, clanId, { enabled: true, theme: { surface: 'fridge' }, cards: {} });
    await put(viewer, clanId, { enabled: false, theme: { thread: 'yarn' }, cards: {} });
    expect((await viewer.agent.get(path(clanId))).body).toEqual({
      enabled: false,
      theme: { thread: 'yarn' },
      cards: {},
    });
    expect(await ViewPreferenceModel.countDocuments({ clanId })).toBe(1);
  });

  it('prunes the cards of people who are not in this family tree', async () => {
    const { viewer, clanId, personId } = await setup();
    const gone = newObjectId();
    const response = await put(viewer, clanId, {
      enabled: true,
      theme: {},
      cards: { [personId]: { fastener: 'magnet' }, [gone]: { frame: 'kraft' } },
    });
    expect(response.body.cards).toEqual({ [personId]: { fastener: 'magnet' } });
  });

  it('refuses unknown options, keys that are not ids, and more than 5,000 cards', async () => {
    const { viewer, clanId } = await setup();
    const unknown = { enabled: true, theme: { surface: 'chalkboard' }, cards: {} };
    expect((await put(viewer, clanId, unknown)).status).toBe(400);
    const badKey = { enabled: true, theme: {}, cards: { abc: { frame: 'kraft' } } };
    expect((await put(viewer, clanId, badKey)).status).toBe(400);
    const cards = Object.fromEntries(
      Array.from({ length: 5001 }, () => [newObjectId(), { frame: 'kraft' }]),
    );
    expect((await put(viewer, clanId, { enabled: true, theme: {}, cards })).status).toBe(400);
  });

  it('keeps one document when two first saves race', async () => {
    const { viewer, clanId } = await setup();
    const body = { enabled: true, theme: { stitch: 'yarn' }, cards: {} };
    const [a, b] = await Promise.all([put(viewer, clanId, body), put(viewer, clanId, body)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await ViewPreferenceModel.countDocuments({ clanId })).toBe(1);
  });
});
```

In `apps/api/src/routes/clans.test.ts`, delete-clan tests:
- `filledClan` also saves a preference after its op:

```ts
    expect(
      (
        await agent
          .put(`/api/clans/${clan.id}/view-preference`)
          .send({ enabled: true, theme: { surface: 'fridge' }, cards: {} })
      ).status,
    ).toBe(200);
```

- `countFor` adds `await ViewPreferenceModel.countDocuments({ clanId }),` (import it from `../models/ViewPreference.ts`).
- The two expectations become eight zeros and eight ones.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --dir apps/api exec vitest run src/routes/viewPreference.test.ts src/routes/clans.test.ts src/clans`
Expected: FAIL. The model and the routes do not exist.

- [ ] **Step 3: Implement**

`apps/api/src/models/ViewPreference.ts`:

```ts
import { model, Schema } from 'mongoose';

/**
 * "Only for me" (spec §5, §13.4): one member's own decoration of one clan. Not an op: it never
 * appears in the clan's history, and share links and exports never read it.
 */
const viewPreferenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clanId: { type: Schema.Types.ObjectId, ref: 'Clan', required: true, index: true },
    enabled: { type: Boolean, required: true },
    theme: { type: Schema.Types.Mixed, default: () => ({}) },
    cards: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  // minimize: false keeps an empty theme or cards object instead of dropping the field.
  { timestamps: { createdAt: false, updatedAt: true }, minimize: false },
);

viewPreferenceSchema.index({ userId: 1, clanId: 1 }, { unique: true });

export const ViewPreferenceModel = model('ViewPreference', viewPreferenceSchema);
```

`apps/api/src/routes/viewPreference.ts`:

```ts
import {
  EMPTY_VIEW_PREFERENCE,
  IdSchema,
  ViewPreferenceSchema,
  type ViewPreference,
} from '@ancestors-tree/shared';
import type { Types } from 'mongoose';
import { z } from 'zod';
import type { RouteRegistry } from '../http/routeRegistry.ts';
import { PersonModel } from '../models/Person.ts';
import { ViewPreferenceModel } from '../models/ViewPreference.ts';

const ParamsSchema = z.object({ id: IdSchema });
const DUPLICATE_KEY = 11000;

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: unknown }).code === DUPLICATE_KEY;
}

/** A stored document as the API sends it. None, or an unreadable one, is "no choices". */
function toViewPreference(record: unknown): ViewPreference {
  if (record === null || typeof record !== 'object') return EMPTY_VIEW_PREFERENCE;
  const { enabled, theme, cards } = record as Record<string, unknown>;
  const parsed = ViewPreferenceSchema.safeParse({ enabled, theme, cards });
  return parsed.success ? parsed.data : EMPTY_VIEW_PREFERENCE;
}

/** Only the cards of people still in the clan (spec §5: the others are pruned on save). */
async function keepCardsInClan(
  clanId: string,
  cards: ViewPreference['cards'],
): Promise<ViewPreference['cards']> {
  const ids = Object.keys(cards);
  if (ids.length === 0) return {};
  const found = await PersonModel.find({ clanId, _id: { $in: ids } }, { _id: 1 }).lean<
    { _id: Types.ObjectId }[]
  >();
  const kept = new Set(found.map((record) => record._id.toString()));
  return Object.fromEntries(Object.entries(cards).filter(([id]) => kept.has(id)));
}

export function registerViewPreferenceRoutes(api: RouteRegistry): void {
  api.define({
    method: 'get',
    path: '/clans/:id/view-preference',
    summary: "The caller's own decoration of this family tree (spec §13.4)",
    tags: ['Tree'],
    access: { clanRole: 'viewer' },
    request: { params: ParamsSchema },
    responses: {
      200: {
        description: 'Whether it is on, the tree theme and the card choices; empty when none',
        schema: ViewPreferenceSchema,
      },
    },
    handler: async ({ params, userId }) => {
      const record = await ViewPreferenceModel.findOne({
        clanId: params.id,
        userId: userId(),
      }).lean();
      return { status: 200, body: toViewPreference(record) };
    },
  });

  api.define({
    method: 'put',
    path: '/clans/:id/view-preference',
    summary: "Replace the caller's own decoration of this family tree (spec §13.4)",
    tags: ['Tree'],
    access: { clanRole: 'viewer' },
    request: { params: ParamsSchema, body: ViewPreferenceSchema },
    responses: {
      200: { description: 'Saved, with cards of people not in the tree left out', schema: ViewPreferenceSchema },
    },
    handler: async ({ params, body, userId }) => {
      const cards = await keepCardsInClan(params.id, body.cards);
      const filter = { clanId: params.id, userId: userId() };
      const update = { $set: { enabled: body.enabled, theme: body.theme, cards } };
      const save = () =>
        ViewPreferenceModel.findOneAndUpdate(filter, update, {
          upsert: true,
          returnDocument: 'after',
        }).lean();
      let record;
      try {
        record = await save();
      } catch (error) {
        // Two first saves at once: one inserts, the other's upsert hits the unique index and
        // finds the document on its second try.
        if (!isDuplicateKey(error)) throw error;
        record = await save();
      }
      return { status: 200, body: toViewPreference(record) };
    },
  });
}
```

Then the wiring:
- `apps/api/src/app.ts`: import `registerViewPreferenceRoutes` and call `registerViewPreferenceRoutes(api);` after `registerPhotoRoutes(...)`.
- `apps/api/src/db/indexes.ts`: import `ViewPreferenceModel` and add it to the end of `MODELS`.
- `apps/api/src/clans/scoped.ts`: add `'ViewPreference'` to the end of `CLAN_SCOPED_MODEL_NAMES`.

Removing a member leaves their `ViewPreference` alone; they get it back if they join again.

- [ ] **Step 4: Run the tests**

Run: `pnpm --dir apps/api exec vitest run src/routes/viewPreference.test.ts src/routes/clans.test.ts src/clans src/openapi`, then `pnpm typecheck`.
Expected: PASS. The OpenAPI route-coverage test finds the two new routes on its own.

- [ ] **Step 5: Commit**

Message file `.superpowers/sdd/p6e-task-3-commit.txt`, subject `feat(api): GET and PUT view-preference for "only for me" themes`. The body:
- any member reads and replaces only their own document;
- Zod allows known options, ObjectId keys and at most 5,000 cards;
- cards of people not in the tree are pruned on save, and two racing first saves keep one document;
- deleting a clan deletes its preferences.

End with the Co-Authored-By line.

```bash
rtk git add apps/api/src
rtk git commit -F .superpowers/sdd/p6e-task-3-commit.txt
```

---

### Task 4: The options in CSS, the contrast tests and the drawing primitives

**Files:**
- Modify: `apps/web/src/shared/ui/tokens.css`, `apps/web/src/styles/index.css`, `apps/web/src/shared/ui/tokens.test.ts`
- Modify: `apps/web/src/shared/ui/scrapbook/Polaroid.tsx`, `Polaroid.test.tsx`, `Board.tsx`, `Board.test.tsx`, `Thread.tsx`, `Stitch.tsx`, `Thread.test.tsx`, `Stitch.test.tsx`
- Create: `apps/web/src/shared/ui/scrapbook/ThemeSwatch.tsx`, `ThemeSwatch.test.tsx`
- Modify: `apps/web/src/shared/ui/index.ts`
- Modify: `apps/web/src/features/tree/UnionNode.tsx` (the lone knot's class)
- Modify: `apps/web/src/features/design-gallery/DesignGalleryPage.tsx`, `DesignGalleryPage.test.tsx`
- Modify: `apps/web/src/locales/vi.json`, `en.json` (`tree.decor.parts`, `tree.decor.options`, `designGallery.sections.themes`, `designGallery.themes.note`)

**Interfaces:**
- Consumes (Task 1): `SURFACES`, `CARD_FRAMES`, `CARD_FASTENERS`, `LINE_STYLES`, `THEME_OPTIONS`, `THEME_PARTS`, and the types `Surface`, `CardFrame`, `CardFastener`, `LineStyle`, `ThemePart`.
- Produces:
  - `Polaroid` props `frame?: CardFrame` (default `'classic'`) and `fastener?: CardFastener` (default `'washi'`). They become `data-frame` and `data-fastener` on the figure at every LOD. The fastener is drawn only at `full`, as `[data-part="fastener"]`.
  - `Board` props `surface?: Surface`, `thread?: LineStyle` and `stitch?: LineStyle`, which become `data-surface`, `data-thread` and `data-stitch`.
  - `ThemeSwatch({ part: ThemePart; value: string })`.
  - `themeOptionKey(part: ThemePart, value: string): ParseKeys`, giving `tree.decor.options.<part>.<value>`.
  - CSS utilities `board-grid` (now follows `--surface-pattern`), `polaroid-paper`, `fastener`, `thread-line`, `thread-knot`, `stitch-line`, `stitch-knot` and `stitch-ring`.
  - The token `--yarn` (themed) and the Tailwind colour `yarn`.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/shared/ui/tokens.test.ts`:
- import `CARD_FASTENERS, CARD_FRAMES, LINE_STYLES, SURFACES` from `@ancestors-tree/shared/tree`;
- add `'--yarn'` to `THEMED`;
- add `['--yarn', '--paper']` to `NON_TEXT_PAIRS`;
- add at the end:

```ts
const HEX = /^#[0-9a-f]{6}$/;
const SURFACE_COLORS = ['--paper', '--paper-grid', '--thread', '--line-strong'];
const FRAME_COLORS = ['--photo', '--photo-ink', '--photo-muted'];
const DARK = ":root[data-theme='dark']";

function expectContrast(
  tokens: Map<string, string>,
  pairs: Array<[string, string]>,
  minimum: number,
): void {
  for (const [foreground, background] of pairs) {
    const ratio = contrastRatio(tokens.get(foreground) ?? '', tokens.get(background) ?? '');
    expect(ratio, `${foreground} on ${background} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
      minimum,
    );
  }
}

/**
 * The tokens inside an option in one theme, as the cascade gives them: the theme's tokens, the
 * option's own block, then (dark) the option's dark block.
 */
function optionTokens(attribute: string, value: string, theme: 'light' | 'dark') {
  const own = declarations(`[${attribute}='${value}']`);
  if (theme === 'light') return new Map([...light, ...own]);
  return new Map([...dark, ...own, ...declarations(`${DARK} [${attribute}='${value}']`)]);
}

describe('tree theme options (spec §13.4)', () => {
  for (const surface of SURFACES) {
    it(`surface ${surface} sets its colours as #rrggbb in both themes`, () => {
      for (const block of [`[data-surface='${surface}']`, `${DARK} [data-surface='${surface}']`]) {
        const tokens = declarations(block);
        for (const name of SURFACE_COLORS) expect(tokens.get(name), `${block} ${name}`).toMatch(HEX);
      }
      expect(declarations(`[data-surface='${surface}']`).has('--surface-pattern')).toBe(true);
    });

    for (const theme of ['light', 'dark'] as const) {
      it(`surface ${surface} meets contrast in the ${theme} theme`, () => {
        const tokens = optionTokens('data-surface', surface, theme);
        expectContrast(
          tokens,
          [
            ['--ink', '--paper'],
            ['--ink-muted', '--paper'],
          ],
          4.5,
        );
        expectContrast(
          tokens,
          [
            ['--thread', '--paper'],
            ['--pin', '--paper'],
            ['--yarn', '--paper'],
            ['--accent', '--paper'],
            ['--line-strong', '--paper'],
            ['--line-strong', '--surface'],
          ],
          3,
        );
      });
    }
  }

  for (const frame of CARD_FRAMES) {
    it(`frame ${frame} sets its paper and inks as #rrggbb in both themes`, () => {
      for (const block of [`[data-frame='${frame}']`, `${DARK} [data-frame='${frame}']`]) {
        const tokens = declarations(block);
        for (const name of FRAME_COLORS) expect(tokens.get(name), `${block} ${name}`).toMatch(HEX);
      }
    });

    for (const theme of ['light', 'dark'] as const) {
      it(`frame ${frame} meets 4.5:1 text contrast in the ${theme} theme`, () => {
        expectContrast(
          optionTokens('data-frame', frame, theme),
          [
            ['--photo-ink', '--photo'],
            ['--photo-muted', '--photo'],
          ],
          4.5,
        );
      });
    }
  }

  it('gives every fastener and line style its block', () => {
    for (const fastener of CARD_FASTENERS) {
      expect(declarations(`[data-fastener='${fastener}']`).has('--fastener-width')).toBe(true);
    }
    for (const style of LINE_STYLES) {
      expect(declarations(`[data-thread='${style}']`).has('--thread-line')).toBe(true);
      expect(declarations(`[data-stitch='${style}']`).has('--stitch-line')).toBe(true);
    }
  });
});
```

`apps/web/src/shared/ui/scrapbook/ThemeSwatch.test.tsx`:

```tsx
import { THEME_OPTIONS, THEME_PARTS } from '@ancestors-tree/shared/tree';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { ThemeSwatch, themeOptionKey } from './ThemeSwatch';

describe('ThemeSwatch', () => {
  it('draws each part with the attribute its CSS reads, hidden from screen readers', () => {
    const { container } = render(
      <>
        <ThemeSwatch part="surface" value="corkboard" />
        <ThemeSwatch part="frame" value="vintage" />
        <ThemeSwatch part="fastener" value="magnet" />
        <ThemeSwatch part="thread" value="yarn" />
        <ThemeSwatch part="stitch" value="yarn" />
      </>,
    );
    expect(container.querySelector('[data-surface="corkboard"]')).toHaveClass('board-grid');
    expect(container.querySelector('[data-frame="vintage"] .polaroid-paper')).not.toBeNull();
    expect(container.querySelector('[data-fastener="magnet"] .fastener')).not.toBeNull();
    expect(container.querySelector('[data-thread="yarn"] .thread-line')).not.toBeNull();
    expect(container.querySelector('[data-stitch="yarn"] .stitch-line')).not.toBeNull();
    for (const swatch of container.children) expect(swatch).toHaveAttribute('aria-hidden', 'true');
  });

  it('has a name for every option in both languages', () => {
    for (const part of THEME_PARTS) {
      for (const value of THEME_OPTIONS[part]) {
        const key = themeOptionKey(part, value);
        expect(i18n.exists(key, { lng: 'vi' }), `vi ${key}`).toBe(true);
        expect(i18n.exists(key, { lng: 'en' }), `en ${key}`).toBe(true);
      }
    }
  });
});
```

In `Polaroid.test.tsx`, add:

```tsx
  it('carries its frame and fastener, and draws the fastener on the full card only', () => {
    const { rerender } = render(
      <Polaroid name="Ông Thịnh" label={LABEL} tape={2} frame="kraft" fastener="pushpin" />,
    );
    const card = screen.getByRole('figure', { name: LABEL });
    expect(card).toHaveAttribute('data-frame', 'kraft');
    expect(card).toHaveAttribute('data-fastener', 'pushpin');
    const fastener = card.querySelector<HTMLElement>('[data-part="fastener"]');
    expect(fastener).toHaveClass('fastener');
    // The branch colour, as the washi tape had.
    expect(fastener?.style.getPropertyValue('--fastener-color')).toBe(tapeColor(2));
    rerender(<Polaroid name="Ông Thịnh" label={LABEL} tape={2} lod="label" frame="kraft" />);
    expect(screen.getByRole('figure', { name: LABEL })).toHaveAttribute('data-frame', 'kraft');
    expect(document.querySelector('[data-part="fastener"]')).toBeNull();
  });

  it('defaults to the classic frame and washi tape', () => {
    render(<Polaroid name="Ông Thịnh" label={LABEL} tape="progenitor" />);
    const card = screen.getByRole('figure', { name: LABEL });
    expect(card).toHaveAttribute('data-frame', 'classic');
    expect(card).toHaveAttribute('data-fastener', 'washi');
  });
```

Import `tapeColor` from `./tape`. If the existing tests find the card in another way than `getByRole('figure', { name })`, use theirs.

In `Board.test.tsx`, add:

```tsx
  it('carries the tree theme for its CSS, grid paper and cotton by default', () => {
    const { rerender } = render(<Board width={10} height={10} label="Bảng" />);
    const board = screen.getByRole('group', { name: 'Bảng' });
    expect(board).toHaveAttribute('data-surface', 'grid-paper');
    expect(board).toHaveAttribute('data-thread', 'cotton');
    expect(board).toHaveAttribute('data-stitch', 'cotton');
    rerender(
      <Board width={10} height={10} label="Bảng" surface="fridge" thread="yarn" stitch="yarn" />,
    );
    expect(board).toHaveAttribute('data-surface', 'fridge');
    expect(board).toHaveAttribute('data-stitch', 'yarn');
  });
```

The line style moves from attributes to CSS classes. In `Thread.test.tsx`:
- the first test adds `expect(group?.querySelector('path')).toHaveClass('thread-line');`;
- in the `Stitch` test of that file, replace `expect(path).toHaveAttribute('stroke-dasharray', '4 4');` with `expect(path).toHaveClass('stitch-line');`.

In `Stitch.test.tsx`, the knot classes change:
- `toHaveClass('fill-thread')` becomes `toHaveClass('stitch-knot')`;
- `not.toHaveClass('fill-none')` becomes `not.toHaveClass('stitch-ring')`;
- for the broken stitch, `toHaveClass('fill-none')` becomes `toHaveClass('stitch-ring')`;
- and `not.toHaveClass('fill-thread')` becomes `not.toHaveClass('stitch-knot')`.

In `DesignGalleryPage.test.tsx`:
- add `'Chủ đề cây'` to the list of section headings;
- add this test:

```tsx
  it('shows every tree theme option', () => {
    renderWithProviders(<DesignGalleryPage />);
    for (const name of [
      'Giấy ô li',
      'Bảng gỗ bần',
      'Cửa tủ lạnh',
      'Giấy kraft',
      'Ảnh xưa',
      'Đinh ghim',
      'Nam châm',
      'Sợi len',
    ]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --dir apps/web exec vitest run src/shared/ui src/features/design-gallery`
Expected: FAIL. There are no option blocks, no `--yarn`, no `ThemeSwatch` and no `data-frame`.

- [ ] **Step 3: Implement the tokens**

`apps/web/src/shared/ui/tokens.css`:
- In the header comment's rules, add: "Tree themes (spec §13.4): each option is a block of variables under its data attribute, with a dark block; components read them through the utilities in styles/index.css."
- In `:root`, under Themed, add `--yarn: #8a3b12;`.
- In `:root[data-theme='dark']`, add `--yarn: #e0915f;`.
- In `@theme inline`, add `--color-yarn: var(--yarn);`.
- Insert the blocks below after the `@media (prefers-color-scheme: dark)` block, before `@theme`. Each selector starts at the beginning of its line, because `tokens.test.ts` finds blocks that way.

```css
/*
 * Tree themes (spec §13.4). The board root carries data-surface, data-thread and data-stitch;
 * every card carries data-frame and data-fastener. Colors are #rrggbb (tokens.test.ts checks
 * their contrast); patterns are CSS gradients only, so the CSP needs no image source. A dark
 * block redefines every color its light block sets, and nothing else.
 */
[data-surface='grid-paper'] {
  --paper: #fafaf8;
  --paper-grid: #ecece7;
  --thread: #5b5f66;
  --line-strong: #8a8f98;
  --surface-pattern:
    linear-gradient(var(--paper-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--paper-grid) 1px, transparent 1px);
  --surface-size: 22px 22px;
}

/* Warm cork: two offset dot grids read as the granules of a cork board. */
[data-surface='corkboard'] {
  --paper: #efe0c4;
  --paper-grid: #dcc59c;
  --thread: #5a4632;
  --line-strong: #7a6c58;
  --surface-pattern:
    radial-gradient(circle at 30% 30%, var(--paper-grid) 1.5px, transparent 2px),
    radial-gradient(circle at 70% 75%, var(--paper-grid) 1px, transparent 1.5px);
  --surface-size: 14px 14px, 9px 9px;
}

/* Cool enamel: a smooth door with a soft, wide sheen. */
[data-surface='fridge'] {
  --paper: #eef3f6;
  --paper-grid: #dde6ec;
  --thread: #4f5a66;
  --line-strong: #737b86;
  --surface-pattern: linear-gradient(
    100deg,
    transparent 0 35%,
    var(--paper-grid) 50%,
    transparent 65% 100%
  );
  --surface-size: 100% 100%; /* one sheen per board (changed in Task 5: a 560px tile striped wide boards) */
}

:root[data-theme='dark'] [data-surface='grid-paper'] {
  --paper: #14161c;
  --paper-grid: #1e2129;
  --thread: #a4a9b3;
  --line-strong: #737882;
}

:root[data-theme='dark'] [data-surface='corkboard'] {
  --paper: #2b2219;
  --paper-grid: #3a2e22;
  --thread: #c2ad92;
  --line-strong: #8a7a66;
}

:root[data-theme='dark'] [data-surface='fridge'] {
  --paper: #161c22;
  --paper-grid: #222a32;
  --thread: #9fb0bf;
  --line-strong: #6f7c88;
}

[data-frame='classic'] {
  --photo: #ffffff;
  --photo-ink: #1a1a1a;
  --photo-muted: #5b5f66;
  --frame-texture: none;
  --frame-edge: none;
}

/* Brown paper with a faint fibre. */
[data-frame='kraft'] {
  --photo: #dcc29a;
  --photo-ink: #2b2118;
  --photo-muted: #54412b;
  --frame-texture: repeating-linear-gradient(35deg, rgb(0 0 0 / 0.04) 0 2px, transparent 2px 5px);
  --frame-edge: none;
}

/* An aged photo: a warm vignette and a deckled top edge (a mask, so no image). */
[data-frame='vintage'] {
  --photo: #f3ead6;
  --photo-ink: #2e2a24;
  --photo-muted: #655a48;
  --frame-texture: radial-gradient(circle at 50% 40%, transparent 55%, rgb(120 90 40 / 0.14));
  --frame-edge: radial-gradient(circle at 4px 0, transparent 3px, #000000 3.5px) 0 0 / 8px 100%
    repeat-x;
}

:root[data-theme='dark'] [data-frame='classic'] {
  --photo: #e9e6dd;
  --photo-ink: #1a1a1a;
  --photo-muted: #5b5f66;
}

:root[data-theme='dark'] [data-frame='kraft'] {
  --photo: #cdb58e;
  --photo-ink: #2b2118;
  --photo-muted: #4c3a26;
}

:root[data-theme='dark'] [data-frame='vintage'] {
  --photo: #e2d8c2;
  --photo-ink: #2e2a24;
  --photo-muted: #5a5040;
}

/* Fasteners on a 100 px card: all centred, all in the branch colour (--fastener-color). */
[data-fastener='washi'] {
  --fastener-top: -8px;
  --fastener-left: 28px;
  --fastener-width: 44px;
  --fastener-height: 14px;
  --fastener-radius: 1px;
  --fastener-rotate: -3deg;
  --fastener-opacity: 0.85;
  --fastener-shine: none;
  --fastener-edge: none;
}

[data-fastener='pushpin'] {
  --fastener-top: -6px;
  --fastener-left: 43px;
  --fastener-width: 14px;
  --fastener-height: 14px;
  --fastener-radius: 999px;
  --fastener-rotate: 0deg;
  --fastener-opacity: 1;
  --fastener-shine: radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.7) 0 2px, transparent 3px);
  --fastener-edge: 0 1px 2px rgb(0 0 0 / 0.35);
}

[data-fastener='magnet'] {
  --fastener-top: -7px;
  --fastener-left: 36px;
  --fastener-width: 28px;
  --fastener-height: 16px;
  --fastener-radius: 6px;
  --fastener-rotate: 0deg;
  --fastener-opacity: 1;
  --fastener-shine: linear-gradient(rgb(255 255 255 / 0.35), transparent 60%);
  --fastener-edge: 0 1px 2px rgb(0 0 0 / 0.3);
}

/* Lines. var(--thread) resolves on the board root, which also carries the surface. */
[data-thread='cotton'] {
  --thread-line: var(--thread);
  --thread-width: 1.5px;
  --thread-cap: butt;
}

[data-thread='yarn'] {
  --thread-line: var(--yarn);
  --thread-width: 3px;
  --thread-cap: round;
}

[data-stitch='cotton'] {
  --stitch-line: var(--thread);
  --stitch-width: 1.6px;
  --stitch-dash: 4 4;
  --stitch-cap: butt;
}

[data-stitch='yarn'] {
  --stitch-line: var(--yarn);
  --stitch-width: 2.8px;
  --stitch-dash: 7 5;
  --stitch-cap: round;
}
```

`apps/web/src/styles/index.css`: replace the `board-grid` utility, and add the others after it. Every fallback is the default look. So a board or card without a data attribute is unchanged: the home page's sample board, the skeleton and the empty tree.

```css
/* The scrapbook board: its surface pattern (spec §13.4); grid paper with 22 px squares by default. */
@utility board-grid {
  background-color: var(--paper);
  background-image: var(
    --surface-pattern,
    linear-gradient(var(--paper-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--paper-grid) 1px, transparent 1px)
  );
  background-size: var(--surface-size, 22px 22px);
}

/* The polaroid's paper, a layer of its own: the vintage mask must not clip the fastener. */
@utility polaroid-paper {
  background-color: var(--photo);
  background-image: var(--frame-texture, none);
  mask: var(--frame-edge, none);
}

/* What holds the card up, in the branch colour (--fastener-color, set by the Polaroid). */
@utility fastener {
  position: absolute;
  top: var(--fastener-top, -8px);
  left: var(--fastener-left, 28px);
  width: var(--fastener-width, 44px);
  height: var(--fastener-height, 14px);
  border-radius: var(--fastener-radius, 1px);
  rotate: var(--fastener-rotate, -3deg);
  opacity: var(--fastener-opacity, 0.85);
  background-color: var(--fastener-color);
  background-image: var(--fastener-shine, none);
  box-shadow: var(--fastener-edge, none);
}

@utility thread-line {
  stroke: var(--thread-line, var(--thread));
  stroke-width: var(--thread-width, 1.5px);
  stroke-linecap: var(--thread-cap, butt);
}

@utility thread-knot {
  fill: var(--thread-line, var(--thread));
}

@utility stitch-line {
  stroke: var(--stitch-line, var(--thread));
  stroke-width: var(--stitch-width, 1.6px);
  stroke-dasharray: var(--stitch-dash, 4 4);
  stroke-linecap: var(--stitch-cap, butt);
}

/* The knot and the ring are never dashed: they take the colour only. */
@utility stitch-knot {
  fill: var(--stitch-line, var(--thread));
  stroke: var(--stitch-line, var(--thread));
}

@utility stitch-ring {
  fill: none;
  stroke: var(--stitch-line, var(--thread));
}
```

- [ ] **Step 4: Implement the primitives**

`Polaroid.tsx`:
- Import `type { CardFastener, CardFrame }` from `@ancestors-tree/shared/tree`.
- Add the props, documented `/** Tree theme (spec §13.4); the classic white frame by default. */` and `/** Tree theme; drawn on the full card only, in the branch colour. */`.
- Default them in the parameter list: `frame = 'classic'`, `fastener = 'washi'`.
- Rename the local `frame` style object to `box`, and add the two attributes to `common`:

```tsx
  const box: CSSProperties = { width, height, rotate: `${tilt}deg`, ...style };
  const common = {
    'aria-label': label,
    'data-lod': lod,
    'data-tape': tapeName(tape),
    'data-frame': frame,
    'data-fastener': fastener,
    ...props,
  };
```

- Use `box` wherever the old `frame` style object was used.
- The `full` card's return becomes as below. The paper is its own layer. The caption becomes `relative`, so it paints above the absolutely placed paper. The fastener comes last, so it sits on top.

```tsx
  return (
    <figure
      {...common}
      className={cn('relative m-0 px-[7px] pt-[7px] text-photo-ink', className)}
      style={box}
    >
      <span
        aria-hidden="true"
        data-part="paper"
        className="polaroid-paper absolute inset-0 rounded-photo border border-line"
      />
      {/* Stickers are stuck on the photo's corner, so they never cover the caption. */}
      <div data-part="photo" className="relative">
        {showPhoto ? (
          <img
            src={photoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-[74px] w-full object-cover"
            onError={() => setFailedUrl(photoUrl)}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-[74px] items-center justify-center text-2xl font-bold"
            style={{ backgroundColor: `color-mix(in oklab, ${tapeBackground} 18%, var(--photo))` }}
          >
            {initialsOf(name)}
          </span>
        )}
        {marks ? (
          <div className="absolute -right-3 bottom-1 flex flex-col items-end gap-1">{marks}</div>
        ) : null}
      </div>
      <figcaption className="relative mt-1.5 text-center">
        <span className="block truncate font-hand text-base leading-5">{name}</span>
        <span
          data-part="date-line"
          className="mt-0.5 block h-3.5 truncate font-mono text-[11px] leading-[14px] text-photo-muted"
        >
          {dateLine ?? lifeYears}
        </span>
      </figcaption>
      <span
        aria-hidden="true"
        data-part="fastener"
        className="fastener"
        style={{ '--fastener-color': tapeBackground } as CSSProperties}
      />
    </figure>
  );
```

The old washi `<span>` (`-top-2 left-7 h-3.5 w-11 -rotate-3 opacity-85`) is gone: the `washi` block holds the same numbers. The `label` and `strip` returns keep their own tape band, and now spread `common`, which carries `data-frame`.

`Board.tsx`:
- Import `type { LineStyle, Surface }` from `@ancestors-tree/shared/tree`.
- Add the three props, documented `/** Tree theme (spec §13.4); the defaults when left out. */`.
- Default them in the parameter list: `surface = 'grid-paper'`, `thread = 'cotton'`, `stitch = 'cotton'`.
- Put `data-surface={surface} data-thread={thread} data-stitch={stitch}` on the div.

`Thread.tsx`: the path becomes:

```tsx
      <path
        d={threadPath(from, dropTo, to)}
        fill="none"
        // The colour, width and caps come from the board's thread style (spec §13.4). A selected
        // thread is the stamp colour and thicker in every style.
        {...(selected
          ? { strokeWidth: 2.6, className: 'stroke-stamp' }
          : { className: 'thread-line' })}
      />
```

`Stitch.tsx`, the body:

```tsx
export function Stitch({ left, right, selected = false, broken = false }: StitchProps) {
  const centre = midpoint(left, right);
  const paths = broken
    ? [
        stitchPath(left, { x: centre.x - GAP, y: centre.y }),
        stitchPath({ x: centre.x + GAP, y: centre.y }, right),
      ]
    : [stitchPath(left, right)];
  // The colour, width, dashes and caps come from the board's stitch style (spec §13.4); a
  // selected stitch is the stamp colour in every style.
  const line = selected
    ? { className: 'stroke-stamp', strokeWidth: 2.6, strokeDasharray: '4 4' }
    : { className: 'stitch-line' };
  const knot = broken
    ? selected
      ? 'fill-none stroke-stamp'
      : 'stitch-ring'
    : selected
      ? 'fill-stamp stroke-stamp'
      : 'stitch-knot';
  return (
    <g
      data-relation="marriage"
      data-selected={selected || undefined}
      data-broken={broken || undefined}
    >
      {paths.map((d) => (
        <path key={d} d={d} fill="none" {...line} />
      ))}
      <circle cx={centre.x} cy={centre.y} r={6} strokeWidth={1.8} className={knot} />
    </g>
  );
}
```

Drop the `cn` import from `Stitch.tsx`; nothing else there uses it.

`apps/web/src/features/tree/UnionNode.tsx`: the lone knot's `className="fill-thread"` becomes `className="thread-knot"`.

`apps/web/src/shared/ui/scrapbook/ThemeSwatch.tsx`:

```tsx
import type { ThemePart } from '@ancestors-tree/shared/tree';
import type { ParseKeys } from 'i18next';
import type { CSSProperties } from 'react';

/** The i18n key of an option's name; ThemeSwatch.test checks every one exists. */
export function themeOptionKey(part: ThemePart, value: string): ParseKeys {
  return `tree.decor.options.${part}.${value}` as ParseKeys;
}

const PREVIEW_FASTENER = { '--fastener-color': 'var(--tape-2)' } as CSSProperties;

/**
 * A small live preview of one theme option (spec §13.4), drawn by the same CSS as the board.
 * Decorative: the control around it names the option.
 */
export function ThemeSwatch({ part, value }: { part: ThemePart; value: string }) {
  switch (part) {
    case 'surface':
      return (
        <span
          aria-hidden="true"
          data-surface={value}
          className="board-grid block h-12 w-16 rounded-control border border-line"
        />
      );
    case 'frame':
      return (
        <span aria-hidden="true" data-frame={value} className="relative block h-12 w-10">
          <span className="polaroid-paper absolute inset-0 rounded-photo border border-line" />
          <span className="absolute inset-x-1 top-1 h-6 bg-paper-grid" />
        </span>
      );
    case 'fastener':
      return (
        <span aria-hidden="true" data-fastener={value} className="relative block h-12 w-16">
          <span className="absolute inset-x-1 top-3 bottom-0 rounded-photo border border-line bg-photo" />
          <span
            className="fastener"
            style={{ ...PREVIEW_FASTENER, top: 4, left: '50%', translate: '-50% 0' }}
          />
        </span>
      );
    case 'thread':
      return (
        <svg aria-hidden="true" data-thread={value} width={64} height={48} className="block">
          <path d="M12 4 L12 20 C12 32 52 30 52 36" fill="none" className="thread-line" />
          <circle cx={52} cy={40} r={4} className="fill-pin" />
        </svg>
      );
    case 'stitch':
      return (
        <svg aria-hidden="true" data-stitch={value} width={64} height={48} className="block">
          <path d="M4 24 L60 24" fill="none" className="stitch-line" />
          <circle cx={32} cy={24} r={5} strokeWidth={1.8} className="stitch-knot" />
        </svg>
      );
  }
}
```

`apps/web/src/shared/ui/index.ts`: add `export { ThemeSwatch, themeOptionKey } from './scrapbook/ThemeSwatch';`.

- [ ] **Step 5: The gallery and the option names**

The locales are complete here. The rest of `tree.decor` comes in Task 8.
- Add `"themes": "Chủ đề cây"` / `"themes": "Tree themes"` to `designGallery.sections`.
- Add a `designGallery.themes` object:
  - `"note": "Mỗi lựa chọn có bản sáng và bản tối. Màu của đồ gắn luôn là màu của nhánh."`
  - `"note": "Every option has a light and a dark version. The fastener is always the branch colour."`
- Add `tree.decor` in `vi.json`:

```json
    "decor": {
      "parts": {
        "surface": "Mặt bảng",
        "frame": "Khung ảnh",
        "fastener": "Đồ gắn",
        "thread": "Sợi chỉ cha con",
        "stitch": "Mũi khâu vợ chồng"
      },
      "options": {
        "surface": { "grid-paper": "Giấy ô li", "corkboard": "Bảng gỗ bần", "fridge": "Cửa tủ lạnh" },
        "frame": { "classic": "Trắng cổ điển", "kraft": "Giấy kraft", "vintage": "Ảnh xưa" },
        "fastener": { "washi": "Băng dính washi", "pushpin": "Đinh ghim", "magnet": "Nam châm" },
        "thread": { "cotton": "Chỉ mảnh", "yarn": "Sợi len" },
        "stitch": { "cotton": "Chỉ mảnh", "yarn": "Sợi len" }
      }
    },
```

- Add `tree.decor` in `en.json`:

```json
    "decor": {
      "parts": {
        "surface": "Surface",
        "frame": "Frame",
        "fastener": "Fastener",
        "thread": "Parent–child thread",
        "stitch": "Marriage stitch"
      },
      "options": {
        "surface": { "grid-paper": "Grid paper", "corkboard": "Corkboard", "fridge": "Fridge door" },
        "frame": { "classic": "Classic white", "kraft": "Kraft paper", "vintage": "Vintage photo" },
        "fastener": { "washi": "Washi tape", "pushpin": "Pushpin", "magnet": "Magnet" },
        "thread": { "cotton": "Cotton", "yarn": "Yarn" },
        "stitch": { "cotton": "Cotton", "yarn": "Yarn" }
      }
    },
```

`DesignGalleryPage.tsx`:
- import `CARD_FASTENERS, CARD_FRAMES, THEME_OPTIONS, THEME_PARTS` from `@ancestors-tree/shared/tree`, and `ThemeSwatch, themeOptionKey` from `../../shared/ui`;
- add `'yarn'` to `COLOR_TOKENS`, after `'thread'`;
- add this section after the threads section:

```tsx
      <Section id="gallery-themes" title={t('designGallery.sections.themes')}>
        <p className="max-w-prose text-sm text-ink-muted">{t('designGallery.themes.note')}</p>
        <dl className="mt-4 flex flex-col gap-6">
          {THEME_PARTS.map((part) => (
            <div key={part}>
              <dt className="font-medium">{t(`tree.decor.parts.${part}`)}</dt>
              <dd className="m-0 mt-2 flex flex-wrap gap-6">
                {THEME_OPTIONS[part].map((value) => (
                  <figure key={value} className="m-0 flex flex-col items-center gap-1">
                    <ThemeSwatch part={part} value={value} />
                    <figcaption className="text-sm text-ink-muted">
                      {t(themeOptionKey(part, value))}
                    </figcaption>
                  </figure>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        {/* Each frame as a full card, with each fastener once, in a branch colour. */}
        {progenitor ? (
          <ul className="mt-8 flex flex-wrap items-start gap-12">
            {CARD_FRAMES.map((frame, index) => (
              <li key={frame}>
                <Polaroid
                  name={progenitor.name}
                  label={`${progenitor.name}, ${t(themeOptionKey('frame', frame))}`}
                  tape={index}
                  frame={frame}
                  fastener={CARD_FASTENERS[index]}
                  lifeYears={progenitor.lifeYears}
                  tilt={tiltFor(progenitor.id)}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
```

The photos section already reads `progenitor` (`SAMPLE_PEOPLE[0]`). Use the same field names it passes to its `Polaroid`, if they differ from `name`, `lifeYears` and `id`.

- [ ] **Step 6: Run the tests**

Run: `pnpm --dir apps/web exec vitest run src/shared/ui src/features/design-gallery src/features/home src/features/tree/TreeBoard.test.tsx src/locales`, then `pnpm typecheck` and `pnpm lint`.
Expected: PASS. The home page's sample board and the tree board look as before, because every fallback is the default.

- [ ] **Step 7: Commit**

Message file `.superpowers/sdd/p6e-task-4-commit.txt`, subject `feat(web): tree theme options in CSS, with contrast tests and previews`. The body:
- each surface, frame, fastener, thread and stitch is a block of CSS variables with a dark version;
- surfaces are CSS gradients, so the CSP is unchanged;
- the Polaroid draws its paper as its own layer, and its fastener in the branch colour on the full card only;
- the Board, Thread and Stitch read the board's styles;
- the contrast test covers every surface and frame in both themes;
- the /design gallery shows every option.

End with the Co-Authored-By line.

```bash
rtk git add apps/web/src
rtk git commit -F .superpowers/sdd/p6e-task-4-commit.txt
```

---

### Task 5: The board draws the resolved styles, with no relayout

**Files:**
- Create: `apps/web/src/features/tree/decorContext.ts`
- Modify: `apps/web/src/features/tree/api.ts`, `api.test.ts`, `store.ts`
- Modify: `apps/web/src/features/tree/flowElements.ts`, `flowElements.test.ts`
- Modify: `apps/web/src/features/tree/TreeBoard.tsx`, `TreeBoard.test.tsx`, `PersonNode.tsx`, `PersonCard.tsx`
- Modify: `apps/web/src/features/tree/UnlinkedTray.tsx` (`TrayPhoto`), `TreeDnd.tsx` (`LiftedCard`)

**Interfaces:**
- Consumes:
  - from Task 1: `resolveCardStyle`, `resolveBoardStyle`, `type ThemeLayers`, `type PersonalTheme`, `type ResolvedCardStyle`, and `TreeState.theme`;
  - from Task 4: the `frame` and `fastener` props of `Polaroid`, and the board root's data attributes.
- Produces:
  - `treeFromResponse(response: TreeResponse): TreeState` in `api.ts`;
  - `PersonalThemeContext: Context<PersonalTheme | null>` (null: no personal choices loaded);
  - `useThemeLayers(): ThemeLayers`, a new object only when the clan theme or the context value changes;
  - `PersonNodeData = { personId; tape; generation; frame: CardFrame; fastener: CardFastener }`;
  - `toFlowElements(layout, previous?, styleOf?: (personId: string) => ResolvedCardStyle)`;
  - `PersonCard` props `frame: CardFrame` and `fastener: CardFastener`.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/features/tree/api.test.ts`, add the block below. Import `treeFromResponse` from `./api` and `FAMILY` from `./fixtures` if the file lacks them.

```ts
describe('treeFromResponse', () => {
  it("keeps the clan's theme, and reads a response without one as the defaults", () => {
    const tree = treeFromResponse({ ...FAMILY, theme: { surface: 'fridge' } });
    expect(tree.theme).toEqual({ surface: 'fridge' });
    expect(Object.keys(tree.persons)).toHaveLength(FAMILY.persons.length);
    expect(treeFromResponse(FAMILY).theme).toEqual({});
  });
});
```

In `apps/web/src/features/tree/flowElements.test.ts`, add inside `describe('toFlowElements')`:

```ts
  it("puts each card's resolved style in its data, and keeps the cards whose style did not change", () => {
    const person = (elements: ReturnType<typeof toFlowElements>, id: string) =>
      elements.nodes.find((node) => node.id === id);
    const plain = toFlowElements(layout);
    expect(person(plain, C)?.data).toMatchObject({ frame: 'classic', fastener: 'washi' });

    const styled = toFlowElements(layout, plain, (id) =>
      id === C ? { frame: 'kraft', fastener: 'pushpin' } : { frame: 'classic', fastener: 'washi' },
    );
    expect(person(styled, C)?.data).toMatchObject({ frame: 'kraft', fastener: 'pushpin' });
    expect(person(styled, C)).not.toBe(person(plain, C));
    // Same place, same style: the same object, so its memoised card skips the render.
    expect(person(styled, A)).toBe(person(plain, A));
    expect(person(styled, B)).toBe(person(plain, B));
  });
```

In `apps/web/src/features/tree/TreeBoard.test.tsx`:
- Next to the `PersonCard` mock, add a mock that wraps the layout, to count calls:

```ts
// Count layouts (spec §13.4: a theme switch never lays the tree out again).
vi.mock('./layout', async (importOriginal) => {
  const original = await importOriginal<typeof import('./layout')>();
  return { ...original, layoutTree: vi.fn(original.layoutTree) };
});
```

- Import `PersonalThemeContext` from `./decorContext`.
- Add:

```tsx
describe('tree themes on the board', () => {
  const renderedFor = (id: string) =>
    vi.mocked(PersonCard).mock.calls.filter(([props]) => props.person.id === id).length;

  it('switches the clan theme without laying out the tree or redrawing unchanged cards', async () => {
    showTree(family);
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    const son = await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const board = screen.getByRole('group', { name: 'Cây gia phả' });
    expect(board).toHaveAttribute('data-surface', 'grid-paper');
    expect(board).toHaveAttribute('data-thread', 'cotton');
    const layouts = vi.mocked(layoutTree).mock.calls.length;
    const before = renderedFor(SON);

    act(() => {
      useTreeStore.getState().apply({
        type: 'setTreeTheme',
        payload: { changes: { surface: 'corkboard', thread: 'yarn', stitch: 'yarn' } },
      });
    });
    expect(board).toHaveAttribute('data-surface', 'corkboard');
    expect(board).toHaveAttribute('data-thread', 'yarn');
    expect(board).toHaveAttribute('data-stitch', 'yarn');
    expect(vi.mocked(layoutTree).mock.calls.length).toBe(layouts);
    // No card part changed, so no card was drawn again.
    expect(renderedFor(SON)).toBe(before);
    expect(figureOf(son)).toHaveAttribute('data-fastener', 'washi');
  });

  it('redraws only the card whose own style changed', async () => {
    mockApi({ [`POST /clans/${CLAN_ID}/ops`]: () => ({ body: { seq: 4 } }) });
    showTree(family);
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    const son = await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const before = { son: renderedFor(SON), grandma: renderedFor(GRANDMA) };
    act(() => {
      useTreeStore.getState().apply({
        type: 'updatePerson',
        payload: { id: SON, changes: { cardStyle: { frame: 'vintage' } } },
      });
    });
    expect(figureOf(son)).toHaveAttribute('data-frame', 'vintage');
    expect(renderedFor(SON)).toBeGreaterThan(before.son);
    expect(renderedFor(GRANDMA)).toBe(before.grandma);
  });

  it('uses my own choices while they are on', async () => {
    showTree(family);
    renderWithProviders(
      <PersonalThemeContext
        value={{
          enabled: true,
          theme: { surface: 'fridge' },
          cards: { [SON]: { fastener: 'magnet' } },
        }}
      >
        <TreeBoard label="Cây gia phả" />
      </PersonalThemeContext>,
    );
    const son = await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    expect(screen.getByRole('group', { name: 'Cây gia phả' })).toHaveAttribute(
      'data-surface',
      'fridge',
    );
    expect(figureOf(son)).toHaveAttribute('data-fastener', 'magnet');
    const grandma = await screen.findByRole('button', { name: /^Lê Thị Hoa,/ });
    expect(figureOf(grandma)).toHaveAttribute('data-fastener', 'washi');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --dir apps/web exec vitest run src/features/tree/api.test.ts src/features/tree/flowElements.test.ts src/features/tree/TreeBoard.test.tsx`
Expected: FAIL. There is no `treeFromResponse`, no `decorContext`, and the board root has no data attributes.

- [ ] **Step 3: Implement**

`apps/web/src/features/tree/api.ts`: import `treeStateFromLists, type TreeState` from `@ancestors-tree/shared/tree`, and add:

```ts
/** The tree a response holds, with the clan's theme (spec §13.4); none means the defaults. */
export function treeFromResponse(response: TreeResponse): TreeState {
  return treeStateFromLists(
    response.progenitorId,
    response.persons,
    response.unions,
    response.theme ?? {},
  );
}
```

`apps/web/src/features/tree/store.ts`:
- Replace each of the four `treeStateFromLists(response.progenitorId, response.persons, response.unions)` calls with `treeFromResponse(response)`. The one near line 536 is spread over several lines.
- Import `treeFromResponse` from `./api`, and drop `treeStateFromLists` from the imports if nothing else there uses it.

Without this, a reload or a 409 rebase would lose the clan's theme.

`apps/web/src/features/tree/decorContext.ts`:

```ts
import type { PersonalTheme, ThemeLayers } from '@ancestors-tree/shared/tree';
import { createContext, useContext, useMemo } from 'react';
import { useTreeStore } from './store';

/**
 * My own decoration of this clan (spec §13.4 "Only for me"); null until it is loaded. TreePage
 * provides it; its `enabled` decides whether it is drawn.
 */
export const PersonalThemeContext = createContext<PersonalTheme | null>(null);

/** The layers the board resolves styles from: a new object only when one of them changes. */
export function useThemeLayers(): ThemeLayers {
  const clan = useTreeStore((state) => state.tree.theme);
  const mine = useContext(PersonalThemeContext);
  return useMemo(() => ({ clan, mine }), [clan, mine]);
}
```

`apps/web/src/features/tree/flowElements.ts`:
- Import `THEME_DEFAULTS, type CardFastener, type CardFrame, type ResolvedCardStyle` from `@ancestors-tree/shared/tree`.
- Change these parts:

```ts
export type PersonNodeData = {
  personId: string;
  tape: TapeKind;
  generation: number;
  /** The card's resolved style (spec §13.4): a change reaches only the cards it alters. */
  frame: CardFrame;
  fastener: CardFastener;
};

const DEFAULT_STYLE: ResolvedCardStyle = {
  frame: THEME_DEFAULTS.frame,
  fastener: THEME_DEFAULTS.fastener,
};

function defaultStyleOf(): ResolvedCardStyle {
  return DEFAULT_STYLE;
}
```

- `toFlowElements` gains the third parameter `styleOf: (personId: string) => ResolvedCardStyle = defaultStyleOf`.
- Its comment adds: "Each card's data holds its resolved style, so a theme change replaces only the cards it changes."
- The person node's data becomes `{ personId: person.id, tape: person.tape, generation: person.generation, ...styleOf(person.id) }`.
- `sameNode` already compares data shallowly.

`apps/web/src/features/tree/TreeBoard.tsx`:
- Import `EMPTY_TREE, resolveBoardStyle, resolveCardStyle, type BoardStyle` from `@ancestors-tree/shared/tree`, and `useThemeLayers` from `./decorContext`.
- `BoardSurfaceProps` gains `board: BoardStyle`.
- `BoardSurface` takes `board`. Its root div keeps the `board-grid` class and gains `data-surface={board.surface} data-thread={board.thread} data-stitch={board.stitch}`.
- `TreeBoard` becomes:

```tsx
export function TreeBoard({ label, openPersonId = null }: TreeBoardProps) {
  const { t } = useTranslation();
  // The layout reads the people, the unions and the progenitor only. A theme change (a new
  // `tree.theme`) keeps all three, so it never lays the tree out again (spec §13.4).
  const progenitorId = useTreeStore((state) => state.tree.progenitorId);
  const persons = useTreeStore((state) => state.tree.persons);
  const unions = useTreeStore((state) => state.tree.unions);
  const layout = useMemo(
    () => layoutTree({ ...EMPTY_TREE, progenitorId, persons, unions }),
    [progenitorId, persons, unions],
  );
  const layers = useThemeLayers();
  const styleOf = useCallback(
    (personId: string) => resolveCardStyle(layers, personId, persons[personId]?.cardStyle),
    [layers, persons],
  );
  const previous = useRef<FlowElements | undefined>(undefined);
  const elements = useMemo(
    () => toFlowElements(layout, previous.current, styleOf),
    [layout, styleOf],
  );
  useEffect(() => {
    previous.current = elements;
  }, [elements]);
  const board = useMemo(() => resolveBoardStyle(layers), [layers]);

  if (layout.persons.length === 0) {
    return <p className="text-ink-muted">{t('tree.board.noProgenitor')}</p>;
  }
  return (
    <ReactFlowProvider>
      <BoardSurface
        label={label}
        layout={layout}
        elements={elements}
        board={board}
        openPersonId={openPersonId}
      />
    </ReactFlowProvider>
  );
}
```

`PersonNode.tsx`: pass `frame={data.frame}` and `fastener={data.fastener}` to `PersonCard`.

`PersonCard.tsx`:
- Add `frame: CardFrame` and `fastener: CardFastener` (types from `@ancestors-tree/shared/tree`) to `PersonCardProps` and to the destructuring.
- Pass both to the `Polaroid`.
- Every other place that renders `PersonCard` must pass the two props too. Run `rtk grep "<PersonCard" apps/web/src`. A test that renders it directly passes `frame="classic" fastener="washi"`.

`UnlinkedTray.tsx` (`TrayPhoto`) and `TreeDnd.tsx` (`LiftedCard`) draw the card as it looks on the board. Import `resolveCardStyle` from `@ancestors-tree/shared/tree` and `useThemeLayers` from `./decorContext`. Then:

```tsx
  const layers = useThemeLayers();
  const style = resolveCardStyle(layers, person.id, person.cardStyle);
```

and pass `frame={style.frame} fastener={style.fastener}` to their `Polaroid`. In `LiftedCard`, the hook goes above the early `return null`, and the resolve uses the person found:

```tsx
  const layers = useThemeLayers();
  if (person === undefined) return null;
  const style = resolveCardStyle(layers, person.id, person.cardStyle);
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --dir apps/web exec vitest run src/features/tree`, then `pnpm typecheck`.
Expected: PASS. If a web test times out at 5 s under the parallel run, re-run that file alone and note both results.

- [ ] **Step 5: Commit**

Message file `.superpowers/sdd/p6e-task-5-commit.txt`, subject `feat(web): draw the resolved tree theme on the board`. The body:
- the board root carries the resolved surface and line styles;
- each card, the tray photo and the lifted card carry their resolved frame and fastener;
- the layout depends on people, unions and the progenitor only, so a theme switch never runs it;
- node data holds the style, so only cards whose style changed are drawn again;
- a loaded or rebased tree keeps the clan's theme.

End with the Co-Authored-By line.

```bash
rtk git add apps/web/src/features/tree
rtk git commit -F .superpowers/sdd/p6e-task-5-commit.txt
```

---

### Task 6: Whole-family changes through the change runner, with their sentences

**Files:**
- Modify: `apps/web/src/features/tree/changes.ts`, `changes.test.ts`
- Modify: `apps/web/src/features/tree/relateText.ts`, `relateText.test.ts`
- Modify: `apps/web/src/features/tree/describeOp.ts`, `describeOp.test.ts`
- Modify: `apps/web/src/locales/vi.json`, `en.json` (`tree.relate.done.*`, `tree.change.*`)

**Interfaces:**
- Consumes (Task 1): `TreeThemeChanges`, `CardStyle`, the `setTreeTheme` op and `PersonChanges.cardStyle`.
- Produces:
  - two new `Change` kinds:
    - `{ kind: 'treeTheme'; changes: TreeThemeChanges }`;
    - `{ kind: 'cardStyle'; personId: string; cardStyle: CardStyle | null }`;
  - two new `ChangeSummary` kinds: `{ kind: 'treeTheme' }` and `{ kind: 'cardStyle'; personId: string; cleared: boolean }`;
  - two new `OpDescription` kinds: `'cardStyle'` and `'clearCardStyle'` (with `name`).
- Each change is a batch of one op, so it gets its own toast, Undo and history entry. A change that would change nothing is blocked as `ALREADY`, as the photo change is.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/features/tree/changes.test.ts`, add to `describe('planChange')`:

```ts
  it('sets the tree theme as one op, and says when nothing would change', () => {
    const tree = stateOf(FAMILY);
    const changes = { surface: 'corkboard', fastener: 'pushpin' } as const;
    expect(planChange(tree, { kind: 'treeTheme', changes })).toEqual({
      kind: 'ok',
      op: { type: 'batch', payload: { ops: [{ type: 'setTreeTheme', payload: { changes } }] } },
      summary: { kind: 'treeTheme' },
    });
    const themed = applyOp(tree, {
      type: 'setTreeTheme',
      payload: { changes: { surface: 'corkboard' } },
    }).tree;
    expect(planChange(themed, { kind: 'treeTheme', changes: { surface: 'corkboard' } })).toEqual({
      kind: 'blocked',
      reason: 'ALREADY',
    });
    // Resetting a part that is already the default changes nothing either.
    expect(planChange(tree, { kind: 'treeTheme', changes: { surface: null } })).toEqual({
      kind: 'blocked',
      reason: 'ALREADY',
    });
  });

  it("sets and clears a card's style as one person update", () => {
    const tree = stateOf(FAMILY);
    expect(
      planChange(tree, { kind: 'cardStyle', personId: SON, cardStyle: { frame: 'kraft' } }),
    ).toEqual({
      kind: 'ok',
      op: {
        type: 'batch',
        payload: {
          ops: [
            {
              type: 'updatePerson',
              payload: { id: SON, changes: { cardStyle: { frame: 'kraft' } } },
            },
          ],
        },
      },
      summary: { kind: 'cardStyle', personId: SON, cleared: false },
    });
    expect(planChange(tree, { kind: 'cardStyle', personId: SON, cardStyle: null })).toEqual({
      kind: 'blocked',
      reason: 'ALREADY',
    });

    const styled = applyOp(tree, {
      type: 'updatePerson',
      payload: { id: SON, changes: { cardStyle: { frame: 'kraft' } } },
    }).tree;
    expect(
      planChange(styled, { kind: 'cardStyle', personId: SON, cardStyle: { frame: 'kraft' } }),
    ).toEqual({ kind: 'blocked', reason: 'ALREADY' });
    expect(planChange(styled, { kind: 'cardStyle', personId: SON, cardStyle: null })).toMatchObject({
      kind: 'ok',
      summary: { kind: 'cardStyle', personId: SON, cleared: true },
    });
    expect(
      planChange(tree, {
        kind: 'cardStyle',
        personId: '64b7f0c2a1b2c3d4e5f6afff',
        cardStyle: { frame: 'kraft' },
      }),
    ).toEqual({ kind: 'blocked', reason: 'PERSON_NOT_FOUND' });
  });
```

In `apps/web/src/features/tree/relateText.test.ts`, add the block below. Reuse the file's imports, and add any of `i18n`, `treeStateFromLists`, `FAMILY`, `SON` and `changeSentence` that it lacks.

```ts
describe('theme sentences', () => {
  it('says what a theme change did', () => {
    const tree = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);
    expect(changeSentence(i18n.t, tree, { kind: 'treeTheme' })).toBe('chủ đề cây');
    expect(changeSentence(i18n.t, tree, { kind: 'cardStyle', personId: SON, cleared: false })).toBe(
      'kiểu thẻ của Nguyễn Văn Nam',
    );
    expect(changeSentence(i18n.t, tree, { kind: 'cardStyle', personId: SON, cleared: true })).toBe(
      'thẻ của Nguyễn Văn Nam theo kiểu của cây',
    );
  });
});
```

In `apps/web/src/features/tree/describeOp.test.ts`, add:

```ts
  it('says a card style change as such, unless other details change with it', () => {
    expect(
      say({ type: 'updatePerson', payload: { id: SON, changes: { cardStyle: { frame: 'kraft' } } } }),
    ).toBe('đổi kiểu thẻ của Nguyễn Văn Nam');
    expect(say({ type: 'updatePerson', payload: { id: SON, changes: { cardStyle: null } } })).toBe(
      'cho thẻ của Nguyễn Văn Nam theo kiểu của cây',
    );
    expect(
      say({ type: 'updatePerson', payload: { id: SON, changes: { cardStyle: null, bio: 'x' } } }),
    ).toBe('sửa thông tin của Nguyễn Văn Nam');
    // The change runner sends a batch of one: it reads the same.
    expect(
      say({
        type: 'batch',
        payload: { ops: [{ type: 'setTreeTheme', payload: { changes: { stitch: 'yarn' } } }] },
      }),
    ).toBe('đổi chủ đề cây');
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --dir apps/web exec vitest run src/features/tree/changes.test.ts src/features/tree/relateText.test.ts src/features/tree/describeOp.test.ts`
Expected: FAIL. The change kinds, the sentences and the phrases do not exist.

- [ ] **Step 3: Implement**

`apps/web/src/features/tree/changes.ts`:
- import `type CardStyle` and `type TreeThemeChanges` from `@ancestors-tree/shared/tree`;
- add `| { kind: 'treeTheme'; changes: TreeThemeChanges } | { kind: 'cardStyle'; personId: string; cardStyle: CardStyle | null }` to `Change`;
- add `| { kind: 'treeTheme' } | { kind: 'cardStyle'; personId: string; cleared: boolean }` to `ChangeSummary`;
- add this helper above `planChange`:

```ts
function sameCardStyle(a: CardStyle | null | undefined, b: CardStyle | null | undefined): boolean {
  return a?.frame === b?.frame && a?.fastener === b?.fastener;
}
```

- add these two cases to `planChange`, after `photo`:

```ts
    case 'treeTheme': {
      const theme = tree.theme as Record<string, unknown>;
      const differs = Object.entries(change.changes).some(
        ([part, value]) => value !== undefined && (theme[part] ?? null) !== value,
      );
      if (!differs) return blocked('ALREADY');
      return checked(
        tree,
        () => ({
          type: 'batch',
          payload: { ops: [{ type: 'setTreeTheme', payload: { changes: change.changes } }] },
        }),
        { kind: 'treeTheme' },
      );
    }
    case 'cardStyle': {
      const person = tree.persons[change.personId];
      if (person === undefined) return blocked('PERSON_NOT_FOUND');
      if (sameCardStyle(person.cardStyle, change.cardStyle)) return blocked('ALREADY');
      return checked(
        tree,
        () => ({
          type: 'batch',
          payload: {
            ops: [
              {
                type: 'updatePerson',
                payload: { id: change.personId, changes: { cardStyle: change.cardStyle } },
              },
            ],
          },
        }),
        { kind: 'cardStyle', personId: change.personId, cleared: change.cardStyle === null },
      );
    }
```

`apps/web/src/features/tree/relateText.ts`, in `changeSentence`, after `photo`:

```ts
    case 'treeTheme':
      return t('tree.relate.done.treeTheme');
    case 'cardStyle':
      return t(summary.cleared ? 'tree.relate.done.cardStyleCleared' : 'tree.relate.done.cardStyle', {
        a: name(summary.personId),
      });
```

`apps/web/src/features/tree/describeOp.ts`:
- Add `'cardStyle' | 'clearCardStyle'` to the first `kind` union of `OpDescription` (the one with `name`).
- In `describeSingle`'s `updatePerson` case, after the photo check, add:

```ts
      if (keys.length === 1 && keys[0] === 'cardStyle') {
        return {
          kind: op.payload.changes.cardStyle === null ? 'clearCardStyle' : 'cardStyle',
          name: person(op.payload.id),
        };
      }
```

- In `describeAction`, add `case 'cardStyle':` and `case 'clearCardStyle':` to the group that returns `t(\`tree.change.${description.kind}\`, { name })`.

Locales:
- `tree.relate.done`:
  - VI: `"treeTheme": "chủ đề cây"`, `"cardStyle": "kiểu thẻ của {{a}}"`, `"cardStyleCleared": "thẻ của {{a}} theo kiểu của cây"`;
  - EN: `"treeTheme": "the tree's theme"`, `"cardStyle": "the card style of {{a}}"`, `"cardStyleCleared": "the card of {{a}} follows the tree's style"`.
- `tree.change`:
  - VI: `"cardStyle": "đổi kiểu thẻ của {{name}}"`, `"clearCardStyle": "cho thẻ của {{name}} theo kiểu của cây"`;
  - EN: `"cardStyle": "change the card style of {{name}}"`, `"clearCardStyle": "set the card of {{name}} back to the tree's style"`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --dir apps/web exec vitest run src/features/tree/changes.test.ts src/features/tree/relateText.test.ts src/features/tree/describeOp.test.ts src/features/tree/ChangeRunner.test.tsx src/features/history src/locales`, then `pnpm typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

Message file `.superpowers/sdd/p6e-task-6-commit.txt`, subject `feat(web): tree theme and card style changes with their sentences`. The body:
- whole-family theme picks and card styles are changes of the change runner: one op each, with the toast, Undo and history text;
- a pick that changes nothing is blocked as ALREADY.

End with the Co-Authored-By line.

```bash
rtk git add apps/web/src
rtk git commit -F .superpowers/sdd/p6e-task-6-commit.txt
```

---

### Task 7: My own choices: the query, the debounced save and the pick helpers

**Files:**
- Create: `apps/web/src/features/tree/useViewPreference.ts`, `useViewPreference.test.tsx`
- Create: `apps/web/src/features/tree/decor.ts`, `decor.test.ts`
- Modify: `apps/web/src/features/tree/fixtures.ts` (`treeRoutes` answers the preference)
- Modify: `apps/web/src/features/tree/TreePage.tsx`, `TreePage.test.tsx` (provide `PersonalThemeContext`)

**Interfaces:**
- Consumes:
  - from Task 1: `ViewPreferenceSchema`, `EMPTY_VIEW_PREFERENCE`, `type ViewPreference`, `MATCHING_FASTENER`, `THEME_DEFAULTS`, `THEME_PARTS`, `cardPartSource`, `resolveCardStyle`, and the theme types;
  - from Task 5: `PersonalThemeContext`.
- Produces (`useViewPreference.ts`):
  - `SAVE_DELAY_MS = 500` and `viewPreferenceKey(clanId) = ['clans', clanId, 'view-preference']`;
  - `type SaveState = 'idle' | 'saving' | 'failed'`;
  - `interface PersonalDecor { preference: ViewPreference | null; change(update: (current: ViewPreference) => ViewPreference): void; saveState: SaveState; retry(): void }`;
  - `usePersonalDecor(clanId: string, options?: { delay?: number }): PersonalDecor`.
- Produces (`decor.ts`):
  - the types `DecorMode = 'me' | 'clan'` and `DecorTarget = { kind: 'tree' } | { kind: 'card'; personId: string }`;
  - `treePick(part: ThemePart, value: string): TreeTheme`;
  - `withTreePick(preference: ViewPreference, pick: TreeTheme): ViewPreference`;
  - `cardStyleWith(style: CardStyle | undefined, part: CardPart, value: string | null): CardStyle | undefined`;
  - `withCardPick(preference: ViewPreference, personId: string, part: CardPart, value: string): ViewPreference`;
  - `withoutCard(preference: ViewPreference, personId: string): ViewPreference`;
  - `changesToMatch(clan: TreeTheme, mine: TreeTheme): TreeThemeChanges | null`;
  - `showsOwnTheme(preference: ViewPreference | null): boolean`;
  - `treeChoice(layers: ThemeLayers, mode: DecorMode, part: ThemePart): string`;
  - `cardChoice(layers: ThemeLayers, mode: DecorMode, personId: string, cardStyle: CardStyle | undefined, part: CardPart): { value: string; source: ThemeSource }`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/tree/decor.test.ts`:

```ts
import { EMPTY_VIEW_PREFERENCE } from '@ancestors-tree/shared';
import { describe, expect, it } from 'vitest';
import {
  cardChoice,
  cardStyleWith,
  changesToMatch,
  showsOwnTheme,
  treeChoice,
  treePick,
  withCardPick,
  withoutCard,
  withTreePick,
} from './decor';

const ID = '64b7f0c2a1b2c3d4e5f6a003';

describe('picks', () => {
  it('a surface brings its matching fastener; other parts go alone', () => {
    expect(treePick('surface', 'fridge')).toEqual({ surface: 'fridge', fastener: 'magnet' });
    expect(treePick('thread', 'yarn')).toEqual({ thread: 'yarn' });
  });

  it('any pick for me turns my theme on, keeping my other choices', () => {
    const off = { enabled: false, theme: { stitch: 'yarn' as const }, cards: {} };
    expect(withTreePick(off, { surface: 'corkboard', fastener: 'pushpin' })).toEqual({
      enabled: true,
      theme: { stitch: 'yarn', surface: 'corkboard', fastener: 'pushpin' },
      cards: {},
    });
    expect(withCardPick(off, ID, 'frame', 'kraft')).toEqual({
      enabled: true,
      theme: { stitch: 'yarn' },
      cards: { [ID]: { frame: 'kraft' } },
    });
  });

  it("sets and removes one part of a card's style", () => {
    expect(cardStyleWith(undefined, 'frame', 'vintage')).toEqual({ frame: 'vintage' });
    expect(cardStyleWith({ frame: 'vintage' }, 'fastener', 'magnet')).toEqual({
      frame: 'vintage',
      fastener: 'magnet',
    });
    expect(cardStyleWith({ frame: 'vintage' }, 'frame', null)).toBeUndefined();
  });

  it("drops only this card's own choice", () => {
    const mine = { enabled: true, theme: {}, cards: { [ID]: { frame: 'kraft' as const } } };
    expect(withoutCard(mine, ID)).toEqual({ enabled: true, theme: {}, cards: {} });
    expect(withoutCard(mine, 'other')).toBe(mine);
  });
});

describe('"Use for the whole family"', () => {
  it('sends the parts I chose that differ, and leaves the rest to the family', () => {
    expect(changesToMatch({ surface: 'fridge', thread: 'yarn' }, { surface: 'corkboard' })).toEqual(
      { surface: 'corkboard' },
    );
    expect(changesToMatch({ surface: 'fridge' }, { surface: 'fridge' })).toBeNull();
    expect(changesToMatch({}, {})).toBeNull();
  });
});

describe('the banner', () => {
  it('shows while my choices are on and there is at least one', () => {
    expect(showsOwnTheme(null)).toBe(false);
    expect(showsOwnTheme(EMPTY_VIEW_PREFERENCE)).toBe(false);
    expect(showsOwnTheme({ ...EMPTY_VIEW_PREFERENCE, enabled: true })).toBe(false);
    expect(showsOwnTheme({ enabled: true, theme: { thread: 'yarn' }, cards: {} })).toBe(true);
    expect(showsOwnTheme({ enabled: false, theme: { thread: 'yarn' }, cards: {} })).toBe(false);
  });
});

describe('what the panel shows as picked', () => {
  const layers = {
    clan: { surface: 'fridge' as const, frame: 'kraft' as const },
    mine: { enabled: true, theme: { surface: 'corkboard' as const }, cards: { [ID]: { fastener: 'magnet' as const } } },
  };

  it("shows mine in my mode, and the family's in the family's", () => {
    expect(treeChoice(layers, 'me', 'surface')).toBe('corkboard');
    expect(treeChoice(layers, 'clan', 'surface')).toBe('fridge');
    expect(treeChoice(layers, 'clan', 'stitch')).toBe('cotton');
    expect(treeChoice({ ...layers, mine: { ...layers.mine, enabled: false } }, 'me', 'surface')).toBe(
      'fridge',
    );
  });

  it('says where a card part comes from in each mode', () => {
    expect(cardChoice(layers, 'me', ID, { frame: 'vintage' }, 'fastener')).toEqual({
      value: 'magnet',
      source: 'myCard',
    });
    expect(cardChoice(layers, 'clan', ID, { frame: 'vintage' }, 'fastener')).toEqual({
      value: 'washi',
      source: 'default',
    });
    expect(cardChoice(layers, 'clan', ID, { frame: 'vintage' }, 'frame')).toEqual({
      value: 'vintage',
      source: 'clanCard',
    });
  });
});
```

`apps/web/src/features/tree/useViewPreference.test.tsx`:

```tsx
import { EMPTY_VIEW_PREFERENCE } from '@ancestors-tree/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '../../app/providers';
import { apiErrorReply, mockApi } from '../../test/api';
import { CLAN_ID } from './fixtures';
import { usePersonalDecor } from './useViewPreference';

const PATH = `/clans/${CLAN_ID}/view-preference`;

function providers() {
  const client = createQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <AppProviders queryClient={client}>{children}</AppProviders>
  );
}

const puts = (api: ReturnType<typeof mockApi>) => api.calls.filter((call) => call.method === 'PUT');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePersonalDecor', () => {
  it('loads my choices, shows picks at once, and saves quick picks with one PUT', async () => {
    const api = mockApi({
      [`GET ${PATH}`]: () => ({ body: EMPTY_VIEW_PREFERENCE }),
      [`PUT ${PATH}`]: ({ body }) => ({ body }),
    });
    const { result } = renderHook(() => usePersonalDecor(CLAN_ID, { delay: 30 }), {
      wrapper: providers(),
    });
    await waitFor(() => expect(result.current.preference).toEqual(EMPTY_VIEW_PREFERENCE));

    act(() => {
      result.current.change((current) => ({ ...current, enabled: true, theme: { surface: 'fridge' } }));
    });
    act(() => {
      result.current.change((current) => ({ ...current, theme: { ...current.theme, thread: 'yarn' } }));
    });
    expect(result.current.preference?.theme).toEqual({ surface: 'fridge', thread: 'yarn' });

    await waitFor(() => expect(puts(api)).toHaveLength(1));
    expect(puts(api)[0]?.body).toEqual({
      enabled: true,
      theme: { surface: 'fridge', thread: 'yarn' },
      cards: {},
    });
    await waitFor(() => expect(result.current.saveState).toBe('idle'));
  });

  it('says a failed save, keeps the picks on screen, and saves them again on retry', async () => {
    let fail = true;
    const api = mockApi({
      [`GET ${PATH}`]: () => ({ body: EMPTY_VIEW_PREFERENCE }),
      [`PUT ${PATH}`]: ({ body }) => (fail ? apiErrorReply('INTERNAL_ERROR', 500) : { body }),
    });
    const { result } = renderHook(() => usePersonalDecor(CLAN_ID, { delay: 10 }), {
      wrapper: providers(),
    });
    await waitFor(() => expect(result.current.preference).not.toBeNull());
    act(() => {
      result.current.change((current) => ({ ...current, enabled: true, theme: { surface: 'corkboard' } }));
    });
    await waitFor(() => expect(result.current.saveState).toBe('failed'));
    expect(result.current.preference?.theme).toEqual({ surface: 'corkboard' });

    fail = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.saveState).toBe('idle'));
    expect(puts(api)).toHaveLength(2);
  });

  it('still sends a waiting pick when the page goes away', async () => {
    const api = mockApi({
      [`GET ${PATH}`]: () => ({ body: EMPTY_VIEW_PREFERENCE }),
      [`PUT ${PATH}`]: ({ body }) => ({ body }),
    });
    const { result, unmount } = renderHook(() => usePersonalDecor(CLAN_ID, { delay: 60_000 }), {
      wrapper: providers(),
    });
    await waitFor(() => expect(result.current.preference).not.toBeNull());
    act(() => {
      result.current.change((current) => ({ ...current, enabled: true }));
    });
    unmount();
    await waitFor(() => expect(puts(api)).toHaveLength(1));
  });

  it('ignores a pick before my choices are loaded', async () => {
    mockApi({ [`GET ${PATH}`]: () => new Promise(() => {}) });
    const { result } = renderHook(() => usePersonalDecor(CLAN_ID), { wrapper: providers() });
    act(() => {
      result.current.change((current) => ({ ...current, enabled: true }));
    });
    expect(result.current.preference).toBeNull();
  });
});
```

In `apps/web/src/features/tree/TreePage.test.tsx`, add:

```tsx
  it('draws my own theme once it loads', async () => {
    mockApi({
      ...treeRoutes(FAMILY, VIEWER),
      [`GET /clans/${CLAN_ID}/view-preference`]: () => ({
        body: { enabled: true, theme: { surface: 'corkboard' }, cards: {} },
      }),
    });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const board = await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    await waitFor(() => expect(board).toHaveAttribute('data-surface', 'corkboard'));
  });
```

Import `waitFor` from `@testing-library/react` there.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --dir apps/web exec vitest run src/features/tree/decor.test.ts src/features/tree/useViewPreference.test.tsx src/features/tree/TreePage.test.tsx`
Expected: FAIL. The modules do not exist, and the page never asks for the preference.

- [ ] **Step 3: Implement**

`apps/web/src/features/tree/decor.ts`:

```ts
import type { ViewPreference } from '@ancestors-tree/shared';
import {
  cardPartSource,
  MATCHING_FASTENER,
  resolveCardStyle,
  THEME_DEFAULTS,
  THEME_PARTS,
  type CardPart,
  type CardStyle,
  type Surface,
  type ThemeLayers,
  type ThemePart,
  type ThemeSource,
  type TreeTheme,
  type TreeThemeChanges,
} from '@ancestors-tree/shared/tree';

/** Who a pick is for (spec §13.4): only me, or the whole clan. */
export type DecorMode = 'me' | 'clan';

/** What the Decorate panel decorates: the whole tree, or one card. */
export type DecorTarget = { kind: 'tree' } | { kind: 'card'; personId: string };

/** A tree-level pick as theme parts: a surface brings its matching fastener (spec §13.4). */
export function treePick(part: ThemePart, value: string): TreeTheme {
  if (part === 'surface') {
    const surface = value as Surface;
    return { surface, fastener: MATCHING_FASTENER[surface] };
  }
  return { [part]: value } as TreeTheme;
}

/** My choices after a tree-level pick. Any pick in "Only me" turns them on (spec §13.4). */
export function withTreePick(preference: ViewPreference, pick: TreeTheme): ViewPreference {
  return { ...preference, enabled: true, theme: { ...preference.theme, ...pick } };
}

/** A card's style with one part set, or removed with null; undefined once no part is left. */
export function cardStyleWith(
  style: CardStyle | undefined,
  part: CardPart,
  value: string | null,
): CardStyle | undefined {
  const next: Record<string, string> = { ...style };
  if (value === null) delete next[part];
  else next[part] = value;
  return Object.keys(next).length === 0 ? undefined : (next as CardStyle);
}

function ownCard(preference: ViewPreference, personId: string): CardStyle | undefined {
  return Object.hasOwn(preference.cards, personId) ? preference.cards[personId] : undefined;
}

/** My choices after a pick for one card; turns them on. */
export function withCardPick(
  preference: ViewPreference,
  personId: string,
  part: CardPart,
  value: string,
): ViewPreference {
  const style = { ...ownCard(preference, personId), [part]: value } as CardStyle;
  return { ...preference, enabled: true, cards: { ...preference.cards, [personId]: style } };
}

/** My choices without this card's own one ("Use the tree's style" in "Only me"). */
export function withoutCard(preference: ViewPreference, personId: string): ViewPreference {
  if (!Object.hasOwn(preference.cards, personId)) return preference;
  const cards = { ...preference.cards };
  delete cards[personId];
  return { ...preference, cards };
}

/**
 * "Use for the whole family": the parts of my tree theme that differ from the clan's. Parts I
 * never chose stay the clan's, so the shared board ends up looking as mine did. Null when it
 * already does.
 */
export function changesToMatch(clan: TreeTheme, mine: TreeTheme): TreeThemeChanges | null {
  const changes: Record<string, string> = {};
  for (const part of THEME_PARTS) {
    const value = mine[part];
    if (value !== undefined && value !== clan[part]) changes[part] = value;
  }
  return Object.keys(changes).length === 0 ? null : (changes as TreeThemeChanges);
}

/** "You are viewing your own theme": my choices are on, and there is at least one. */
export function showsOwnTheme(preference: ViewPreference | null): boolean {
  if (preference === null || !preference.enabled) return false;
  return Object.keys(preference.theme).length > 0 || Object.keys(preference.cards).length > 0;
}

/** The layers as a mode sees them: "Whole family" leaves my own choices out. */
function layersFor(layers: ThemeLayers, mode: DecorMode): ThemeLayers {
  return mode === 'me' ? layers : { clan: layers.clan, mine: null };
}

/** The option a tree-level row shows as picked in this mode. */
export function treeChoice(layers: ThemeLayers, mode: DecorMode, part: ThemePart): string {
  const mine = layersFor(layers, mode).mine;
  const own = mine !== null && mine.enabled ? mine.theme[part] : undefined;
  return own ?? layers.clan[part] ?? THEME_DEFAULTS[part];
}

/** The option a card row shows as picked in this mode, and the layer it comes from. */
export function cardChoice(
  layers: ThemeLayers,
  mode: DecorMode,
  personId: string,
  cardStyle: CardStyle | undefined,
  part: CardPart,
): { value: string; source: ThemeSource } {
  const view = layersFor(layers, mode);
  return {
    value: resolveCardStyle(view, personId, cardStyle)[part],
    source: cardPartSource(view, personId, cardStyle, part),
  };
}
```

`apps/web/src/features/tree/useViewPreference.ts`:

```ts
import { ViewPreferenceSchema, type ViewPreference } from '@ancestors-tree/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { apiRequest } from '../../shared/lib/apiClient';

/** Picks within this many ms of each other are saved with one request (spec §13.4). */
export const SAVE_DELAY_MS = 500;

export function viewPreferenceKey(clanId: string) {
  return ['clans', clanId, 'view-preference'] as const;
}

function fetchViewPreference(clanId: string, signal?: AbortSignal): Promise<ViewPreference> {
  return apiRequest(`/clans/${clanId}/view-preference`, ViewPreferenceSchema, { signal });
}

function saveViewPreference(clanId: string, preference: ViewPreference): Promise<ViewPreference> {
  return apiRequest(`/clans/${clanId}/view-preference`, ViewPreferenceSchema, {
    method: 'PUT',
    json: preference,
  });
}

export type SaveState = 'idle' | 'saving' | 'failed';

export interface PersonalDecor {
  /** My choices as shown; null until they load (or when they could not be loaded). */
  preference: ViewPreference | null;
  /** Changes my choices at once and saves them a moment later; nothing before they load. */
  change: (update: (current: ViewPreference) => ViewPreference) => void;
  saveState: SaveState;
  /** Sends my current choices again, after a failed save. */
  retry: () => void;
}

/**
 * "Only for me" (spec §13.4). The board follows the query cache at once. One PUT of the whole
 * preference goes `delay` ms after the last pick; the saves run one at a time, so the last one
 * asked for is the last one stored. No undo: picking again is the undo.
 */
export function usePersonalDecor(
  clanId: string,
  { delay = SAVE_DELAY_MS }: { delay?: number } = {},
): PersonalDecor {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: viewPreferenceKey(clanId),
    queryFn: ({ signal }) => fetchViewPreference(clanId, signal),
    // Only this page changes it, and the cache holds picks not saved yet: never refetch them away.
    staleTime: Infinity,
  });
  const latestSave = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { mutate, isPending, isError } = useMutation({
    mutationFn: ({ preference }: { preference: ViewPreference; save: number }) =>
      saveViewPreference(clanId, preference),
    // One at a time, in the order asked for.
    scope: { id: `view-preference:${clanId}` },
    onSuccess: (saved, { save }) => {
      // Picks made since are on screen already; their own save answers for them.
      if (save === latestSave.current) queryClient.setQueryData(viewPreferenceKey(clanId), saved);
    },
  });

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const preference = queryClient.getQueryData<ViewPreference>(viewPreferenceKey(clanId));
    if (preference === undefined) return;
    latestSave.current += 1;
    mutate({ preference, save: latestSave.current });
  }, [clanId, mutate, queryClient]);

  const change = useCallback(
    (update: (current: ViewPreference) => ViewPreference) => {
      const key = viewPreferenceKey(clanId);
      const current = queryClient.getQueryData<ViewPreference>(key);
      if (current === undefined) return;
      void queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, update(current));
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [clanId, delay, flush, queryClient],
  );

  // Leaving the page still saves a pick that is waiting.
  const flushWaiting = useCallback(() => {
    if (timer.current !== undefined) flush();
  }, [flush]);
  useEffect(() => flushWaiting, [flushWaiting]);

  return {
    preference: query.data ?? null,
    change,
    saveState: isPending ? 'saving' : isError ? 'failed' : 'idle',
    retry: flush,
  };
}
```

`apps/web/src/features/tree/fixtures.ts`: import `EMPTY_VIEW_PREFERENCE` from `@ancestors-tree/shared`, and add to the object `treeRoutes` returns:

```ts
    // Nobody decorated yet; a save answers what it got.
    [`GET /clans/${CLAN_ID}/view-preference`]: () => ({ body: EMPTY_VIEW_PREFERENCE }),
    [`PUT /clans/${CLAN_ID}/view-preference`]: ({ body }) => ({ body }),
```

`apps/web/src/features/tree/TreePage.tsx`:
- import `PersonalThemeContext` from `./decorContext` and `usePersonalDecor` from `./useViewPreference`;
- call `const decor = usePersonalDecor(clan.id);` next to `useClanTree`, before any early return;
- wrap the returned tree, inside `OpenPersonContext`, in `<PersonalThemeContext value={decor.preference}>…</PersonalThemeContext>`.

Some tests build their own route table without `treeRoutes` and assert `api.unhandled` is empty. Run the whole tree folder; where such a test now lists `GET /clans/…/view-preference`, add the `GET` route to its table.

- [ ] **Step 4: Run the tests**

Run: `pnpm --dir apps/web exec vitest run src/features/tree`, then `pnpm typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

Message file `.superpowers/sdd/p6e-task-7-commit.txt`, subject `feat(web): my own tree theme, saved once after quick picks`. The body:
- `usePersonalDecor` loads the view preference with TanStack Query and shows picks at once;
- it saves the whole preference about 500 ms after the last pick, one save at a time, so the last one wins;
- it reports a failed save with a retry;
- the pick helpers turn "Only me" on with any pick, and "Use for the whole family" sends only the parts that differ;
- the tree page draws my theme once it loads.

End with the Co-Authored-By line.

```bash
rtk git add apps/web/src/features/tree
rtk git commit -F .superpowers/sdd/p6e-task-7-commit.txt
```

---

### Task 8: The Decorate panel and the toolbar button

**Files:**
- Create: `apps/web/src/features/tree/sidePanel.ts`, `DecoratePanel.tsx`, `DecoratePanel.test.tsx`
- Modify: `apps/web/src/features/tree/ProfilePanel.tsx` (use `sidePanel.ts`)
- Modify: `apps/web/src/features/tree/TreeToolbar.tsx`, `TreePage.tsx`, `TreePage.test.tsx`
- Modify: `apps/web/src/locales/vi.json`, `en.json` (the rest of `tree.decor`)

**Interfaces:**
- Consumes:
  - from Task 6: `ChangeContext` and the `treeTheme` and `cardStyle` changes;
  - from Task 7: `PersonalDecor`, `DecorMode`, `DecorTarget`, `treePick`, `withTreePick`, `cardStyleWith`, `withCardPick`, `withoutCard`, `treeChoice` and `cardChoice`;
  - from Task 5: `useThemeLayers`;
  - from Task 4: `ThemeSwatch` and `themeOptionKey`.
- Produces:
  - `SIDE_PANEL_CLASS` and `WIDE_QUERY` (`sidePanel.ts`);
  - `DecoratePanel` with the props `{ target: DecorTarget; mode: DecorMode; onModeChange(mode): void; canEdit: boolean; decor: PersonalDecor; onClose(): void }`. It draws both targets: five rows for the tree; for a card, two rows, the "Different from the tree" mark and "Use the tree's style";
  - the `TreeToolbar` prop `onDecorate?: () => void`;
  - in `TreePage`:
    - the `mode` (viewers: always `'me'`; editors: their choice, else `'me'` while their own theme is on, else `'clan'`);
    - `openDecorate(target: DecorTarget)` and `closeDecorate()`;
    - the side column shows the Decorate panel instead of the profile while it is open, and opening a profile closes it;
    - Decorate does not open over unsaved profile changes.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/tree/DecoratePanel.test.tsx`:

```tsx
import { EMPTY_VIEW_PREFERENCE, type ViewPreference } from '@ancestors-tree/shared';
import { treeStateFromLists, type TreeTheme } from '@ancestors-tree/shared/tree';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { ChangeContext, type RequestChange } from './ChangeRunner';
import { DecoratePanel } from './DecoratePanel';
import { PersonalThemeContext } from './decorContext';
import { CLAN_ID, FAMILY, ME, SON } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import type { PersonalDecor } from './useViewPreference';

function showTree(theme: TreeTheme = {}, sonStyle?: { frame?: 'vintage' }) {
  const persons = FAMILY.persons.map((person) =>
    person.id === SON && sonStyle ? { ...person, cardStyle: sonStyle } : person,
  );
  const tree = treeStateFromLists(FAMILY.progenitorId, persons, FAMILY.unions, theme);
  useTreeStore.setState({
    clanId: CLAN_ID,
    status: 'ready',
    tree,
    confirmedTree: tree,
    confirmedVersion: 3,
  });
}

function fakeDecor(preference: ViewPreference | null = EMPTY_VIEW_PREFERENCE) {
  return { preference, change: vi.fn(), saveState: 'idle', retry: vi.fn() } satisfies PersonalDecor;
}

function renderPanel(
  props: Partial<ComponentProps<typeof DecoratePanel>> = {},
  requestChange: RequestChange | null = vi.fn(),
) {
  const decor = props.decor ?? fakeDecor();
  const onClose = vi.fn();
  renderWithProviders(
    <ChangeContext value={requestChange}>
      <PersonalThemeContext value={decor.preference}>
        <DecoratePanel
          target={{ kind: 'tree' }}
          mode="clan"
          onModeChange={vi.fn()}
          canEdit
          decor={decor}
          onClose={onClose}
          {...props}
        />
      </PersonalThemeContext>
    </ChangeContext>,
  );
  return { decor, requestChange, onClose };
}

/** The update `change` was called with, applied to a preference. */
function applied(decor: ReturnType<typeof fakeDecor>, to: ViewPreference = EMPTY_VIEW_PREFERENCE) {
  const update = decor.change.mock.calls.at(-1)?.[0] as (current: ViewPreference) => ViewPreference;
  return update(to);
}

beforeEach(() => {
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
});

describe('DecoratePanel, the whole tree', () => {
  it("shows the family's choices and sends a surface with its fastener as one change", async () => {
    showTree({ thread: 'yarn' });
    const { requestChange } = renderPanel();
    const panel = screen.getByRole('complementary', { name: 'Trang trí cây' });
    expect(within(panel).getByRole('heading', { name: 'Trang trí cây' })).toHaveFocus();
    const thread = screen.getByRole('group', { name: 'Sợi chỉ cha con' });
    expect(within(thread).getByRole('radio', { name: 'Sợi len' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Giấy ô li' })).toBeChecked();

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Bảng gỗ bần' }));
    expect(requestChange).toHaveBeenCalledWith({
      change: { kind: 'treeTheme', changes: { surface: 'corkboard', fastener: 'pushpin' } },
    });
  });

  it('only me: a pick changes my choices and turns them on', async () => {
    showTree();
    const { decor, requestChange } = renderPanel({ mode: 'me' });
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Cửa tủ lạnh' }));
    expect(requestChange).not.toHaveBeenCalled();
    expect(applied(decor)).toEqual({
      enabled: true,
      theme: { surface: 'fridge', fastener: 'magnet' },
      cards: {},
    });
  });

  it('disables "Whole family" for viewers, and says why', () => {
    showTree();
    renderPanel({ mode: 'me', canEdit: false }, null);
    expect(screen.getByRole('radio', { name: 'Cả họ' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Chỉ mình tôi' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Áp dụng cho' })).toHaveAccessibleDescription(
      'Người xem chỉ trang trí được cho riêng mình.',
    );
  });

  it('switches the mode', async () => {
    showTree();
    const onModeChange = vi.fn();
    renderPanel({ onModeChange });
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Chỉ mình tôi' }));
    expect(onModeChange).toHaveBeenCalledWith('me');
  });

  it('waits for my choices before "Only me" picks', () => {
    showTree();
    renderPanel({ mode: 'me', decor: fakeDecor(null) });
    expect(screen.getByRole('radio', { name: 'Bảng gỗ bần' })).toBeDisabled();
  });

  it('closes with Escape and with its close button', async () => {
    showTree();
    const { onClose } = renderPanel();
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Đóng trang trí' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('DecoratePanel, one card', () => {
  it("shows the frame and fastener only, marks the card's own choice, and follows the tree again", async () => {
    showTree({}, { frame: 'vintage' });
    const { requestChange } = renderPanel({ target: { kind: 'card', personId: SON } });
    screen.getByRole('complementary', { name: 'Trang trí thẻ của Nguyễn Văn Nam' });
    expect(screen.queryByRole('group', { name: 'Mặt bảng' })).not.toBeInTheDocument();
    const frame = screen.getByRole('group', { name: 'Khung ảnh' });
    expect(within(frame).getByRole('radio', { name: 'Ảnh xưa' })).toBeChecked();
    expect(within(frame).getByText('Khác với cây')).toBeInTheDocument();
    const fastener = screen.getByRole('group', { name: 'Đồ gắn' });
    expect(within(fastener).queryByText('Khác với cây')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(fastener).getByRole('radio', { name: 'Nam châm' }));
    expect(requestChange).toHaveBeenLastCalledWith({
      change: {
        kind: 'cardStyle',
        personId: SON,
        cardStyle: { frame: 'vintage', fastener: 'magnet' },
      },
    });
    await user.click(screen.getByRole('button', { name: 'Dùng kiểu của cây' }));
    expect(requestChange).toHaveBeenLastCalledWith({
      change: { kind: 'cardStyle', personId: SON, cardStyle: null },
    });
  });

  it("only me: my card pick, and \"Use the tree's style\" drops only mine", async () => {
    showTree({}, { frame: 'vintage' });
    const decor = fakeDecor({ enabled: true, theme: {}, cards: { [SON]: { fastener: 'pushpin' } } });
    renderPanel({ target: { kind: 'card', personId: SON }, mode: 'me', decor });
    const fastener = screen.getByRole('group', { name: 'Đồ gắn' });
    expect(within(fastener).getByRole('radio', { name: 'Đinh ghim' })).toBeChecked();
    expect(within(fastener).getByText('Khác với cây')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Dùng kiểu của cây' }));
    expect(applied(decor, decor.preference)).toEqual({ enabled: true, theme: {}, cards: {} });
  });

  it("disables \"Use the tree's style\" when the card has no choice of its own in this mode", () => {
    showTree();
    renderPanel({ target: { kind: 'card', personId: SON } });
    expect(screen.getByRole('button', { name: 'Dùng kiểu của cây' })).toBeDisabled();
  });
});
```

In `apps/web/src/features/tree/TreePage.test.tsx`, add the block below. Import `batchOps` and `editableTree` from `./testKit`, `useProfileDraft` from `./profileDraft`, and `waitFor` and `screen` from `@testing-library/react` if missing.

```tsx
describe('Decorate on the tree page', () => {
  const PREFERENCE = `/clans/${CLAN_ID}/view-preference`;

  it('opens the panel; a whole-family pick is one undoable change', async () => {
    const sent = editableTree(FAMILY);
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const board = await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    await user.click(screen.getByRole('button', { name: 'Trang trí' }));
    const panel = screen.getByRole('complementary', { name: 'Trang trí cây' });
    expect(within(panel).getByRole('radio', { name: 'Cả họ' })).toBeChecked();

    await user.click(within(panel).getByRole('radio', { name: 'Bảng gỗ bần' }));
    expect(board).toHaveAttribute('data-surface', 'corkboard');
    expect(await screen.findByText('Đã đổi: chủ đề cây')).toBeInTheDocument();
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0])).toEqual([
      { type: 'setTreeTheme', payload: { changes: { surface: 'corkboard', fastener: 'pushpin' } } },
    ]);

    await user.click(screen.getByRole('button', { name: 'Hoàn tác thay đổi này' }));
    expect(board).toHaveAttribute('data-surface', 'grid-paper');
  });

  it('only me: the board changes at once and one PUT saves it, with no op', async () => {
    const api = mockApi(treeRoutes(FAMILY));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const board = await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    await user.click(screen.getByRole('button', { name: 'Trang trí' }));
    await user.click(screen.getByRole('radio', { name: 'Chỉ mình tôi' }));
    await user.click(screen.getByRole('radio', { name: 'Cửa tủ lạnh' }));
    expect(board).toHaveAttribute('data-surface', 'fridge');
    await waitFor(
      () => expect(api.calls.filter((call) => call.method === 'PUT' && call.path === PREFERENCE)).toHaveLength(1),
      { timeout: 2000 },
    );
    expect(api.calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('closes the panel when a profile opens, and gives focus back on close', async () => {
    mockApi(treeRoutes(FAMILY, VIEWER));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    const open = screen.getByRole('button', { name: 'Trang trí' });
    await user.click(open);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Trang trí cây' })).not.toBeInTheDocument();
    expect(open).toHaveFocus();

    await user.click(open);
    await user.click(screen.getByRole('button', { name: /^Nguyễn Văn Nam,/ }));
    expect(screen.queryByRole('complementary', { name: 'Trang trí cây' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Nguyễn Văn Nam' })).toBeInTheDocument();
  });

  it('does not open over unsaved profile changes', async () => {
    mockApi(treeRoutes(FAMILY));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    act(() => useProfileDraft.setState({ dirty: true }));
    await user.click(screen.getByRole('button', { name: 'Trang trí' }));
    expect(screen.queryByRole('complementary', { name: 'Trang trí cây' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Hãy lưu hoặc huỷ thay đổi trong hồ sơ trước khi trang trí.'),
    ).toBeInTheDocument();
    act(() => useProfileDraft.setState({ dirty: false }));
  });
});
```

If a click on a card's button with the side column open lands on the panel in jsdom, open the person through the URL instead. Follow `ProfilePanel.test.tsx`.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --dir apps/web exec vitest run src/features/tree/DecoratePanel.test.tsx src/features/tree/TreePage.test.tsx`
Expected: FAIL. There is no `DecoratePanel` and no "Trang trí" button.

- [ ] **Step 3: Implement**

`apps/web/src/features/tree/sidePanel.ts`. Move the two constants out of `ProfilePanel.tsx`, and import them there:

```ts
/** Tailwind's md (48rem): from here up a side panel is a column beside the board, not a sheet. */
export const WIDE_QUERY = '(min-width: 48rem)';

/**
 * The profile and Decorate panels (spec §7.6, §13.4): a bottom sheet on small screens; from md
 * up, a sticky column beside the board, in the page flow under the header, so it never covers
 * the header or the notices (WCAG 2.4.11).
 */
export const SIDE_PANEL_CLASS =
  'fixed inset-x-0 bottom-0 z-30 flex max-h-[75vh] flex-col gap-4 overflow-y-auto rounded-t-control border-t border-line bg-paper p-4 shadow-lift md:sticky md:inset-x-auto md:top-4 md:bottom-auto md:z-auto md:max-h-[calc(100dvh-2rem)] md:w-[400px] md:shrink-0 md:rounded-control md:border md:shadow-none';
```

In `ProfilePanel.tsx`, the `<aside>`'s `className` becomes `{SIDE_PANEL_CLASS}`. Keep its comment, shortened to "See SIDE_PANEL_CLASS."

`apps/web/src/features/tree/DecoratePanel.tsx`:

```tsx
import {
  CARD_PARTS,
  THEME_OPTIONS,
  THEME_PARTS,
  type CardPart,
  type ThemePart,
} from '@ancestors-tree/shared/tree';
import { X } from 'lucide-react';
import { useContext, useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, inertOthers, ThemeSwatch, themeOptionKey, useMediaQuery } from '../../shared/ui';
import { ChangeContext } from './ChangeRunner';
import {
  cardChoice,
  cardStyleWith,
  treeChoice,
  treePick,
  withCardPick,
  withoutCard,
  withTreePick,
  type DecorMode,
  type DecorTarget,
} from './decor';
import { useThemeLayers } from './decorContext';
import { SIDE_PANEL_CLASS, WIDE_QUERY } from './sidePanel';
import { useTreeStore } from './store';
import type { PersonalDecor } from './useViewPreference';

interface DecoratePanelProps {
  target: DecorTarget;
  mode: DecorMode;
  onModeChange: (mode: DecorMode) => void;
  /** Editors and the Owner may decorate for the whole family (spec §3). */
  canEdit: boolean;
  decor: PersonalDecor;
  onClose: () => void;
}

const MODES = ['me', 'clan'] as const;

/**
 * Decorate (spec §13.4): the whole tree, or one card's frame and fastener; for me or for the
 * whole family. A side panel on wide screens, a modal bottom sheet on small ones, like the
 * profile.
 */
export function DecoratePanel({
  target,
  mode,
  onModeChange,
  canEdit,
  decor,
  onClose,
}: DecoratePanelProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const hintId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const requestChange = useContext(ChangeContext);
  const layers = useThemeLayers();
  const personId = target.kind === 'card' ? target.personId : null;
  const person = useTreeStore((state) =>
    personId === null ? undefined : state.tree.persons[personId],
  );

  // Focus moves in when the panel opens, so a screen reader says what it decorates.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  // Below md the panel is a modal sheet, as the profile is (ProfilePanel).
  const wide = useMediaQuery(WIDE_QUERY);
  useEffect(() => {
    const element = panel.current;
    if (wide || element === null) return;
    const undo = inertOthers(element);
    const active = document.activeElement;
    if (active === null || !element.contains(active)) heading.current?.focus();
    return undo;
  }, [wide]);

  // The card's person left the tree (deleted, or their addition undone): nothing to decorate.
  const missing = personId !== null && person === undefined;
  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);
  if (missing) return null;

  // "Only me" waits for my choices to load; "Whole family" needs the change runner (editors).
  const ready = mode === 'clan' ? requestChange !== null : decor.preference !== null;
  const parts: readonly ThemePart[] = person === undefined ? THEME_PARTS : CARD_PARTS;
  const ownCard =
    person === undefined
      ? false
      : mode === 'clan'
        ? person.cardStyle !== undefined
        : Object.hasOwn(decor.preference?.cards ?? {}, person.id);

  const pick = (part: ThemePart, value: string) => {
    if (person === undefined) {
      const changes = treePick(part, value);
      if (mode === 'clan') requestChange?.({ change: { kind: 'treeTheme', changes } });
      else decor.change((current) => withTreePick(current, changes));
      return;
    }
    const cardPart = part as CardPart;
    if (mode === 'clan') {
      const cardStyle = cardStyleWith(person.cardStyle, cardPart, value) ?? null;
      requestChange?.({ change: { kind: 'cardStyle', personId: person.id, cardStyle } });
    } else {
      decor.change((current) => withCardPick(current, person.id, cardPart, value));
    }
  };

  const followTree = () => {
    if (person === undefined) return;
    if (mode === 'clan') {
      requestChange?.({ change: { kind: 'cardStyle', personId: person.id, cardStyle: null } });
    } else {
      decor.change((current) => withoutCard(current, person.id));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // The Escape that ends an IME composition belongs to the input method.
    if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onClose();
  };

  return (
    <aside ref={panel} aria-labelledby={headingId} onKeyDown={onKeyDown} className={SIDE_PANEL_CLASS}>
      <div className="flex items-start justify-between gap-2">
        <h2
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="text-xl font-bold text-ink focus:outline-none"
        >
          {person === undefined
            ? t('tree.decor.title')
            : t('tree.decor.cardTitle', { name: person.fullName })}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('tree.decor.close')}
          title={t('tree.decor.close')}
          onClick={onClose}
        >
          <X aria-hidden="true" strokeWidth={1.75} className="size-5" />
        </Button>
      </div>

      <fieldset aria-describedby={canEdit ? undefined : hintId} className="flex flex-col gap-2">
        <legend className="font-medium text-ink">{t('tree.decor.applyTo')}</legend>
        <div className="flex flex-wrap gap-4">
          {MODES.map((value) => (
            <label key={value} className="flex items-center gap-2 text-ink">
              <input
                type="radio"
                name={`${headingId}-mode`}
                value={value}
                checked={mode === value}
                disabled={value === 'clan' && !canEdit}
                onChange={() => onModeChange(value)}
                className="accent-accent"
              />
              {t(`tree.decor.mode.${value}`)}
            </label>
          ))}
        </div>
        {canEdit ? null : (
          <p id={hintId} className="text-sm text-ink-muted">
            {t('tree.decor.viewerHint')}
          </p>
        )}
      </fieldset>

      {parts.map((part) => {
        const choice =
          person === undefined
            ? { value: treeChoice(layers, mode, part), source: null }
            : cardChoice(layers, mode, person.id, person.cardStyle, part as CardPart);
        const different = choice.source === 'myCard' || choice.source === 'clanCard';
        return (
          <fieldset key={part} disabled={!ready} className="flex flex-col gap-2">
            {/* The mark sits outside the legend, so the group's name stays the part's name. */}
            <legend className="font-medium text-ink">{t(`tree.decor.parts.${part}`)}</legend>
            {different ? (
              <p className="w-fit rounded-pill bg-sticker px-2 text-xs text-on-sticker">
                {t('tree.decor.card.different')}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {THEME_OPTIONS[part].map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer flex-col items-center gap-1 rounded-control border border-line p-2 text-ink has-checked:border-accent has-checked:bg-paper-grid has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent has-disabled:cursor-not-allowed has-disabled:opacity-60"
                >
                  <input
                    type="radio"
                    name={`${headingId}-${part}`}
                    value={value}
                    checked={choice.value === value}
                    onChange={() => pick(part, value)}
                    className="sr-only"
                  />
                  <ThemeSwatch part={part} value={value} />
                  <span className="text-sm">{t(themeOptionKey(part, value))}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}

      {person === undefined ? null : (
        <Button variant="secondary" disabled={!ready || !ownCard} onClick={followTree}>
          {t('tree.decor.card.useTree')}
        </Button>
      )}
    </aside>
  );
}
```

`apps/web/src/features/tree/TreeToolbar.tsx`:
- Import `Palette` from `lucide-react`, and add the prop `onDecorate?: () => void`.
- Update the comment: "…then Decorate for everyone (spec §13.4), then the save status."
- Render this before `<SaveStatus />`:

```tsx
      {onDecorate ? (
        <Button variant="secondary" size="sm" onClick={onDecorate}>
          <Palette aria-hidden="true" strokeWidth={1.75} className="size-4" />
          {t('tree.decor.open')}
        </Button>
      ) : null}
```

`apps/web/src/features/tree/TreePage.tsx`:
- Import `DecoratePanel` from `./DecoratePanel`, `type DecorMode, type DecorTarget` from `./decor`, and `useProfileDraft` from `./profileDraft`.
- After `const decor = usePersonalDecor(clan.id);`, before any early return, add:

```tsx
  // Decorate (spec §13.4). Viewers decorate only for themselves. Editors start where they are:
  // on their own theme while it is on, else on the family's; a switch they made stays.
  const [decorating, setDecorating] = useState<DecorTarget | null>(null);
  const [chosenMode, setChosenMode] = useState<DecorMode | null>(null);
  const mode: DecorMode = !canEdit
    ? 'me'
    : (chosenMode ?? (decor.preference?.enabled === true ? 'me' : 'clan'));
  const decorOpener = useRef<HTMLElement | null>(null);
  const openDecorate = useCallback(
    (target: DecorTarget) => {
      // The panel takes the profile's column: a profile form with unsaved changes would lose them.
      if (useProfileDraft.getState().dirty) {
        setNotice(t('tree.decor.saveFirst'));
        return;
      }
      const active = document.activeElement;
      decorOpener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      setDecorating(target);
    },
    [t],
  );
  const closeDecorate = useCallback(() => setDecorating(null), []);

  // Opening someone's profile closes Decorate: the profile takes the column.
  useEffect(() => {
    setDecorating(null);
  }, [personId]);

  // Decorate closed with focus inside it: back to what opened it, else the card it decorated.
  const lastTarget = useRef<DecorTarget | null>(null);
  useEffect(() => {
    const previous = lastTarget.current;
    lastTarget.current = decorating;
    if (previous === null || decorating !== null) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    const opener = decorOpener.current;
    const card = previous.kind === 'card' ? personCardButton(previous.personId) : null;
    (opener?.isConnected ? opener : (card ?? document.querySelector<HTMLElement>('main')))?.focus();
  }, [decorating]);
```

`setNotice` and `t` are declared above in the component. Keep the hooks above the early returns.

- `TreeToolbar` gets `onDecorate={isEmpty ? undefined : () => openDecorate({ kind: 'tree' })}`.
- The side column becomes:

```tsx
            {decorating !== null ? (
              <DecoratePanel
                key={decorating.kind === 'card' ? decorating.personId : 'tree'}
                target={decorating}
                mode={mode}
                onModeChange={setChosenMode}
                canEdit={canEdit}
                decor={decor}
                onClose={closeDecorate}
              />
            ) : personId !== null ? (
              <ProfilePanel
                key={personId}
                clanId={clan.id}
                personId={personId}
                isOwner={isOwner}
                actions={actions}
                onClose={closeProfile}
                onMissing={onMissing}
                onDraftLost={onDraftLost}
              />
            ) : null}
```

When Decorate closes and a profile is still in the URL, the profile comes back. Its own effect focuses its heading first, so the focus effect above leaves focus there.

Locales: complete `tree.decor` (`parts` and `options` are already there from Task 4).

`vi.json`:

```json
      "open": "Trang trí",
      "title": "Trang trí cây",
      "cardTitle": "Trang trí thẻ của {{name}}",
      "close": "Đóng trang trí",
      "applyTo": "Áp dụng cho",
      "mode": { "me": "Chỉ mình tôi", "clan": "Cả họ" },
      "viewerHint": "Người xem chỉ trang trí được cho riêng mình.",
      "saveFirst": "Hãy lưu hoặc huỷ thay đổi trong hồ sơ trước khi trang trí.",
      "card": {
        "open": "Trang trí thẻ này…",
        "useTree": "Dùng kiểu của cây",
        "different": "Khác với cây"
      },
      "banner": {
        "text": "Bạn đang xem chủ đề của riêng mình.",
        "back": "Về chủ đề chung",
        "useForClan": "Dùng cho cả họ"
      },
      "save": {
        "failed": "Chưa lưu được phần trang trí của bạn.",
        "retry": "Thử lưu lại"
      },
```

`en.json`:

```json
      "open": "Decorate",
      "title": "Decorate the tree",
      "cardTitle": "Decorate the card of {{name}}",
      "close": "Close decorating",
      "applyTo": "Apply to",
      "mode": { "me": "Only me", "clan": "Whole family" },
      "viewerHint": "Viewers can decorate only for themselves.",
      "saveFirst": "Save or cancel the profile changes before decorating.",
      "card": {
        "open": "Decorate this card…",
        "useTree": "Use the tree's style",
        "different": "Different from the tree"
      },
      "banner": {
        "text": "You are viewing your own theme.",
        "back": "Back to the shared theme",
        "useForClan": "Use for the whole family"
      },
      "save": {
        "failed": "Your decoration was not saved.",
        "retry": "Try saving again"
      },
```

Task 9 uses `card.open`, `banner.*` and `save.*`. They are added here so the locale files change once.

- [ ] **Step 4: Run the tests**

Run: `pnpm --dir apps/web exec vitest run src/features/tree src/locales`, then `pnpm typecheck` and `pnpm lint`.
Expected: PASS.

- [ ] **Step 5: Commit**

Message file `.superpowers/sdd/p6e-task-8-commit.txt`, subject `feat(web): the Decorate panel, for the whole family or only me`. The body:
- "Trang trí" in the toolbar opens a side panel (a bottom sheet on small screens) with "Apply to: Only me / Whole family" and one row of live previews per part;
- whole-family picks are undoable changes, and a surface brings its fastener;
- my picks show at once and save a moment later;
- viewers have only "Only me", and the panel says why;
- for one card, it shows the two card rows, marks the card's own choices and offers "Use the tree's style".

End with the Co-Authored-By line.

```bash
rtk git add apps/web/src
rtk git commit -F .superpowers/sdd/p6e-task-8-commit.txt
```

---

### Task 9: "Decorate this card…", the banner and the save error

**Files:**
- Create: `apps/web/src/features/tree/ThemeBanner.tsx`
- Modify: `apps/web/src/features/tree/decor.ts`, `decor.test.ts` (`withDecorate`)
- Modify: `apps/web/src/features/tree/decorContext.ts` (`DecorateContext`)
- Modify: `apps/web/src/features/tree/CardMenu.tsx`, `CardMenu.test.tsx`
- Modify: `apps/web/src/features/tree/ProfilePanel.tsx`
- Modify: `apps/web/src/features/tree/TreePage.tsx`, `TreePage.test.tsx`

**Interfaces:**
- Consumes:
  - from Task 7: `usePersonalDecor` (`preference`, `change`, `saveState`, `retry`), `showsOwnTheme`, `changesToMatch` and `DecorTarget`;
  - from Task 8: `openDecorate`, and the strings `tree.decor.card.open`, `tree.decor.banner.*` and `tree.decor.save.*`.
- Produces:
  - `withDecorate<T extends string>(actions: readonly T[]): (T | 'decorate')[]`, which puts "Decorate this card…" just before Delete, or last;
  - `DecorateContext: Context<((target: DecorTarget) => void) | null>`, provided by `TreePage` for every member (viewers included);
  - `ThemeBanner` with the props `{ onBack(): void; onUseForClan: (() => void) | null }`;
  - `DecorSaveError` with the props `{ onRetry(): void }`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/tree/decor.test.ts`, add:

```ts
describe('withDecorate', () => {
  it('puts "Decorate this card…" just before Delete, else last', () => {
    expect(withDecorate(['addChild', 'delete'])).toEqual(['addChild', 'decorate', 'delete']);
    expect(withDecorate(['addChild'])).toEqual(['addChild', 'decorate']);
    expect(withDecorate([])).toEqual(['decorate']);
  });
});
```

Add `withDecorate` to that file's import from `./decor`.

`apps/web/src/features/tree/CardMenu.test.tsx`:
- `renderMenu` takes a second argument `decorate: ((target: DecorTarget) => void) | null = null`, and wraps the menu in `<DecorateContext value={decorate}>` inside `PersonActionsContext`;
- it puts a person `p1` in the store before rendering:

```tsx
function renderMenu(
  api: PersonActionsApi | null,
  decorate: ((target: DecorTarget) => void) | null = null,
) {
  // "Decorate this card…" is offered only for a person in the tree.
  const persons = FAMILY.persons.filter((person) => person.id === SON);
  const tree = treeStateFromLists(null, persons.map((person) => ({ ...person, id: 'p1' })), []);
  useTreeStore.setState({ tree, confirmedTree: tree });
  return renderWithProviders(
    <PersonActionsContext value={api}>
      <DecorateContext value={decorate}>
        <CardMenu personId="p1">
          <button type="button">Nguyễn Văn Nam, đời thứ 2</button>
        </CardMenu>
      </DecorateContext>
    </PersonActionsContext>,
  );
}
```

Add `resetTreeStore()` to the file's `afterEach`. Import `treeStateFromLists` from `@ancestors-tree/shared/tree`, `DecorateContext` from `./decorContext` and `type DecorTarget` from `./decor`.

Then add these tests to `describe('CardMenu')`:

```tsx
  it('offers "Decorate this card…" just before Delete', async () => {
    const decorate = vi.fn();
    renderMenu({ actionsFor: () => ['addChild', 'delete'], run: vi.fn() }, decorate);
    fireEvent.contextMenu(screen.getByRole('button', { name: /Nguyễn Văn Nam/ }));
    await screen.findByRole('menu');
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Thêm con',
      'Trang trí thẻ này…',
      'Xoá người này',
    ]);
    await userEvent.setup().click(screen.getByRole('menuitem', { name: 'Trang trí thẻ này…' }));
    expect(decorate).toHaveBeenCalledWith({ kind: 'card', personId: 'p1' });
  });

  it('gives viewers a menu with only "Decorate this card…"', async () => {
    renderMenu(null, vi.fn());
    fireEvent.contextMenu(screen.getByRole('button', { name: /Nguyễn Văn Nam/ }));
    await screen.findByRole('menu');
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Trang trí thẻ này…',
    ]);
  });
```

The board test `'leaves the browser’s own menu to viewers'` no longer holds: viewers now have a menu. Replace it with:

```tsx
  it('gives viewers "Decorate this card…", which opens the card panel for them alone', async () => {
    mockApi(treeRoutes(FAMILY, { ...CLAN, role: 'viewer' }));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const card = await cardOf('Nguyễn Văn Nam');
    expect(fireEvent.contextMenu(card)).toBe(false);
    await userEvent.setup().click(await screen.findByRole('menuitem', { name: 'Trang trí thẻ này…' }));
    const panel = screen.getByRole('complementary', { name: 'Trang trí thẻ của Nguyễn Văn Nam' });
    expect(within(panel).getByRole('radio', { name: 'Chỉ mình tôi' })).toBeChecked();
    expect(within(panel).getByRole('radio', { name: 'Cả họ' })).toBeDisabled();
  });
```

`apps/web/src/features/tree/TreePage.test.tsx`, add:

```tsx
describe('my own theme on the tree page', () => {
  const PREFERENCE = `/clans/${CLAN_ID}/view-preference`;
  const MINE = { enabled: true, theme: { surface: 'corkboard' }, cards: {} };

  it('says I see my own theme, and goes back to the shared one', async () => {
    const api = mockApi({
      ...treeRoutes(FAMILY, VIEWER),
      [`GET ${PREFERENCE}`]: () => ({ body: MINE }),
    });
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const board = await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    expect(await screen.findByText('Bạn đang xem chủ đề của riêng mình.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dùng cho cả họ' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Về chủ đề chung' }));
    expect(board).toHaveAttribute('data-surface', 'grid-paper');
    expect(screen.queryByText('Bạn đang xem chủ đề của riêng mình.')).not.toBeInTheDocument();
    await waitFor(
      () => {
        const put = api.calls.find((call) => call.method === 'PUT' && call.path === PREFERENCE);
        expect(put?.body).toEqual({ ...MINE, enabled: false });
      },
      { timeout: 2000 },
    );
  });

  it('lets an editor use my theme for the whole family, as one change', async () => {
    const api = mockApi({
      ...treeRoutes(FAMILY),
      [`POST /clans/${CLAN_ID}/ops`]: () => ({ body: { seq: FAMILY.version + 1 } }),
      [`GET ${PREFERENCE}`]: () => ({ body: MINE }),
    });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByText('Bạn đang xem chủ đề của riêng mình.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dùng cho cả họ' }));
    expect(await screen.findByText('Đã đổi: chủ đề cây')).toBeInTheDocument();
    expect(useTreeStore.getState().tree.theme).toEqual({ surface: 'corkboard' });
    await waitFor(() => expect(api.calls.some((call) => call.method === 'POST')).toBe(true));
    const sent = api.calls.find((call) => call.method === 'POST');
    expect(batchOps(sent?.body)).toEqual([
      { type: 'setTreeTheme', payload: { changes: { surface: 'corkboard' } } },
    ]);
    // The family's theme now matches mine: nothing is left to share.
    expect(screen.queryByRole('button', { name: 'Dùng cho cả họ' })).not.toBeInTheDocument();
  });

  it('says when my choices were not saved, and saves them again', async () => {
    let fail = true;
    mockApi({
      ...treeRoutes(FAMILY, VIEWER),
      [`PUT ${PREFERENCE}`]: ({ body }) =>
        fail ? apiErrorReply('INTERNAL_ERROR', 500) : { body },
    });
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const board = await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    await user.click(screen.getByRole('button', { name: 'Trang trí' }));
    await user.click(screen.getByRole('radio', { name: 'Cửa tủ lạnh' }));
    expect(
      await screen.findByText('Chưa lưu được phần trang trí của bạn.', {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(board).toHaveAttribute('data-surface', 'fridge');

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Thử lưu lại' }));
    await waitFor(() =>
      expect(screen.queryByText('Chưa lưu được phần trang trí của bạn.')).not.toBeInTheDocument(),
    );
  });

  it("opens a viewer's card panel from the profile, and goes back to the profile", async () => {
    mockApi(treeRoutes(FAMILY, VIEWER));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    await user.click(screen.getByRole('button', { name: /^Nguyễn Văn Nam,/ }));
    const profile = screen.getByRole('complementary', { name: 'Nguyễn Văn Nam' });
    await user.click(within(profile).getByRole('button', { name: 'Trang trí thẻ này…' }));
    expect(
      screen.getByRole('complementary', { name: 'Trang trí thẻ của Nguyễn Văn Nam' }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    const back = screen.getByRole('complementary', { name: 'Nguyễn Văn Nam' });
    expect(within(back).getByRole('heading', { name: 'Nguyễn Văn Nam' })).toHaveFocus();
  });
});
```

`batchOps` and `editableTree` are already imported from `./testKit` (Task 8). The second test sends one op, so its `POST` route can answer a fixed `FAMILY.version + 1`.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --dir apps/web exec vitest run src/features/tree/decor.test.ts src/features/tree/CardMenu.test.tsx src/features/tree/TreePage.test.tsx`
Expected: FAIL. There is no `withDecorate`, no menu item, no banner and no save error.

- [ ] **Step 3: Implement**

`apps/web/src/features/tree/decor.ts`, add:

```ts
/** "Decorate this card…" among a card's actions: just before Delete, else last. */
export function withDecorate<T extends string>(actions: readonly T[]): (T | 'decorate')[] {
  const at = actions.indexOf('delete' as T);
  if (at === -1) return [...actions, 'decorate'];
  return [...actions.slice(0, at), 'decorate', ...actions.slice(at)];
}
```

`apps/web/src/features/tree/decorContext.ts`, add:

```ts
import type { DecorTarget } from './decor';

/** Opens Decorate (spec §13.4). Every member may decorate, so viewers get it too. */
export const DecorateContext = createContext<((target: DecorTarget) => void) | null>(null);
```

`apps/web/src/features/tree/CardMenu.tsx`:

```tsx
import { ContextMenu } from 'radix-ui';
import { Palette } from 'lucide-react';
import { useContext, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { withDecorate } from './decor';
import { DecorateContext } from './decorContext';
import { personCardButton } from './profileParams';
import { useTreeStore } from './store';
import {
  ACTION_ICONS,
  actionLabelKey,
  PersonActionsContext,
  type PersonActionId,
} from './usePersonActions';

type MenuItemId = PersonActionId | 'decorate';
```

Keep `ITEM` and `TONE`. Then in the component:

```tsx
/**
 * The right-click menu of a card (spec §7.6): the panel's actions, read when it opens, and
 * "Decorate this card…" (spec §13.4), which viewers get too.
 */
export function CardMenu({ personId, children }: { personId: string; children: ReactElement }) {
  const { t } = useTranslation();
  const api = useContext(PersonActionsContext);
  const decorate = useContext(DecorateContext);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MenuItemId[]>([]);
  if (api === null && decorate === null) return children;
  return (
    <ContextMenu.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const actions = api?.actionsFor(personId) ?? [];
          const known = useTreeStore.getState().tree.persons[personId] !== undefined;
          const menu = decorate !== null && known ? withDecorate(actions) : actions;
          if (menu.length === 0) return;
          setItems(menu);
        }
        setOpen(next);
      }}
    >
```

and the items become:

```tsx
          {items.map((item) => {
            const Icon = item === 'decorate' ? Palette : ACTION_ICONS[item];
            return (
              <ContextMenu.Item
                key={item}
                className={`${ITEM} ${item === 'delete' ? TONE.danger : TONE.plain}`}
                onSelect={() => {
                  if (item === 'decorate') decorate?.({ kind: 'card', personId });
                  else api?.run(personId, item);
                }}
              >
                <Icon aria-hidden="true" strokeWidth={1.75} className="size-4" />
                {item === 'decorate' ? t('tree.decor.card.open') : t(actionLabelKey(item))}
              </ContextMenu.Item>
            );
          })}
```

`onCloseAutoFocus` stays as it is. Decorate focuses its own heading when it opens, so the menu finds focus already set and leaves it.

`apps/web/src/features/tree/ProfilePanel.tsx`:
- import `Palette` from `lucide-react`, `useContext` from `react`, `withDecorate` from `./decor` and `DecorateContext` from `./decorContext`;
- after `const actionIds = …`, add:

```tsx
  // "Decorate this card…" (spec §13.4) sits with the actions, before Delete; viewers get it too.
  const decorate = useContext(DecorateContext);
  const items = decorate === null ? actionIds : withDecorate(actionIds);
```

- the read-mode actions section becomes:

```tsx
          {items.length > 0 ? (
            <section aria-label={t('tree.profile.actions')} className="flex flex-wrap gap-2">
              {items.map((item) => {
                if (item === 'decorate') {
                  return (
                    <Button
                      key={item}
                      variant="secondary"
                      onClick={() => decorate?.({ kind: 'card', personId: person.id })}
                    >
                      <Palette {...ICON} />
                      {t('tree.decor.card.open')}
                    </Button>
                  );
                }
                const Icon = ACTION_ICONS[item];
                return (
                  <Button
                    key={item}
                    variant={item === 'delete' ? 'danger' : 'secondary'}
                    onClick={() => actions?.run(person.id, item)}
                  >
                    <Icon {...ICON} />
                    {t(actionLabelKey(item))}
                  </Button>
                );
              })}
            </section>
          ) : null}
```

`useContext` must run before the panel's early returns: put the two lines next to the other hooks if `actionIds` is computed after one. Then compute `items` where `actionIds` is.

`apps/web/src/features/tree/ThemeBanner.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui';

interface ThemeBannerProps {
  onBack: () => void;
  /** Null for viewers, and when the family's theme already looks like mine. */
  onUseForClan: (() => void) | null;
}

/** "You are viewing your own theme" (spec §13.4), above the board while my choices are on. */
export function ThemeBanner({ onBack, onUseForClan }: ThemeBannerProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-paper-grid p-3">
      <p className="mr-auto text-ink">{t('tree.decor.banner.text')}</p>
      <Button variant="secondary" size="sm" onClick={onBack}>
        {t('tree.decor.banner.back')}
      </Button>
      {onUseForClan ? (
        <Button variant="secondary" size="sm" onClick={onUseForClan}>
          {t('tree.decor.banner.useForClan')}
        </Button>
      ) : null}
    </div>
  );
}

/** My choices could not be saved: they stay on screen, and one button sends them again. */
export function DecorSaveError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2">
      <p className="font-medium text-stamp">{t('tree.decor.save.failed')}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {t('tree.decor.save.retry')}
      </Button>
    </div>
  );
}
```

`apps/web/src/features/tree/TreePage.tsx`:
- import `ThemeBanner` and `DecorSaveError` from `./ThemeBanner`, `changesToMatch` and `showsOwnTheme` from `./decor`, and `DecorateContext` from `./decorContext`;
- with the other hooks, before any early return:

```tsx
  // "Use for the whole family": the parts of my theme the family's lacks (none: no button).
  const clanTheme = useTreeStore((state) => state.tree.theme);
  const toShare =
    canEdit && decor.preference !== null ? changesToMatch(clanTheme, decor.preference.theme) : null;
  const shareMyTheme = useCallback(() => {
    if (toShare !== null) requestChange({ change: { kind: 'treeTheme', changes: toShare } });
  }, [requestChange, toShare]);
  const backToShared = useCallback(() => {
    decor.change((current) => ({ ...current, enabled: false }));
  }, [decor]);
```

`decor` is a new object each render, so depend on `decor.change` instead: `const { change: changeMine } = decor;` and use `changeMine` in the callback and its dependencies. `requestChange` is the runner's function the page already passes to `ChangeContext`.

- wrap the content inside `ChangeContext` in `<DecorateContext value={openDecorate}>…</DecorateContext>`;
- right after `<TreeToolbar … />`, render:

```tsx
              {showsOwnTheme(decor.preference) ? (
                <ThemeBanner
                  onBack={backToShared}
                  onUseForClan={toShare === null ? null : shareMyTheme}
                />
              ) : null}
              {decor.saveState === 'failed' ? <DecorSaveError onRetry={decor.retry} /> : null}
```

"Use for the whole family" leaves my own choices on. The family's board now looks as mine did; "Back to the shared theme" turns mine off when I want to.

- [ ] **Step 4: Run the tests**

Run: `pnpm --dir apps/web exec vitest run src/features/tree`, then `pnpm typecheck` and `pnpm lint`.
Expected: PASS. If a TreePage test times out at 5 s under load, re-run the file alone and report both results.

- [ ] **Step 5: Commit**

Message file `.superpowers/sdd/p6e-task-9-commit.txt`, subject `feat(web): decorate one card, and the own-theme banner`. The body:
- "Trang trí thẻ này…" sits in the card menu and in the profile, just before Delete, for viewers too;
- while my own theme is on, a banner says so, with "Về chủ đề chung" and, for editors, "Dùng cho cả họ", which shares the parts that differ as one undoable change;
- a failed save says so, keeps the picks on screen and offers "Thử lưu lại".

End with the Co-Authored-By line.

```bash
rtk git add apps/web/src
rtk git commit -F .superpowers/sdd/p6e-task-9-commit.txt
```

---

### Task 10: E2E, ADR 0012, roadmap and the full check

**Files:**
- Create: `e2e/themes.spec.ts`, `docs/adr/0012-tree-themes-in-the-tree-state.md`
- Modify: `docs/superpowers/plans/2026-11-12-roadmap.md`

- [ ] **Step 1: The e2e test**

`e2e/themes.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { addPerson, cardOf, createTree, openProfile, register } from './support.ts';

const BOARD = 'Cây gia phả: Họ Phạm';

/** A new account with a tree whose progenitor is Phạm Văn Cả; returns the clan id. */
async function treeWithProgenitor(page: Page, slug: string): Promise<string> {
  await page.goto('/register');
  await register(page, 'Minh', slug);
  const clanId = await createTree(page, 'Họ Phạm');
  await page.getByRole('button', { name: 'Thêm người đầu tiên' }).click();
  await addPerson(page, 'Phạm Văn Cả');
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await panel.getByRole('button', { name: 'Chọn làm thuỷ tổ' }).click();
  await expect(cardOf(page, 'Phạm Văn Cả')).toHaveAccessibleName('Phạm Văn Cả, đời thứ 1');
  await panel.getByRole('button', { name: 'Đóng hồ sơ' }).click();
  return clanId;
}

/** The family's stored theme, read with the page's session. */
async function clanTheme(page: Page, clanId: string) {
  const response = await page.request.get(`/api/clans/${clanId}/tree`);
  return ((await response.json()) as { theme?: Record<string, string> }).theme ?? {};
}

/** My stored choices, read with the page's session. */
async function myPreference(page: Page, clanId: string) {
  const response = await page.request.get(`/api/clans/${clanId}/view-preference`);
  return (await response.json()) as { enabled: boolean; theme: Record<string, string> };
}

test('whole family: a surface for everyone, undone, then kept after a reload', async ({
  page,
}, testInfo) => {
  const clanId = await treeWithProgenitor(page, 'theme-clan');
  const board = page.getByRole('group', { name: BOARD });
  await page.getByRole('button', { name: 'Trang trí' }).click();
  const panel = page.getByRole('complementary', { name: 'Trang trí cây' });
  await expect(panel.getByRole('radio', { name: 'Cả họ' })).toBeChecked();

  await panel.getByText('Bảng gỗ bần').click();
  await expect(board).toHaveAttribute('data-surface', 'corkboard');
  await expect(page.getByText('Đã đổi: chủ đề cây')).toBeVisible();
  await expect.poll(() => clanTheme(page, clanId)).toEqual({
    surface: 'corkboard',
    fastener: 'pushpin',
  });
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}-theme-corkboard.png`,
  });

  await page.getByRole('button', { name: 'Hoàn tác thay đổi này' }).click();
  await expect(board).toHaveAttribute('data-surface', 'grid-paper');
  await expect.poll(() => clanTheme(page, clanId)).toEqual({});

  await panel.getByText('Bảng gỗ bần').click();
  await expect.poll(() => clanTheme(page, clanId)).toEqual({
    surface: 'corkboard',
    fastener: 'pushpin',
  });
  await page.reload();
  await expect(page.getByRole('group', { name: BOARD })).toHaveAttribute('data-surface', 'corkboard');
});

test('only me: my board changes, the family keeps its own, and I can go back', async ({
  page,
}, testInfo) => {
  const clanId = await treeWithProgenitor(page, 'theme-me');
  await page.getByRole('button', { name: 'Trang trí' }).click();
  const panel = page.getByRole('complementary', { name: 'Trang trí cây' });
  await panel.getByText('Chỉ mình tôi').click();
  await panel.getByText('Cửa tủ lạnh').click();
  const board = page.getByRole('group', { name: BOARD });
  await expect(board).toHaveAttribute('data-surface', 'fridge');
  await expect(page.getByText('Bạn đang xem chủ đề của riêng mình.')).toBeVisible();
  await expect.poll(async () => (await myPreference(page, clanId)).enabled).toBe(true);
  expect(await clanTheme(page, clanId)).toEqual({});
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}-theme-fridge.png`,
  });

  await page.reload();
  await expect(page.getByRole('group', { name: BOARD })).toHaveAttribute('data-surface', 'fridge');
  await page.getByRole('button', { name: 'Về chủ đề chung' }).click();
  await expect(page.getByRole('group', { name: BOARD })).toHaveAttribute(
    'data-surface',
    'grid-paper',
  );
  await expect.poll(async () => (await myPreference(page, clanId)).enabled).toBe(false);

  await page.reload();
  await expect(page.getByRole('group', { name: BOARD })).toHaveAttribute(
    'data-surface',
    'grid-paper',
  );
  await expect(page.getByText('Bạn đang xem chủ đề của riêng mình.')).toBeHidden();
});

test('a viewer decorates only for themselves', async ({ page, browser, baseURL }) => {
  const clanId = await treeWithProgenitor(page, 'theme-owner');
  await page.getByRole('link', { name: 'Thành viên' }).click();
  await page.getByLabel('Vai trò khi tham gia').selectOption({ label: 'Xem' });
  await page.getByRole('button', { name: 'Tạo link mời' }).click();
  const inviteUrl = await page.getByRole('textbox', { name: /Link mời/ }).inputValue();

  const relative = await browser.newContext({ baseURL });
  try {
    const viewer = await relative.newPage();
    await viewer.goto(inviteUrl);
    await viewer.getByRole('link', { name: 'Tạo tài khoản' }).click();
    await register(viewer, 'Tuấn', 'theme-viewer');
    await viewer.getByRole('button', { name: 'Tham gia' }).click();
    await expect(viewer).toHaveURL(/\/clans\/[^/]+\/tree$/);

    await viewer.getByRole('button', { name: 'Trang trí' }).click();
    const panel = viewer.getByRole('complementary', { name: 'Trang trí cây' });
    await expect(panel.getByRole('radio', { name: 'Cả họ' })).toBeDisabled();
    await expect(panel.getByRole('radio', { name: 'Chỉ mình tôi' })).toBeChecked();
    await expect(panel.getByText('Người xem chỉ trang trí được cho riêng mình.')).toBeVisible();
    await panel.getByText('Cửa tủ lạnh').click();
    await expect(viewer.getByRole('group', { name: BOARD })).toHaveAttribute(
      'data-surface',
      'fridge',
    );
    await expect.poll(async () => (await myPreference(viewer, clanId)).enabled).toBe(true);
  } finally {
    await relative.close();
  }

  await page.goto(`/clans/${clanId}/tree`);
  await expect(page.getByRole('group', { name: BOARD })).toHaveAttribute(
    'data-surface',
    'grid-paper',
  );
  expect(await clanTheme(page, clanId)).toEqual({});
});
```

Adjust the details against the real UI:
- **The profile's close button:** use the name `ProfilePanel` gives it (`tree.profile.close`). If closing it is not needed for the toolbar to be reachable, drop that line.
- **Clicking an option:** the radios are `sr-only` inside their labels, so the test clicks the label text. If a name is on the page twice (the gallery is not, but a card might be), scope it to the panel, as above.
- **The invite page:** after `goto(inviteUrl)`, `e2e/accounts.spec.ts` waits for the invite text first. Do the same if the link to sign up is not there at once.

Run: `pnpm e2e -- e2e/themes.spec.ts` (both the desktop and mobile projects). On mobile the panel is a bottom sheet, so the board may be inert while it is open. The `data-surface` checks read an attribute, which works either way. Close the sheet with Escape before clicking anything on the board.
Expected: PASS. Then run the whole `pnpm e2e` once, so the CSP replay test (no new inline styles or hosts) and `design-system.spec.ts` (the gallery screenshots, now with the theme options) still pass.

- [ ] **Step 2: ADR 0012**

Read `docs/adr/0011-photos-through-a-photo-store.md` for the format: `# ADR 0012: …`, `- Status: Accepted`, `- Date: 2026-11-19`, then Context, Decision, Alternatives considered and Consequences. Write `docs/adr/0012-tree-themes-in-the-tree-state.md`, titled "Tree themes in the tree state, and my own on the side":
- **Context:**
  - spec §13.4 lets a family dress its board (surface, line, knot, card frame and fastener), and lets each member pick a look only they see;
  - the family's look must undo, sync and show in the history like any edit;
  - a member's own look must not be an edit at all, and viewers may have one;
  - a switch must not re-run the layout, and must not touch the CSP.
- **Decision:**
  1. The family's theme lives in the tree state (`TreeState.theme`), changed by a `setTreeTheme { changes }` op. Null resets a part. The inverse holds the previous values. The Clan document stores it in the op's transaction. A surface pick sends its matching fastener with it.
  2. A card's own style is `Person.cardStyle`, set and cleared (null) through `updatePerson`.
  3. My own choices are a `ViewPreference` document per member and clan, read and written whole with `GET` and `PUT /clans/:id/view-preference`. They are checked by Zod (known options, ObjectId keys, at most 5,000 cards), pruned of deleted people on save, and deleted with the clan. The client keeps them in TanStack Query. The board changes at once, and one PUT goes about 500 ms after the last pick; saves run one at a time, so the last one wins. There is no undo; a failed save shows an error with a retry.
  4. One pure resolver in `shared` picks each part: my card's choice, my tree choice, the card's own style, the family's theme, then the default.
  5. Rendering is data attributes on the board and cards, and CSS variables in `tokens.css` for light and dark, drawn with CSS patterns only. Every frame and surface is contrast-tested. Nodes stay memoised, and a theme switch does not re-run the layout.
- **Alternatives considered:**
  - the family's theme as a plain Clan field behind its own route (no undo, sync or history);
  - my own choices in `localStorage` (lost across devices, and no viewer could keep one);
  - my own choices as ops (other members would replay and see them);
  - background images for the surfaces (new hosts or inline data in the CSP, and bytes to load).
- **Consequences:**
  - one more collection, and one more document per member who decorates;
  - removing a member keeps their `ViewPreference`; a clan delete removes them all;
  - `cardStyle` changes still re-run the layout, like any person edit, but tree theme switches do not;
  - P10's exports and share links must draw the family's theme, never the viewer's own (the rule from spec §13.4, recorded here for P10).

- [ ] **Step 3: Roadmap**

In `docs/superpowers/plans/2026-11-12-roadmap.md`:
- mark P6e done, the same way P6d is marked;
- add a "P6e — carry-over" block in the same style, with what the work left over. Candidates to check against what was built:
  - pruning the view preferences of removed members;
  - giving the loose-photos stack and the lifted card the full fastener drawing;
  - P10's exports and share links drawing the family's theme, never a member's own (spec §13.4).

- [ ] **Step 4: The full check**

Run: `pnpm check`
Expected: exit 0. If the web tests time out at 5 s under parallel load, a flake already known on this repo, re-run each failing file alone and report both results.

- [ ] **Step 5: Commit**

Message file `.superpowers/sdd/p6e-task-10-commit.txt`, subject `test(e2e): tree themes; docs: ADR 0012 and the roadmap for P6e`. The body:
- the e2e decorates for the whole family (with Undo and a reload), for me alone (with the banner and "Về chủ đề chung"), and as a viewer, whose pick never reaches the owner's board;
- ADR 0012 records why the family's theme is an op in the tree state and a member's own is a separate document;
- the roadmap marks P6e done and lists its carry-over.

End with the Co-Authored-By line.

```bash
rtk git add e2e docs
rtk git commit -F .superpowers/sdd/p6e-task-10-commit.txt
```
