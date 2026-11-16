# P6c Drag to Relate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editors change relationships directly: drag a card onto another card (top, middle, bottom, or a sibling's edge), use "Change relationship…" from the keyboard, cut threads and marriages, reorder siblings, place people from a "Loose photos" tray grouped by branch, and add several people at once. Every change is one undoable op.

**Architecture:** One set of pure rules in `packages/shared/src/tree/relate.ts` (plus `relationships.ts` and `looseStacks.ts`) turns "make A the parent/spouse/child of B", "put A before/after B", a cut or a detach into one `batch` op, a follow-up question, or a block. Each change is validated by running the same `applyOp` the server runs. The web calls those rules from four places: drag and drop (built on `@dnd-kit/core`), the "Change relationship…" dialog, the Cut popovers on the board, and the card menu's "Move earlier"/"Move later". A shared question dialog and an Undo toast serve them all.

**Tech Stack:** TypeScript 6, Zod 4, React 19, Zustand, TanStack Query, react-router 8, i18next, Tailwind, radix-ui, @xyflow/react 12, @dnd-kit/core (new), Vitest + Testing Library, fast-check, Playwright + axe.

## Global Constraints

**Repository and language**
- Node `>=24.0.0`, `"packageManager": "pnpm@11.17.0"`, TypeScript `~6.0.3` (do not upgrade). Use plain `pnpm` (not `rtk pnpm`). Run every command from the repository root `D:\ReactJS\AncestorsTree`.
- Everything in the repository is in English (code, identifiers, comments, docs, commit messages). The UI is Vietnamese by default with English; user-facing text lives only in `apps/web/src/locales/{vi,en}.json`, with identical key sets (`locales.test.ts` enforces it). Vietnamese must read naturally. Avoid count plurals.
- The spec is bilingual: any change to `docs/superpowers/specs/2026-11-11-ancestors-tree-design.md` updates `2026-11-11-ancestors-tree-design.vi.md` in the same commit (spec §7.6 and §7.8 bind P6c).
- User-facing names: a Clan is a **family tree** ("cây gia phả"), the `owner` role is **Manager** ("Quản lý"), the unlinked tray is **"Ảnh chưa dán"** ("Loose photos").
- `packages/shared` and `apps/api` run natively on Node (ADR 0002): relative imports end in `.ts`. `apps/web` relative imports have no extension. `erasableSyntaxOnly` forbids enums, value namespaces and constructor parameter properties (write `this.x = x` in the constructor body).
- Web features import other features only through their `index.ts`. Shared UI comes only from `apps/web/src/shared/ui/index.ts`.
- Tree logic is pure and lives in `packages/shared/src/tree/`. Every relationship change is built there and validated with `applyOp` (the server's own function), so the UI never accepts a change the server would reject.

**Secrets and privacy (never break these)**
- Never read, print or edit `apps/api/.env`.
- No credential-shaped strings in tests, fixtures or docs. E-mail addresses use `example.test`.

**Web rules**
- Colors only from tokens; icons only from `lucide-react` with `strokeWidth={1.75}` and `aria-hidden="true"`; no emoji. Resting cards have no shadow; `shadow-lift` only on a lifted (dragged) card and on menus.
- Every control is keyboard-reachable with a visible focus outline and an accessible name that contains its visible text (WCAG 2.5.3). A button that can hold focus while busy or unavailable uses `aria-disabled` plus a click guard, never `disabled`.
- Focus is never lost: when a panel, dialog or popover closes, focus returns to what opened it, or to the person's card (WCAG 2.4.3). A focused card is never left off screen (WCAG 2.4.11).
- Unsent edits are never lost silently.
- Every edit goes through `useTreeStore().apply(op)`. One user action is one op (a `batch` when needed), so one undo step.
- Read the Zustand store only through selectors that return a stable value. Never return a new object or array from a selector.
- Viewers never see drag handles, Cut controls, "Change relationship…", "Move earlier/later" or "Add several people".
- Component tests use `const user = userEvent.setup()`, `mockApi` from `apps/web/src/test/api.ts` and `vi.unstubAllGlobals()` in `afterEach`. Prefer role/label queries in Vietnamese. e2e tests use no fixed sleeps.

**Tests and commits**
- TDD in every task: write the failing test, see it fail, write the code, see it pass. A test must be able to fail (each task lists mutation checks).
- Every task ends with its own tests passing and `pnpm check` passing (format, lint, typecheck, tests with coverage, error docs, build). Coverage thresholds: 70% lines overall, 90% for `packages/shared/src/**`.
- Before each commit, format new and changed files with `pnpm exec prettier --write <files>`.
- One commit per task (fix commits allowed) on branch `feat/p6c-drag-relate`, Conventional Commits. Write the message to `.superpowers/sdd/p6c-task-N-commit.txt` (git-ignored) and commit with `git commit -F <file>`. Every message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.

## File Structure

**packages/shared/src/tree/**
- `relate.ts` (new): `relate()`, its question/answer/result types, and the internal `Draft` helpers (`newUnion`, `detachFromParent`, `separateCouple`) reused by `relationships.ts`.
- `relationships.ts` (new): `relationshipsOf`, `removeParentOp`, `cutThreadOp`, `cutMarriage`, `unionStatusOp`, `detach`.
- `looseStacks.ts` (new): `looseStacks` (unlinked people grouped by branch).
- `index.ts`: export the public names.

**apps/web/src/features/tree/**
- `changes.ts` (new, pure): `Change`, `planChange` (wraps the shared rules), `sameOutcome`, `decide` (the re-check on the latest tree).
- `relateText.ts` (new): the sentence for a change, the text of a block, a question and its answers.
- `RelateQuestionDialog.tsx` (new): the follow-up question, shared by drag, "Change relationship…" and Cut.
- `ChangeRunner.tsx` (new): `useChangeRunner` (questions, re-check, one op, focus) and its "Đã đổi: …" toast with Undo; `ChangeContext`.
- `AddSeveralDialog.tsx` (new): "Thêm nhiều người".
- `ChangeRelationshipDialog.tsx` (new) and `PersonPicker.tsx` (new): the keyboard dialog and its name search.
- `CutPopover.tsx` (new): "Cắt chỉ" beside a thread pin or a marriage knot.
- `dragZones.ts` (new, pure), `dragStore.ts` (new), `DropZones.tsx` (new), `TreeDnd.tsx` (new): drag and drop.
- `testKit.ts` (new): test helpers shared by the tree's page tests.
- Modified: `ops.ts`, `usePersonActions.ts`, `TreePage.tsx`, `TreeDialogs.tsx`, `TreeToolbar.tsx`, `UnlinkedTray.tsx`, `PersonCard.tsx`, `ThreadEdge.tsx`, `UnionNode.tsx`, `flowElements.ts`, `TreeBoard.tsx`, `fixtures.ts`, `shared/ui/scrapbook/Stitch.tsx`, `locales/{vi,en}.json`, `apps/web/package.json`.

**Tasks in order:** 1 relate rules · 2 relationships, cuts, detach, loose stacks · 3 Loose photos stacks · 4 Add several people · 5 change runner, questions, toast, Move earlier/later · 6 "Change relationship…" · 7 Cut on the board · 8 mouse drag · 9 touch · 10 e2e · 11 docs and ADR 0010.

**e2e/**: `relate.spec.ts` (new), `support.ts` (a drag helper).

**docs/**: spec EN/VI, `docs/adr/0010-relate-rules-and-drag.md`, roadmap.

---

### Task 1: The relate rules (shared)

Spec §7.6 "Drag to relate": drop zones, "Replace, don't stack", "Follow-up questions instead of dead ends", "Blocked only when impossible".

**Files:**
- Create: `packages/shared/src/tree/relate.ts`
- Modify: `packages/shared/src/tree/index.ts`
- Test: `packages/shared/src/tree/relate.test.ts`, `packages/shared/src/tree/relate.properties.test.ts`

**Interfaces:**
- Consumes: `applyOp`, `OpError`, `buildTreeIndex`, `classifyLineage`, `newObjectId`, `testId`/`makePerson`/`makeUnion`/`treeOf`/`invariantViolations` (testing.ts).
- Produces (exported from `@ancestors-tree/shared/tree`):
  - `type Relation = 'parent' | 'spouse' | 'child' | 'before' | 'after'`
  - `const ALONE = 'alone'`
  - `type RelateQuestion = { kind: 'withWhom'; unions: { unionId: string; partnerId: string | null }[]; alone: boolean } | { kind: 'replaceParent'; parentIds: [string, string] } | { kind: 'sharedChildren'; childIds: string[] }`
  - `interface RelateAnswers { union?: string; replaces?: string; shareChildren?: boolean }`
  - `type RelateBlock = 'SAME_PERSON' | 'ALREADY' | 'IN_LAW_PARENT' | 'NOT_SIBLINGS' | 'TOO_MANY_SIBLINGS' | 'IS_PROGENITOR' | OpErrorCode`
  - `interface RelateEffect { relation: Relation; personId: string; targetId: string; withId: string | null }`
  - `type RelateResult = { kind: 'ok'; op: BatchOp; effect: RelateEffect } | { kind: 'ask'; question: RelateQuestion } | { kind: 'blocked'; reason: RelateBlock }`
  - `relate(tree: TreeState, personId: string, targetId: string, relation: Relation, answers?: RelateAnswers): RelateResult`
- Produces (exported from `relate.ts` only, for `relationships.ts`): `class Draft`, `newUnion(draft, partnerIds): string`, `detachFromParent(draft, childId, parentId): void`, `separateCouple(draft, union, keeperId): void`, `blocked(reason): { kind: 'blocked'; reason }`.

Rules, in the order `relate` applies them (A = `personId`, B = `targetId`):
1. A = B → `SAME_PERSON`. A or B missing → `PERSON_NOT_FOUND`.
2. `before`/`after`: A and B must share `parentUnionId` (else `NOT_SIBLINGS`); the group is renumbered `siblingOrder` 1..n with A moved before/after B (more than 99 children → `TOO_MANY_SIBLINGS`; the order already that way → `ALREADY`). Only people whose number changes get an `updatePerson`.
3. `parent` on an in-law B → `IN_LAW_PARENT` (their parents belong in the birth family, §8).
4. The relation already holds → `ALREADY` (spouse: they share a union; child: B is one of A's parents; parent: A is one of B's parents).
5. **Replace**: a union A and B share is split, keeping its children with whoever becomes the child (`parent` → B, `child` → A): `deleteUnion` when it has no children, else `updateUnion` to the keeper alone. If B is A's parent, A leaves B (`detachFromParent`); if A is B's parent, B leaves A.
6. **Add**:
   - `spouse`: children of A's or B's one-person union are "children with only one known parent". With any, and no `shareChildren` answer → ask `sharedChildren`. `shareChildren: true` → the one-person union with children gains the other partner and the other's one-person children move into it (`setParents`), then the emptied union is deleted. Otherwise an empty one-person union of either is filled, else a new union `[A, B]`.
   - `child`: B's unions. Two or more and no valid `union` answer → ask `withWhom` (`alone: true` when B has no one-person union). `ALONE` uses B's one-person union or a new one. One union → that one. None → a new one-person union. Then `setParents(A, union)` and A is numbered after its new siblings when they are numbered (max + 1, at most 99; otherwise A's old number is cleared).
   - `parent`: B has no parents → a new union `[A]` and `setParents(B, it)`. One parent X → `updateUnion` to `[X, A]` (B's siblings get A too, as "Add parent" does). Two parents and no valid `replaces` answer → ask `replaceParent`. With it: B alone moves to a union of the kept parent and A (an existing two-person union of exactly them, else a new one), numbered last there.
7. Every op is applied to a working copy with `applyOp` as it is added; an `OpError` (for example `CYCLE`) becomes `blocked` with its code. The result's op is one `batch`.

- [ ] **Step 1: Write the failing example tests**

Create `packages/shared/src/tree/relate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyOp } from './apply-op.ts';
import { buildTreeIndex } from './lineage.ts';
import { ALONE, relate, type RelateResult } from './relate.ts';
import type { TreeState } from './state.ts';
import { invariantViolations, makePerson, makeUnion, testId, treeOf } from './testing.ts';

// Grandpa (1) + Grandma (2) → Son (3), Daughter (4). Son + Wife (5) → Kid (6). Loose (7).
const GRANDPA = testId(1);
const GRANDMA = testId(2);
const SON = testId(3);
const DAUGHTER = testId(4);
const WIFE = testId(5);
const KID = testId(6);
const LOOSE = testId(7);
const OLD = testId(101);
const YOUNG = testId(102);

function family(): TreeState {
  return treeOf(
    [
      makePerson(GRANDPA),
      makePerson(GRANDMA, { gender: 'female' }),
      makePerson(SON, { parentUnionId: OLD, siblingOrder: 1 }),
      makePerson(DAUGHTER, { gender: 'female', parentUnionId: OLD, siblingOrder: 2 }),
      makePerson(WIFE, { gender: 'female' }),
      makePerson(KID, { parentUnionId: YOUNG }),
      makePerson(LOOSE),
    ],
    [makeUnion(OLD, [GRANDPA, GRANDMA]), makeUnion(YOUNG, [SON, WIFE])],
    GRANDPA,
  );
}

/** Applies an ok result and checks the tree is still valid. */
function after(tree: TreeState, result: RelateResult): TreeState {
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  const next = applyOp(tree, result.op).tree;
  expect(invariantViolations(next)).toEqual([]);
  return next;
}

function parentsOf(tree: TreeState, id: string): string[] {
  const unionId = tree.persons[id]?.parentUnionId;
  return unionId === undefined ? [] : [...(tree.unions[unionId]?.partnerIds ?? [])].sort();
}

function spousesOf(tree: TreeState, id: string): string[] {
  return buildTreeIndex(tree)
    .unionsOf(id)
    .flatMap((union) => union.partnerIds.filter((partner) => partner !== id))
    .sort();
}

describe('relate: blocks', () => {
  it('refuses the same person, someone missing, and a relation that already holds', () => {
    const tree = family();
    expect(relate(tree, SON, SON, 'child')).toEqual({ kind: 'blocked', reason: 'SAME_PERSON' });
    expect(relate(tree, SON, testId(99), 'child')).toEqual({
      kind: 'blocked',
      reason: 'PERSON_NOT_FOUND',
    });
    expect(relate(tree, SON, WIFE, 'spouse')).toEqual({ kind: 'blocked', reason: 'ALREADY' });
    expect(relate(tree, SON, GRANDPA, 'child')).toEqual({ kind: 'blocked', reason: 'ALREADY' });
    expect(relate(tree, GRANDPA, SON, 'parent')).toEqual({ kind: 'blocked', reason: 'ALREADY' });
  });

  it('refuses a parent for an in-law', () => {
    expect(relate(family(), LOOSE, WIFE, 'parent')).toEqual({
      kind: 'blocked',
      reason: 'IN_LAW_PARENT',
    });
  });

  it('turns a cycle into a block with the server’s own code', () => {
    // Kid as the parent of Grandpa: Grandpa would be his own ancestor.
    expect(relate(family(), KID, GRANDPA, 'parent')).toEqual({ kind: 'blocked', reason: 'CYCLE' });
  });
});

describe('relate: child', () => {
  it('makes A the child of B’s only marriage, numbered after the siblings', () => {
    const tree = family();
    const result = relate(tree, LOOSE, GRANDPA, 'child');
    expect(result).toMatchObject({
      kind: 'ok',
      effect: { relation: 'child', personId: LOOSE, targetId: GRANDPA, withId: GRANDMA },
    });
    const next = after(tree, result);
    expect(parentsOf(next, LOOSE)).toEqual([GRANDPA, GRANDMA].sort());
    expect(next.persons[LOOSE]?.siblingOrder).toBe(3);
  });

  it('gives a person without a marriage a one-person union', () => {
    const tree = family();
    const next = after(tree, relate(tree, LOOSE, DAUGHTER, 'child'));
    expect(parentsOf(next, LOOSE)).toEqual([DAUGHTER]);
  });

  it('asks "with whom?" when B has two marriages, and uses the answer', () => {
    const SECOND = testId(103);
    const tree = applyOp(family(), {
      type: 'addUnion',
      payload: makeUnion(SECOND, [SON, LOOSE], { order: 2 }),
    }).tree;
    const asked = relate(tree, DAUGHTER, SON, 'child');
    expect(asked).toEqual({
      kind: 'ask',
      question: {
        kind: 'withWhom',
        unions: [
          { unionId: YOUNG, partnerId: WIFE },
          { unionId: SECOND, partnerId: LOOSE },
        ],
        alone: true,
      },
    });
    const withLoose = after(tree, relate(tree, DAUGHTER, SON, 'child', { union: SECOND }));
    expect(parentsOf(withLoose, DAUGHTER)).toEqual([SON, LOOSE].sort());
    const alone = after(tree, relate(tree, DAUGHTER, SON, 'child', { union: ALONE }));
    expect(parentsOf(alone, DAUGHTER)).toEqual([SON]);
    // A stale answer (a union that is not B's) asks again.
    expect(relate(tree, DAUGHTER, SON, 'child', { union: OLD }).kind).toBe('ask');
  });
});

describe('relate: parent', () => {
  it('adds A beside a single known parent, for B’s siblings too', () => {
    const tree = family();
    const solo = after(tree, relate(tree, LOOSE, DAUGHTER, 'child'));
    const next = after(solo, relate(solo, SON, LOOSE, 'parent'));
    expect(parentsOf(next, LOOSE)).toEqual([DAUGHTER, SON].sort());
  });

  it('gives B without parents a one-person union of A', () => {
    const tree = family();
    const result = relate(tree, LOOSE, GRANDPA, 'parent');
    expect(result).toMatchObject({ kind: 'ok', effect: { withId: null } });
    expect(parentsOf(after(tree, result), GRANDPA)).toEqual([LOOSE]);
  });

  it('asks which parent A replaces, and moves only B', () => {
    const tree = family();
    expect(relate(tree, LOOSE, SON, 'parent')).toEqual({
      kind: 'ask',
      question: { kind: 'replaceParent', parentIds: [GRANDPA, GRANDMA] },
    });
    const result = relate(tree, LOOSE, SON, 'parent', { replaces: GRANDMA });
    expect(result).toMatchObject({ kind: 'ok', effect: { withId: GRANDPA } });
    const next = after(tree, result);
    expect(parentsOf(next, SON)).toEqual([GRANDPA, LOOSE].sort());
    // Daughter keeps both her parents.
    expect(parentsOf(next, DAUGHTER)).toEqual([GRANDPA, GRANDMA].sort());
  });
});

describe('relate: spouse', () => {
  it('marries two people in a new union', () => {
    const tree = family();
    const next = after(tree, relate(tree, LOOSE, DAUGHTER, 'spouse'));
    expect(spousesOf(next, DAUGHTER)).toEqual([LOOSE]);
  });

  it('asks whether children with one known parent are shared, and merges them when yes', () => {
    const tree = family();
    const solo = after(tree, relate(tree, LOOSE, DAUGHTER, 'child'));
    const asked = relate(solo, SON, DAUGHTER, 'spouse');
    expect(asked).toEqual({
      kind: 'ask',
      question: { kind: 'sharedChildren', childIds: [LOOSE] },
    });
    const shared = after(solo, relate(solo, SON, DAUGHTER, 'spouse', { shareChildren: true }));
    expect(parentsOf(shared, LOOSE)).toEqual([DAUGHTER, SON].sort());
    const apart = after(solo, relate(solo, SON, DAUGHTER, 'spouse', { shareChildren: false }));
    expect(parentsOf(apart, LOOSE)).toEqual([DAUGHTER]);
    expect(spousesOf(apart, DAUGHTER)).toEqual([SON]);
  });
});

describe('relate: replace, don’t stack', () => {
  it('turns a couple into parent and child, the shared children staying with the child', () => {
    const tree = family();
    // Wife becomes the parent of Son: Kid stays with Son, the person who becomes the child.
    const next = after(tree, relate(tree, WIFE, SON, 'parent', { replaces: GRANDMA }));
    expect(spousesOf(next, SON)).toEqual([]);
    expect(parentsOf(next, KID)).toEqual([SON]);
    expect(parentsOf(next, SON)).toEqual([GRANDPA, WIFE].sort());
  });

  it('moves a child who becomes a spouse out of the parent’s marriage', () => {
    const tree = family();
    const next = after(tree, relate(tree, DAUGHTER, GRANDMA, 'spouse'));
    // Daughter keeps Grandpa as her parent, in a one-person union.
    expect(parentsOf(next, DAUGHTER)).toEqual([GRANDPA]);
    expect(spousesOf(next, GRANDMA)).toEqual([DAUGHTER, GRANDPA].sort());
  });
});

describe('relate: sibling order', () => {
  it('moves A before or after B and renumbers the group', () => {
    const tree = family();
    const result = relate(tree, DAUGHTER, SON, 'before');
    expect(result).toMatchObject({ kind: 'ok', effect: { relation: 'before' } });
    const next = after(tree, result);
    expect(next.persons[DAUGHTER]?.siblingOrder).toBe(1);
    expect(next.persons[SON]?.siblingOrder).toBe(2);
    expect(relate(tree, DAUGHTER, SON, 'after')).toEqual({ kind: 'blocked', reason: 'ALREADY' });
    expect(relate(tree, KID, SON, 'before')).toEqual({ kind: 'blocked', reason: 'NOT_SIBLINGS' });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm --filter @ancestors-tree/shared exec vitest run src/tree/relate.test.ts`
Expected: FAIL, because `./relate.ts` does not exist.

- [ ] **Step 3: Write `relate.ts`**

Create `packages/shared/src/tree/relate.ts`:

```ts
import { applyOp } from './apply-op.ts';
import { newObjectId } from './ids.ts';
import { buildTreeIndex, classifyLineage } from './lineage.ts';
import { OpError, type OpErrorCode } from './op-error.ts';
import type { BatchOp, SingleOp } from './ops.ts';
import type { Union } from './schemas.ts';
import type { TreeState } from './state.ts';

export type Relation = 'parent' | 'spouse' | 'child' | 'before' | 'after';

/** The answer to "child of B with whom?" that means B alone. */
export const ALONE = 'alone';

/** The highest `siblingOrder` and union `order` the schemas accept (both are 1–99). */
const MAX_ORDER = 99;

/** A follow-up question (spec §7.6); its answer goes back to relate() in RelateAnswers. */
export type RelateQuestion =
  /** B has several marriages: which one A is a child of (or B alone). */
  | { kind: 'withWhom'; unions: { unionId: string; partnerId: string | null }[]; alone: boolean }
  /** B already has two parents: which one A takes the place of. */
  | { kind: 'replaceParent'; parentIds: [string, string] }
  /** Children with one known parent: are they the new couple's? */
  | { kind: 'sharedChildren'; childIds: string[] };

export interface RelateAnswers {
  /** withWhom: one of B's unions, or ALONE. */
  union?: string;
  /** replaceParent: the parent A takes the place of. */
  replaces?: string;
  /** sharedChildren. */
  shareChildren?: boolean;
}

/** Why a change cannot be made; the web turns each into a sentence that says what to do. */
export type RelateBlock =
  | 'SAME_PERSON'
  | 'ALREADY'
  | 'IN_LAW_PARENT'
  | 'NOT_SIBLINGS'
  | 'TOO_MANY_SIBLINGS'
  | 'IS_PROGENITOR'
  | OpErrorCode;

/** What a change does, for the sentence the web shows ("Lan becomes the child of Nam and Hoa"). */
export interface RelateEffect {
  relation: Relation;
  personId: string;
  targetId: string;
  /** child: B's partner in the chosen union; parent: the parent kept beside A; else null. */
  withId: string | null;
}

export type RelateResult =
  | { kind: 'ok'; op: BatchOp; effect: RelateEffect }
  | { kind: 'ask'; question: RelateQuestion }
  | { kind: 'blocked'; reason: RelateBlock };

type Step = { kind: 'done'; withId: string | null } | Extract<RelateResult, { kind: 'ask' }>;

export function blocked(reason: RelateBlock): { kind: 'blocked'; reason: RelateBlock } {
  return { kind: 'blocked', reason };
}

function ask(question: RelateQuestion): Step {
  return { kind: 'ask', question };
}

function done(withId: string | null): Step {
  return { kind: 'done', withId };
}

/**
 * The ops of one change, each applied to a working copy as it is added: the same `applyOp` the
 * server runs checks every step, and later steps read the tree the earlier ones made.
 */
export class Draft {
  tree: TreeState;
  readonly ops: SingleOp[] = [];

  constructor(tree: TreeState) {
    this.tree = tree;
  }

  push(op: SingleOp): void {
    this.tree = applyOp(this.tree, op).tree;
    this.ops.push(op);
  }

  batch(): BatchOp {
    return { type: 'batch', payload: { ops: [...this.ops] } };
  }
}

function isAlone(union: Union, personId: string): boolean {
  return union.partnerIds.length === 1 && union.partnerIds[0] === personId;
}

function parentIdsOf(tree: TreeState, personId: string): readonly string[] {
  const unionId = tree.persons[personId]?.parentUnionId;
  return unionId === undefined ? [] : (tree.unions[unionId]?.partnerIds ?? []);
}

/** A union order after every marriage of these people (never past the schema's 99). */
function nextUnionOrder(tree: TreeState, partnerIds: readonly string[]): number {
  let highest = 0;
  for (const union of Object.values(tree.unions)) {
    if (union.partnerIds.some((id) => partnerIds.includes(id))) {
      highest = Math.max(highest, union.order);
    }
  }
  return Math.min(highest + 1, MAX_ORDER);
}

/** Adds a union of these partners and returns its id. */
export function newUnion(draft: Draft, partnerIds: string[]): string {
  const id = newObjectId();
  draft.push({
    type: 'addUnion',
    payload: { id, partnerIds, order: nextUnionOrder(draft.tree, partnerIds), status: 'married' },
  });
  return id;
}

/** The child goes after their new siblings when those are numbered; else their number is cleared. */
function numberLast(draft: Draft, childId: string, unionId: string): void {
  const siblings = buildTreeIndex(draft.tree)
    .childrenOf(unionId)
    .filter((sibling) => sibling.id !== childId);
  const numbers = siblings.flatMap((sibling) =>
    sibling.siblingOrder === undefined ? [] : [sibling.siblingOrder],
  );
  const highest = numbers.length === 0 ? undefined : Math.max(...numbers);
  const current = draft.tree.persons[childId]?.siblingOrder;
  const next = highest !== undefined && highest < MAX_ORDER ? highest + 1 : undefined;
  if (next === current) return;
  draft.push({
    type: 'updatePerson',
    payload: { id: childId, changes: { siblingOrder: next ?? null } },
  });
}

/** The child leaves one parent and keeps the other (in that parent's one-person union). */
export function detachFromParent(draft: Draft, childId: string, parentId: string): void {
  const unionId = draft.tree.persons[childId]?.parentUnionId;
  const union = unionId === undefined ? undefined : draft.tree.unions[unionId];
  if (union === undefined || !union.partnerIds.includes(parentId)) return;
  const other = union.partnerIds.find((id) => id !== parentId);
  if (other === undefined) {
    draft.push({ type: 'setParents', payload: { personId: childId, parentUnionId: null } });
    return;
  }
  const alone = buildTreeIndex(draft.tree)
    .unionsOf(other)
    .find((candidate) => isAlone(candidate, other));
  const target = alone?.id ?? newUnion(draft, [other]);
  draft.push({ type: 'setParents', payload: { personId: childId, parentUnionId: target } });
  numberLast(draft, childId, target);
}

/** A couple splits; their children stay with `keeperId` (spec §7.6). */
export function separateCouple(draft: Draft, union: Union, keeperId: string): void {
  const hasChildren = buildTreeIndex(draft.tree).childrenOf(union.id).length > 0;
  if (hasChildren) {
    draft.push({ type: 'updateUnion', payload: { id: union.id, changes: { partnerIds: [keeperId] } } });
  } else {
    draft.push({ type: 'deleteUnion', payload: { id: union.id } });
  }
}

/** Step 4 and 5: true when the relation already holds; otherwise removes A and B's direct link. */
function clearDirect(draft: Draft, a: string, b: string, relation: Relation): boolean {
  const shared = buildTreeIndex(draft.tree)
    .unionsOf(a)
    .find((union) => union.partnerIds.includes(b));
  const aParents = parentIdsOf(draft.tree, a);
  const bParents = parentIdsOf(draft.tree, b);
  if (relation === 'spouse' && shared !== undefined) return true;
  if (relation === 'child' && aParents.includes(b)) return true;
  if (relation === 'parent' && bParents.includes(a)) return true;
  if (shared !== undefined) separateCouple(draft, shared, relation === 'parent' ? b : a);
  if (aParents.includes(b)) detachFromParent(draft, a, b);
  if (bParents.includes(a)) detachFromParent(draft, b, a);
  return false;
}

function marry(draft: Draft, a: string, b: string, answers: RelateAnswers): Step {
  const index = buildTreeIndex(draft.tree);
  const aloneA = index.unionsOf(a).find((union) => isAlone(union, a));
  const aloneB = index.unionsOf(b).find((union) => isAlone(union, b));
  const kidsA = aloneA ? index.childrenOf(aloneA.id) : [];
  const kidsB = aloneB ? index.childrenOf(aloneB.id) : [];
  const orphans = [...kidsA, ...kidsB];
  if (orphans.length > 0 && answers.shareChildren === undefined) {
    return ask({ kind: 'sharedChildren', childIds: orphans.map((child) => child.id) });
  }
  if (orphans.length > 0 && answers.shareChildren === true) {
    const keep = (kidsA.length > 0 ? aloneA : aloneB) as Union;
    const other = keep === aloneA ? aloneB : aloneA;
    const newcomer = keep === aloneA ? b : a;
    draft.push({
      type: 'updateUnion',
      payload: { id: keep.id, changes: { partnerIds: [...keep.partnerIds, newcomer] } },
    });
    if (other !== undefined) {
      for (const kid of index.childrenOf(other.id)) {
        draft.push({ type: 'setParents', payload: { personId: kid.id, parentUnionId: keep.id } });
      }
      draft.push({ type: 'deleteUnion', payload: { id: other.id } });
    }
    return done(null);
  }
  // Not shared, or none: an empty one-person union of either is filled, else a new marriage.
  const empty = [aloneA, aloneB].find(
    (union) => union !== undefined && index.childrenOf(union.id).length === 0,
  );
  if (empty !== undefined) {
    const owner = empty.partnerIds[0] as string;
    draft.push({
      type: 'updateUnion',
      payload: { id: empty.id, changes: { partnerIds: [owner, owner === a ? b : a] } },
    });
  } else {
    newUnion(draft, [a, b]);
  }
  return done(null);
}

function withWhom(unions: readonly Union[], b: string): Step {
  return ask({
    kind: 'withWhom',
    unions: unions.map((union) => ({
      unionId: union.id,
      partnerId: union.partnerIds.find((id) => id !== b) ?? null,
    })),
    alone: !unions.some((union) => isAlone(union, b)),
  });
}

function makeChild(draft: Draft, a: string, b: string, answers: RelateAnswers): Step {
  const unions = buildTreeIndex(draft.tree).unionsOf(b);
  let unionId: string;
  if (answers.union === ALONE || unions.length === 0) {
    unionId = unions.find((union) => isAlone(union, b))?.id ?? newUnion(draft, [b]);
  } else if (answers.union !== undefined) {
    // An answer for a union that is no longer B's (the tree changed): ask again.
    if (!unions.some((union) => union.id === answers.union)) return withWhom(unions, b);
    unionId = answers.union;
  } else if (unions.length >= 2) {
    return withWhom(unions, b);
  } else {
    unionId = (unions[0] as Union).id;
  }
  const withId = draft.tree.unions[unionId]?.partnerIds.find((id) => id !== b) ?? null;
  draft.push({ type: 'setParents', payload: { personId: a, parentUnionId: unionId } });
  numberLast(draft, a, unionId);
  return done(withId);
}

function makeParent(draft: Draft, a: string, b: string, answers: RelateAnswers): Step {
  const unionId = draft.tree.persons[b]?.parentUnionId;
  if (unionId === undefined) {
    const id = newUnion(draft, [a]);
    draft.push({ type: 'setParents', payload: { personId: b, parentUnionId: id } });
    return done(null);
  }
  const union = draft.tree.unions[unionId] as Union;
  if (union.partnerIds.length === 1) {
    const kept = union.partnerIds[0] as string;
    draft.push({ type: 'updateUnion', payload: { id: unionId, changes: { partnerIds: [kept, a] } } });
    return done(kept);
  }
  const [first, second] = union.partnerIds as [string, string];
  if (answers.replaces !== first && answers.replaces !== second) {
    return ask({ kind: 'replaceParent', parentIds: [first, second] });
  }
  const kept = answers.replaces === first ? second : first;
  const existing = buildTreeIndex(draft.tree)
    .unionsOf(kept)
    .find((candidate) => candidate.partnerIds.length === 2 && candidate.partnerIds.includes(a));
  const target = existing?.id ?? newUnion(draft, [kept, a]);
  draft.push({ type: 'setParents', payload: { personId: b, parentUnionId: target } });
  numberLast(draft, b, target);
  return done(kept);
}

function reorder(tree: TreeState, a: string, b: string, relation: 'before' | 'after'): RelateResult {
  const unionId = tree.persons[a]?.parentUnionId;
  if (unionId === undefined || unionId !== tree.persons[b]?.parentUnionId) {
    return blocked('NOT_SIBLINGS');
  }
  const current = buildTreeIndex(tree)
    .childrenOf(unionId)
    .map((child) => child.id);
  if (current.length > MAX_ORDER) return blocked('TOO_MANY_SIBLINGS');
  const order = current.filter((id) => id !== a);
  order.splice(order.indexOf(b) + (relation === 'after' ? 1 : 0), 0, a);
  if (order.every((id, at) => id === current[at])) return blocked('ALREADY');
  const ops: SingleOp[] = order.flatMap((id, at) =>
    tree.persons[id]?.siblingOrder === at + 1
      ? []
      : [{ type: 'updatePerson', payload: { id, changes: { siblingOrder: at + 1 } } }],
  );
  return {
    kind: 'ok',
    op: { type: 'batch', payload: { ops } },
    effect: { relation, personId: a, targetId: b, withId: null },
  };
}

/**
 * Makes A the parent, spouse or child of B, or puts A before or after B among siblings (spec
 * §7.6). Answers a batch op, a follow-up question, or why it cannot be done. Pure: every step
 * runs through `applyOp`, so a change the server would refuse is never offered.
 */
export function relate(
  tree: TreeState,
  personId: string,
  targetId: string,
  relation: Relation,
  answers: RelateAnswers = {},
): RelateResult {
  if (personId === targetId) return blocked('SAME_PERSON');
  if (!Object.hasOwn(tree.persons, personId) || !Object.hasOwn(tree.persons, targetId)) {
    return blocked('PERSON_NOT_FOUND');
  }
  if (relation === 'before' || relation === 'after') {
    return reorder(tree, personId, targetId, relation);
  }
  if (relation === 'parent' && classifyLineage(tree).get(targetId) === 'in-law') {
    return blocked('IN_LAW_PARENT');
  }
  try {
    const draft = new Draft(tree);
    if (clearDirect(draft, personId, targetId, relation)) return blocked('ALREADY');
    const step =
      relation === 'spouse'
        ? marry(draft, personId, targetId, answers)
        : relation === 'child'
          ? makeChild(draft, personId, targetId, answers)
          : makeParent(draft, personId, targetId, answers);
    if (step.kind === 'ask') return step;
    return {
      kind: 'ok',
      op: draft.batch(),
      effect: { relation, personId, targetId, withId: step.withId },
    };
  } catch (error) {
    if (error instanceof OpError) return blocked(error.code);
    throw error;
  }
}
```

Append to `packages/shared/src/tree/index.ts`:

```ts
export {
  ALONE,
  relate,
  type Relation,
  type RelateAnswers,
  type RelateBlock,
  type RelateEffect,
  type RelateQuestion,
  type RelateResult,
} from './relate.ts';
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @ancestors-tree/shared exec vitest run src/tree/relate.test.ts`
Expected: PASS. If a test about which partner order a union holds fails only on order, the test sorts ids on purpose: fix the code, not the sort.

- [ ] **Step 5: Write the property test**

Read `packages/shared/src/tree/apply-op.properties.test.ts` first and reuse its tree generator (import it if it is exported; otherwise move the generator to `packages/shared/src/tree/testing.ts` as `arbitraryTree()` and import it from both files, keeping the old test's behaviour). Create `packages/shared/src/tree/relate.properties.test.ts`:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyOp } from './apply-op.ts';
import { OpError } from './op-error.ts';
import { ALONE, relate, type Relation, type RelateResult } from './relate.ts';
import { arbitraryTree, invariantViolations } from './testing.ts';

const RELATIONS: Relation[] = ['parent', 'spouse', 'child', 'before', 'after'];

/** Answers every question with its first choice, so the property reaches the op. */
function answered(result: RelateResult, again: (answers: object) => RelateResult): RelateResult {
  if (result.kind !== 'ask') return result;
  const question = result.question;
  if (question.kind === 'withWhom') return again({ union: question.unions[0]?.unionId ?? ALONE });
  if (question.kind === 'replaceParent') return again({ replaces: question.parentIds[0] });
  return again({ shareChildren: true });
}

describe('relate (properties)', () => {
  it('only offers ops applyOp accepts, which keep the tree valid', () => {
    fc.assert(
      fc.property(
        arbitraryTree(),
        fc.nat(),
        fc.nat(),
        fc.constantFrom(...RELATIONS),
        (tree, i, j, relation) => {
          const ids = Object.keys(tree.persons);
          if (ids.length < 2) return;
          const a = ids[i % ids.length] as string;
          const b = ids[j % ids.length] as string;
          const result = answered(relate(tree, a, b, relation), (answers) =>
            relate(tree, a, b, relation, answers),
          );
          if (result.kind !== 'ok') return;
          const next = applyOp(tree, result.op).tree;
          expect(invariantViolations(next)).toEqual([]);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('never blocks with an OpError code that applyOp would not raise', () => {
    fc.assert(
      fc.property(arbitraryTree(), fc.nat(), fc.nat(), (tree, i, j) => {
        const ids = Object.keys(tree.persons);
        if (ids.length < 2) return;
        const a = ids[i % ids.length] as string;
        const b = ids[j % ids.length] as string;
        const result = relate(tree, a, b, 'child', { union: ALONE });
        if (result.kind === 'blocked' && result.reason === 'CYCLE') {
          // Directly: putting A under B alone is a cycle exactly when A is B's ancestor.
          const attempt = () =>
            applyOp(tree, {
              type: 'batch',
              payload: {
                ops: [
                  { type: 'addUnion', payload: { id: 'f'.repeat(24), partnerIds: [b], order: 99, status: 'married' } },
                  { type: 'setParents', payload: { personId: a, parentUnionId: 'f'.repeat(24) } },
                ],
              },
            });
          expect(attempt).toThrow(OpError);
        }
      }),
      { numRuns: 300 },
    );
  });
});
```

If `arbitraryTree()` can produce an id equal to `'f'.repeat(24)`, pick another fixed id that the generator never makes (read it to check).

Run: `pnpm --filter @ancestors-tree/shared exec vitest run src/tree/relate.properties.test.ts`
Expected: PASS.

- [ ] **Step 6: Mutation checks**

Make each change, run `relate.test.ts`, see at least one test fail, then restore:
1. In `clearDirect`, keep the children with the other partner (`relation === 'parent' ? a : b`).
2. In `makeParent`, move every child of the union (replace `setParents(b, …)` with `updateUnion` of the union's partners).
3. In `relate`, drop the `IN_LAW_PARENT` check.
4. In `reorder`, drop the `ALREADY` check.

- [ ] **Step 7: Run the whole check, then commit**

Run: `pnpm exec prettier --write packages/shared/src/tree/relate.ts packages/shared/src/tree/relate.test.ts packages/shared/src/tree/relate.properties.test.ts packages/shared/src/tree/index.ts packages/shared/src/tree/testing.ts`, then `pnpm check`. Expected: exit 0.

Commit message (`.superpowers/sdd/p6c-task-1-commit.txt`):

```
feat(shared): relate rules for parent, spouse, child and sibling order

relate(tree, A, B, relation, answers) answers one batch op, a
follow-up question or a block (spec 7.6): replace instead of stack,
"with whom?", "which parent?", "shared children?", and the sibling
order. Every step runs through applyOp, so the client never offers a
change the server would refuse.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 2: Relationships, cuts, detach and loose stacks (shared)

Spec §7.6 "Cut", "Loose photos", "Keyboard and screen reader".

**Files:**
- Create: `packages/shared/src/tree/relationships.ts`, `packages/shared/src/tree/looseStacks.ts`
- Modify: `packages/shared/src/tree/index.ts`
- Test: `packages/shared/src/tree/relationships.test.ts`, `packages/shared/src/tree/looseStacks.test.ts`

**Interfaces:**
- Consumes: `Draft`, `blocked`, `detachFromParent`, `separateCouple`, `RelateBlock` (Task 1).
- Produces (exported from `@ancestors-tree/shared/tree`):
  - `interface Marriage { union: Union; partnerId: string | null; childIds: string[] }`
  - `interface PersonRelationships { parentUnionId: string | null; parentIds: string[]; marriages: Marriage[] }`
  - `relationshipsOf(tree: TreeState, personId: string): PersonRelationships`
  - `removeParentOp(tree: TreeState, childId: string, parentId: string): BatchOp | null`
  - `cutThreadOp(childId: string): BatchOp`
  - `type CutResult = { kind: 'ok'; op: BatchOp } | { kind: 'ask'; question: { kind: 'keepChildren'; partnerIds: [string, string] } } | { kind: 'blocked'; reason: RelateBlock }`
  - `cutMarriage(tree: TreeState, unionId: string, keepWith?: string): CutResult`
  - `unionStatusOp(unionId: string, status: UnionStatus): BatchOp`
  - `detach(tree: TreeState, personId: string): { kind: 'ok'; op: BatchOp } | { kind: 'blocked'; reason: RelateBlock }`
  - `interface LooseStack { rootId: string; personIds: string[] }`
  - `looseStacks(tree: TreeState): LooseStack[]`

Rules:
- `cutMarriage`: a union of one person, or one without children → `deleteUnion` (no question). Two partners with children and no valid `keepWith` → ask `keepChildren`. With it → `updateUnion` to `[keepWith]`.
- `detach` (a card dropped on the tray): the progenitor → `IS_PROGENITOR`. Someone with parents leaves them (`setParents(null)`), so their own spouse and descendants go with them as one branch. An in-law (no parents in the tree, married to a blood member) leaves each marriage with a blood partner; the children stay with the blood partner. Nothing to remove → `ALREADY`.
- `looseStacks`: the unlinked people (`classifyLineage` → `'unlinked'`), joined through shared unions and parent links into groups. A group's root is a member with no parent inside the group; among several, the one with the most descendants inside the group, then by `fullName` (`localeCompare(…, 'vi')`), then by id. `personIds` starts with the root, then a breadth-first walk (spouses, then children), then anyone left, by name. Stacks sort by their root's name.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/tree/relationships.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyOp } from './apply-op.ts';
import {
  cutMarriage,
  cutThreadOp,
  detach,
  relationshipsOf,
  removeParentOp,
  unionStatusOp,
} from './relationships.ts';
import type { TreeState } from './state.ts';
import { invariantViolations, makePerson, makeUnion, testId, treeOf } from './testing.ts';

const GRANDPA = testId(1);
const GRANDMA = testId(2);
const SON = testId(3);
const WIFE = testId(5);
const KID = testId(6);
const OLD = testId(101);
const YOUNG = testId(102);

function family(): TreeState {
  return treeOf(
    [
      makePerson(GRANDPA),
      makePerson(GRANDMA, { gender: 'female' }),
      makePerson(SON, { parentUnionId: OLD }),
      makePerson(WIFE, { gender: 'female' }),
      makePerson(KID, { parentUnionId: YOUNG }),
    ],
    [makeUnion(OLD, [GRANDPA, GRANDMA]), makeUnion(YOUNG, [SON, WIFE])],
    GRANDPA,
  );
}

function valid(tree: TreeState, op: Parameters<typeof applyOp>[1]): TreeState {
  const next = applyOp(tree, op).tree;
  expect(invariantViolations(next)).toEqual([]);
  return next;
}

describe('relationshipsOf', () => {
  it('lists parents and marriages with their children', () => {
    expect(relationshipsOf(family(), SON)).toEqual({
      parentUnionId: OLD,
      parentIds: [GRANDPA, GRANDMA],
      marriages: [{ union: family().unions[YOUNG], partnerId: WIFE, childIds: [KID] }],
    });
    expect(relationshipsOf(family(), testId(99))).toEqual({
      parentUnionId: null,
      parentIds: [],
      marriages: [],
    });
  });
});

describe('removing and cutting', () => {
  it('removes one parent and keeps the other', () => {
    const tree = family();
    const op = removeParentOp(tree, SON, GRANDMA);
    expect(op).not.toBeNull();
    const next = valid(tree, op!);
    const unionId = next.persons[SON]?.parentUnionId as string;
    expect(next.unions[unionId]?.partnerIds).toEqual([GRANDPA]);
    expect(removeParentOp(tree, SON, WIFE)).toBeNull();
  });

  it('cuts a thread', () => {
    const next = valid(family(), cutThreadOp(SON));
    expect(next.persons[SON]?.parentUnionId).toBeUndefined();
  });

  it('asks who the children stay with, then keeps them with that partner', () => {
    const tree = family();
    expect(cutMarriage(tree, YOUNG)).toEqual({
      kind: 'ask',
      question: { kind: 'keepChildren', partnerIds: [SON, WIFE] },
    });
    const result = cutMarriage(tree, YOUNG, WIFE);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const next = valid(tree, result.op);
    expect(next.unions[YOUNG]?.partnerIds).toEqual([WIFE]);
  });

  it('deletes a marriage without children, with no question', () => {
    const tree = valid(family(), { type: 'setParents', payload: { personId: KID, parentUnionId: null } });
    const result = cutMarriage(tree, YOUNG);
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(valid(tree, result.op).unions[YOUNG]).toBeUndefined();
    expect(cutMarriage(tree, testId(99))).toEqual({ kind: 'blocked', reason: 'UNION_NOT_FOUND' });
  });

  it('changes a marriage’s status', () => {
    const next = valid(family(), unionStatusOp(YOUNG, 'divorced'));
    expect(next.unions[YOUNG]?.status).toBe('divorced');
  });
});

describe('detach (a card dropped on the tray)', () => {
  it('takes someone with parents away with their branch', () => {
    const tree = family();
    const result = detach(tree, SON);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const next = valid(tree, result.op);
    expect(next.persons[SON]?.parentUnionId).toBeUndefined();
    expect(next.persons[KID]?.parentUnionId).toBe(YOUNG);
  });

  it('takes an in-law out of the marriage, the children staying with the blood partner', () => {
    const tree = family();
    const result = detach(tree, WIFE);
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(valid(tree, result.op).unions[YOUNG]?.partnerIds).toEqual([SON]);
  });

  it('refuses the progenitor and someone already loose', () => {
    expect(detach(family(), GRANDPA)).toEqual({ kind: 'blocked', reason: 'IS_PROGENITOR' });
    const loose = treeOf([makePerson(testId(7))]);
    expect(detach(loose, testId(7))).toEqual({ kind: 'blocked', reason: 'ALREADY' });
  });
});
```

Create `packages/shared/src/tree/looseStacks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { looseStacks } from './looseStacks.ts';
import { makePerson, makeUnion, testId, treeOf } from './testing.ts';

describe('looseStacks', () => {
  it('groups a detached branch under its topmost person, and lone people alone', () => {
    const ROOT = testId(1);
    const TOP = testId(2);
    const TOP_WIFE = testId(3);
    const CHILD = testId(4);
    const LONE = testId(5);
    const tree = treeOf(
      [
        makePerson(ROOT, { fullName: 'An' }),
        makePerson(TOP, { fullName: 'Bảo' }),
        makePerson(TOP_WIFE, { fullName: 'Cúc', gender: 'female' }),
        makePerson(CHILD, { fullName: 'Dũng', parentUnionId: testId(101) }),
        makePerson(LONE, { fullName: 'Ánh' }),
      ],
      [makeUnion(testId(101), [TOP, TOP_WIFE])],
      ROOT,
    );
    expect(looseStacks(tree)).toEqual([
      { rootId: LONE, personIds: [LONE] },
      { rootId: TOP, personIds: [TOP, TOP_WIFE, CHILD] },
    ]);
  });

  it('is empty when everyone is linked', () => {
    expect(looseStacks(treeOf([makePerson(testId(1))], [], testId(1)))).toEqual([]);
  });
});
```

(In the first test the root is "Bảo", not "Cúc": both have no parent in the group and the same descendants, and "Bảo" comes first by name. "Ánh" sorts before "Bảo" under `'vi'` collation; if the run shows otherwise, check with `['Ánh','Bảo'].sort((a,b)=>a.localeCompare(b,'vi'))` and fix the expectation's order, not the code.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm --filter @ancestors-tree/shared exec vitest run src/tree/relationships.test.ts src/tree/looseStacks.test.ts`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 3: Write `relationships.ts`**

Create `packages/shared/src/tree/relationships.ts`:

```ts
import { buildTreeIndex, classifyLineage } from './lineage.ts';
import { OpError } from './op-error.ts';
import type { BatchOp } from './ops.ts';
import { blocked, detachFromParent, Draft, separateCouple, type RelateBlock } from './relate.ts';
import type { Union, UnionStatus } from './schemas.ts';
import type { TreeState } from './state.ts';

export interface Marriage {
  union: Union;
  /** The other partner; null for a one-person union. */
  partnerId: string | null;
  childIds: string[];
}

export interface PersonRelationships {
  parentUnionId: string | null;
  parentIds: string[];
  marriages: Marriage[];
}

/** A person's parents and marriages, for "Change relationship…" (spec §7.6). */
export function relationshipsOf(tree: TreeState, personId: string): PersonRelationships {
  const person = Object.hasOwn(tree.persons, personId) ? tree.persons[personId] : undefined;
  if (person === undefined) return { parentUnionId: null, parentIds: [], marriages: [] };
  const index = buildTreeIndex(tree);
  const parentUnionId = person.parentUnionId ?? null;
  return {
    parentUnionId,
    parentIds: parentUnionId === null ? [] : [...(tree.unions[parentUnionId]?.partnerIds ?? [])],
    marriages: index.unionsOf(personId).map((union) => ({
      union,
      partnerId: union.partnerIds.find((id) => id !== personId) ?? null,
      childIds: index.childrenOf(union.id).map((child) => child.id),
    })),
  };
}

/** The child leaves one parent and keeps the other; null when that is not their parent. */
export function removeParentOp(tree: TreeState, childId: string, parentId: string): BatchOp | null {
  const draft = new Draft(tree);
  detachFromParent(draft, childId, parentId);
  return draft.ops.length === 0 ? null : draft.batch();
}

/** Cutting a parent → child thread (spec §7.6). */
export function cutThreadOp(childId: string): BatchOp {
  return {
    type: 'batch',
    payload: { ops: [{ type: 'setParents', payload: { personId: childId, parentUnionId: null } }] },
  };
}

export type CutResult =
  | { kind: 'ok'; op: BatchOp }
  | { kind: 'ask'; question: { kind: 'keepChildren'; partnerIds: [string, string] } }
  | { kind: 'blocked'; reason: RelateBlock };

/** Cutting a marriage: who keeps the children is asked when there are any (spec §7.6). */
export function cutMarriage(tree: TreeState, unionId: string, keepWith?: string): CutResult {
  if (!Object.hasOwn(tree.unions, unionId)) return blocked('UNION_NOT_FOUND');
  const union = tree.unions[unionId] as Union;
  const hasChildren = buildTreeIndex(tree).childrenOf(unionId).length > 0;
  const draft = new Draft(tree);
  if (union.partnerIds.length === 2 && hasChildren) {
    if (keepWith === undefined || !union.partnerIds.includes(keepWith)) {
      return {
        kind: 'ask',
        question: { kind: 'keepChildren', partnerIds: [...union.partnerIds] as [string, string] },
      };
    }
    separateCouple(draft, union, keepWith);
  } else if (hasChildren) {
    // One partner with children: cutting it leaves the children without that parent.
    for (const child of buildTreeIndex(tree).childrenOf(unionId)) {
      draft.push({ type: 'setParents', payload: { personId: child.id, parentUnionId: null } });
    }
    draft.push({ type: 'deleteUnion', payload: { id: unionId } });
  } else {
    draft.push({ type: 'deleteUnion', payload: { id: unionId } });
  }
  return { kind: 'ok', op: draft.batch() };
}

/** Married, divorced or widowed (spec §7.6: a divorce is a status, not a cut). */
export function unionStatusOp(unionId: string, status: UnionStatus): BatchOp {
  return {
    type: 'batch',
    payload: { ops: [{ type: 'updateUnion', payload: { id: unionId, changes: { status } } }] },
  };
}

/**
 * A card dropped on the Loose photos tray (spec §7.6). Someone with parents leaves them and takes
 * their branch along; an in-law leaves their marriages to blood members, the children staying.
 */
export function detach(
  tree: TreeState,
  personId: string,
): { kind: 'ok'; op: BatchOp } | { kind: 'blocked'; reason: RelateBlock } {
  if (!Object.hasOwn(tree.persons, personId)) return blocked('PERSON_NOT_FOUND');
  if (tree.progenitorId === personId) return blocked('IS_PROGENITOR');
  try {
    const draft = new Draft(tree);
    if (tree.persons[personId]?.parentUnionId !== undefined) {
      draft.push({ type: 'setParents', payload: { personId, parentUnionId: null } });
    } else if (classifyLineage(tree).get(personId) === 'in-law') {
      const lineage = classifyLineage(tree);
      for (const union of buildTreeIndex(tree).unionsOf(personId)) {
        const partner = union.partnerIds.find((id) => id !== personId);
        if (partner !== undefined && lineage.get(partner) === 'blood') {
          separateCouple(draft, draft.tree.unions[union.id] as Union, partner);
        }
      }
    }
    return draft.ops.length === 0 ? blocked('ALREADY') : { kind: 'ok', op: draft.batch() };
  } catch (error) {
    if (error instanceof OpError) return blocked(error.code);
    throw error;
  }
}
```

- [ ] **Step 4: Write `looseStacks.ts`**

Create `packages/shared/src/tree/looseStacks.ts`:

```ts
import { buildTreeIndex, classifyLineage } from './lineage.ts';
import type { Person } from './schemas.ts';
import type { TreeState } from './state.ts';

/** One branch in the Loose photos tray: dragging its root brings everyone (spec §7.6). */
export interface LooseStack {
  rootId: string;
  /** The root first, then a walk down the branch. */
  personIds: string[];
}

function byName(a: Person, b: Person): number {
  return a.fullName.localeCompare(b.fullName, 'vi') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The unlinked people grouped by branch, each group led by its topmost person. */
export function looseStacks(tree: TreeState): LooseStack[] {
  const index = buildTreeIndex(tree);
  const lineage = classifyLineage(tree, index);
  const loose = Object.values(tree.persons).filter((person) => lineage.get(person.id) === 'unlinked');
  const looseIds = new Set(loose.map((person) => person.id));

  // Union-find over the loose people, joined by shared unions and parent links.
  const parent = new Map<string, string>(loose.map((person) => [person.id, person.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(id, root);
    return root;
  };
  const join = (a: string, b: string) => parent.set(find(a), find(b));
  for (const union of Object.values(tree.unions)) {
    const members = union.partnerIds.filter((id) => looseIds.has(id));
    for (const child of index.childrenOf(union.id)) if (looseIds.has(child.id)) members.push(child.id);
    for (const other of members.slice(1)) join(members[0] as string, other);
  }

  const groups = new Map<string, Person[]>();
  for (const person of loose) {
    const key = find(person.id);
    groups.set(key, [...(groups.get(key) ?? []), person]);
  }

  const descendants = (id: string, members: ReadonlySet<string>): number => {
    let count = 0;
    const queue = [id];
    const seen = new Set(queue);
    for (let at = 0; at < queue.length; at += 1) {
      for (const union of index.unionsOf(queue[at] as string)) {
        for (const child of index.childrenOf(union.id)) {
          if (members.has(child.id) && !seen.has(child.id)) {
            seen.add(child.id);
            queue.push(child.id);
            count += 1;
          }
        }
      }
    }
    return count;
  };

  const stacks = [...groups.values()].map((members): LooseStack => {
    const ids = new Set(members.map((person) => person.id));
    const hasParentInside = (person: Person) => {
      const unionId = person.parentUnionId;
      return unionId !== undefined && (tree.unions[unionId]?.partnerIds ?? []).some((id) => ids.has(id));
    };
    const candidates = members.filter((person) => !hasParentInside(person));
    const pool = candidates.length > 0 ? candidates : members;
    const root = [...pool].sort(
      (a, b) => descendants(b.id, ids) - descendants(a.id, ids) || byName(a, b),
    )[0] as Person;
    // Spouses, then children, breadth first from the root; anyone left after, by name.
    const order = [root.id];
    const seen = new Set(order);
    for (let at = 0; at < order.length; at += 1) {
      for (const union of index.unionsOf(order[at] as string)) {
        for (const id of union.partnerIds) {
          if (ids.has(id) && !seen.has(id)) {
            seen.add(id);
            order.push(id);
          }
        }
        for (const child of index.childrenOf(union.id)) {
          if (ids.has(child.id) && !seen.has(child.id)) {
            seen.add(child.id);
            order.push(child.id);
          }
        }
      }
    }
    for (const person of [...members].sort(byName)) if (!seen.has(person.id)) order.push(person.id);
    return { rootId: root.id, personIds: order };
  });

  return stacks.sort((a, b) =>
    byName(tree.persons[a.rootId] as Person, tree.persons[b.rootId] as Person),
  );
}
```

Append to `packages/shared/src/tree/index.ts`:

```ts
export {
  cutMarriage,
  cutThreadOp,
  detach,
  relationshipsOf,
  removeParentOp,
  unionStatusOp,
  type CutResult,
  type Marriage,
  type PersonRelationships,
} from './relationships.ts';
export { looseStacks, type LooseStack } from './looseStacks.ts';
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm --filter @ancestors-tree/shared exec vitest run src/tree/relationships.test.ts src/tree/looseStacks.test.ts`
Expected: PASS.

- [ ] **Step 6: Mutation checks**

Each must fail a test, then restore:
1. In `cutMarriage`, skip the question (always keep the children with `union.partnerIds[0]`).
2. In `detach`, keep the in-law's children with the in-law (`separateCouple(…, personId)`).
3. In `looseStacks`, pick the root by name only (drop the `descendants` comparison).

- [ ] **Step 7: Run the whole check, then commit**

Run prettier on the four new files and `index.ts`, then `pnpm check`. Expected: exit 0.

Commit message (`.superpowers/sdd/p6c-task-2-commit.txt`):

```
feat(shared): relationships, cuts, detach and loose stacks

relationshipsOf lists a person's parents and marriages; removeParentOp,
cutThreadOp, cutMarriage (asking who keeps the children) and
unionStatusOp change them; detach is a card dropped on the tray; and
looseStacks groups the unlinked people by branch under their topmost
person (spec 7.6).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---
### Task 3: Loose photos tray, grouped by branch

Spec §7.6 "Loose photos": the tray is renamed **Ảnh chưa dán** ("Loose photos") and groups the unlinked people by branch. A stack shows its topmost person's photo with "+N người" and opens to list everyone.

**Files:**
- Modify: `apps/web/src/features/tree/UnlinkedTray.tsx`, `apps/web/src/features/tree/fixtures.ts`, `apps/web/src/locales/vi.json`, `apps/web/src/locales/en.json`
- Modify (old tray name in queries): `apps/web/src/features/tree/TreeEditing.test.tsx`, `apps/web/src/features/tree/TreePage.test.tsx`, `e2e/tree.spec.ts`
- Test: `apps/web/src/features/tree/UnlinkedTray.test.tsx` (new)

**Interfaces:**
- Consumes: `looseStacks`, `LooseStack` (Task 2).
- Produces:
  - `fixtures.ts`: `LOOSE_WIFE = '64b7f0c2a1b2c3d4e5f6a00b'`, `LOOSE_CHILD = '64b7f0c2a1b2c3d4e5f6a00c'`, `LOOSE_UNION = '64b7f0c2a1b2c3d4e5f6b00a'`, `LOOSE_BRANCH: TreeResponse` (FAMILY plus Bình's wife Cúc and son Dũng).
  - `UnlinkedTray.tsx`: `export function TrayPhoto({ person }: { person: Person })` (one photo with its open button), `UnlinkedTray()` (Task 4 adds a prop, Task 8 makes roots draggable).
  - Locale keys `tree.unlinked.more`, `tree.unlinked.stackToggle`, `tree.unlinked.stackList`.

- [ ] **Step 1: Add the fixture**

Append to `apps/web/src/features/tree/fixtures.ts`, after `FAMILY`:

```ts
export const LOOSE_WIFE = '64b7f0c2a1b2c3d4e5f6a00b';
export const LOOSE_CHILD = '64b7f0c2a1b2c3d4e5f6a00c';
export const LOOSE_UNION = '64b7f0c2a1b2c3d4e5f6b00a';

/** FAMILY, where Bình (not linked) has a wife and a son: one loose branch of three. */
export const LOOSE_BRANCH: TreeResponse = {
  ...FAMILY,
  persons: [
    ...FAMILY.persons,
    fixturePerson(LOOSE_WIFE, 'Phạm Thị Cúc', { gender: 'female' }),
    fixturePerson(LOOSE_CHILD, 'Trần Văn Dũng', { parentUnionId: LOOSE_UNION }),
  ],
  unions: [
    ...FAMILY.unions,
    { id: LOOSE_UNION, partnerIds: [LOOSE, LOOSE_WIFE], order: 1, status: 'married' },
  ],
};
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/features/tree/UnlinkedTray.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN_ID, FAMILY, LOOSE_BRANCH, ME, treeRoutes } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

describe('Loose photos', () => {
  it('shows a lone person as one photo, with no stack to open', async () => {
    mockApi(treeRoutes(FAMILY));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const tray = await screen.findByRole('region', { name: 'Ảnh chưa dán' });
    expect(within(tray).getByRole('button', { name: 'Trần Văn Bình' })).toBeInTheDocument();
    expect(within(tray).queryByRole('button', { name: /^\+/ })).not.toBeInTheDocument();
  });

  it('groups a loose branch under its topmost person, and opens the stack', async () => {
    const user = userEvent.setup();
    mockApi(treeRoutes(LOOSE_BRANCH));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const tray = await screen.findByRole('region', { name: 'Ảnh chưa dán' });
    const toggle = within(tray).getByRole('button', {
      name: '+2 người trong xấp của Trần Văn Bình',
    });
    expect(toggle).toHaveTextContent('+2 người');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(tray).queryByRole('button', { name: 'Phạm Thị Cúc' })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const stack = within(tray).getByRole('list', { name: 'Xấp của Trần Văn Bình' });
    // Spouses first, then children, from the top of the branch.
    expect(within(stack).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
      .toEqual(['Phạm Thị Cúc', 'Trần Văn Dũng']);
    await user.click(within(stack).getByRole('button', { name: 'Trần Văn Dũng' }));
    expect(screen.getByRole('complementary', { name: 'Trần Văn Dũng' })).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree/UnlinkedTray.test.tsx`
Expected: FAIL (the region is still called "Chưa nối vào cây", and there is no stack).

- [ ] **Step 3: Rename the tray and add the stack strings**

In `apps/web/src/locales/vi.json`, under `tree.unlinked`, set:

```json
"unlinked": {
  "title": "Ảnh chưa dán",
  "hint": "Những người này chưa nối với thuỷ tổ, nên chưa có trên sơ đồ. Mỗi xấp là một nhánh.",
  "more": "+{{count}} người",
  "stackToggle": "+{{count}} người trong xấp của {{name}}",
  "stackList": "Xấp của {{name}}"
}
```

In `apps/web/src/locales/en.json`, under `tree.unlinked`:

```json
"unlinked": {
  "title": "Loose photos",
  "hint": "These people are not linked to the progenitor yet, so they are not on the chart. Each stack is one branch.",
  "more": "+{{count}} more",
  "stackToggle": "+{{count}} more in {{name}}’s stack",
  "stackList": "{{name}}’s stack"
}
```

In both files, `tree.board.noProgenitor` names the tray: replace “Chưa nối vào cây” with “Ảnh chưa dán” in vi.json, and “Not yet linked” with “Loose photos” in en.json.

Replace every query for the old name with the new one: `'Chưa nối vào cây'` → `'Ảnh chưa dán'` in `TreeEditing.test.tsx` (two places), `TreePage.test.tsx` (one) and `e2e/tree.spec.ts` (one). Run `pnpm exec rg -n "Chưa nối vào cây" apps e2e` afterwards: no hits.

- [ ] **Step 4: Group the tray by branch**

Replace `apps/web/src/features/tree/UnlinkedTray.tsx` with:

```tsx
import { looseStacks, type LooseStack, type Person } from '@ancestors-tree/shared/tree';
import { useContext, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Polaroid, tiltFor } from '../../shared/ui';
import { lifeYears, lifeYearsSpoken } from './format';
import { OpenPersonContext } from './profileParams';
import { useTreeStore } from './store';

/** One loose photo, opening the person's profile. */
export function TrayPhoto({ person }: { person: Person }) {
  const { t } = useTranslation();
  const openPerson = useContext(OpenPersonContext);
  const years = lifeYears(person);
  const spokenYears = lifeYearsSpoken(t, person);
  const label =
    spokenYears === undefined
      ? person.fullName
      : t('scrapbook.personLabel', { name: person.fullName, years: spokenYears });
  return (
    <div className="relative">
      <Polaroid
        aria-hidden="true"
        lod="label"
        name={person.fullName}
        label={label}
        lifeYears={years}
        tape="loose"
        tilt={tiltFor(person.id)}
      />
      <button
        type="button"
        // Over the photo, not around it: its caption ("~1931") is not the spoken name, and a
        // button's text must be part of its name (WCAG 2.5.3). The outline is the app's
        // :focus-visible rule (styles/index.css).
        className="absolute inset-0 cursor-pointer rounded-photo"
        aria-label={label}
        // Focus returns here when the profile or a dialog closes (TreePage, TreeDialogs).
        data-person-open={person.id}
        onClick={() => openPerson?.(person.id)}
      />
    </div>
  );
}

/** A branch: its topmost person on top, "+N people" opening the rest (spec §7.6). */
function TrayStack({ stack }: { stack: LooseStack }) {
  const { t } = useTranslation();
  const listId = useId();
  const [open, setOpen] = useState(false);
  // The persons map itself: a stable reference between edits, so no new object per render.
  const persons = useTreeStore((state) => state.tree.persons);
  const root = persons[stack.rootId];
  if (root === undefined) return null;
  const others = stack.personIds
    .slice(1)
    .flatMap((id) => (persons[id] === undefined ? [] : [persons[id]]));
  return (
    <li className="flex flex-col items-start gap-2">
      <div className="relative">
        {others.length > 0 ? (
          // The paper of the photos underneath: decoration only.
          <span
            aria-hidden="true"
            className="absolute inset-0 translate-x-1.5 translate-y-1.5 rotate-2 rounded-photo border border-line bg-photo"
          />
        ) : null}
        <TrayPhoto person={root} />
      </div>
      {others.length > 0 ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={t('tree.unlinked.stackToggle', {
              count: others.length,
              name: root.fullName,
            })}
            onClick={() => setOpen((was) => !was)}
          >
            {t('tree.unlinked.more', { count: others.length })}
          </Button>
          <ul
            id={listId}
            hidden={!open}
            aria-label={t('tree.unlinked.stackList', { name: root.fullName })}
            className="flex flex-wrap gap-3 border-l-2 border-line pl-3"
          >
            {others.map((person) => (
              <li key={person.id}>
                <TrayPhoto person={person} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </li>
  );
}

/** People not linked to the progenitor (spec §8 "unlinked"), one stack per branch (§7.6). */
export function UnlinkedTray() {
  const { t } = useTranslation();
  const headingId = useId();
  const tree = useTreeStore((state) => state.tree);
  const stacks = useMemo(() => looseStacks(tree), [tree]);

  if (stacks.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-bold text-ink">
        {t('tree.unlinked.title')}
      </h2>
      <p className="text-sm text-ink-muted">{t('tree.unlinked.hint')}</p>
      <ul className="flex flex-wrap items-start gap-4">
        {stacks.map((stack) => (
          <TrayStack key={stack.rootId} stack={stack} />
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree`
Expected: PASS, including the updated `TreeEditing.test.tsx` and `TreePage.test.tsx`.

Mutation checks (each must fail a test, then restore): render `others` without `hidden={!open}`; drop the `aria-label` of the toggle.

- [ ] **Step 6: Run the whole check, then commit**

Prettier on the changed files, then `pnpm check` (exit 0).

Commit message (`.superpowers/sdd/p6c-task-3-commit.txt`):

```
feat(web): Loose photos tray grouped by branch

The unlinked tray is now "Ảnh chưa dán" (Loose photos) and shows one
stack per branch: the topmost person's photo and "+N người", opening
to list the others (spec 7.6).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 4: Add several people

Spec §7.6 "Add several people": one row per person (full name, gender, living/deceased), a new row when the last is filled, empty rows ignored, one `batch` of `addPerson` (at most 500 rows), one undo step; the people go to Loose photos. Opened from the toolbar and from the tray; editors only.

**Files:**
- Create: `apps/web/src/features/tree/AddSeveralDialog.tsx`, `apps/web/src/features/tree/testKit.ts`
- Modify: `apps/web/src/features/tree/ops.ts`, `TreeDialogs.tsx`, `TreeToolbar.tsx`, `TreePage.tsx`, `UnlinkedTray.tsx`, `TreeEditing.test.tsx` (helpers move to testKit), locales
- Test: `apps/web/src/features/tree/AddSeveral.test.tsx` (new), `apps/web/src/features/tree/ops.test.ts`

**Interfaces:**
- Consumes: `MAX_BATCH_OPS` (shared), `buildPerson`, `NewPersonInput`, `useTreeDialog`, `TrayPhoto`.
- Produces:
  - `ops.ts`: `export const MAX_SEVERAL = MAX_BATCH_OPS` (500), `export function addSeveralOp(inputs: readonly NewPersonInput[]): Op`
  - `TreeDialog` gains `{ kind: 'several' }`.
  - `TreeToolbar({ canEdit, onAddSeveral }: { canEdit: boolean; onAddSeveral?: () => void })`
  - `UnlinkedTray({ onAddSeveral }: { onAddSeveral?: () => void })`
  - `testKit.ts`: `OPS`, `EDITOR`, `batchOps(request)`, `cardName(name)`, `card(name)`, `editableTree(tree, clan?)` — used by every later web test.

- [ ] **Step 1: Move the shared test helpers to `testKit.ts`**

Create `apps/web/src/features/tree/testKit.ts` with the helpers `TreeEditing.test.tsx` defines today (same bodies):

```ts
import type { Clan, TreeResponse } from '@ancestors-tree/shared';
import type { Op } from '@ancestors-tree/shared/tree';
import { screen } from '@testing-library/react';
import { mockApi } from '../../test/api';
import { CLAN, CLAN_ID, treeRoutes } from './fixtures';

export const OPS = `POST /clans/${CLAN_ID}/ops`;
export const EDITOR: Clan = { ...CLAN, role: 'editor' };

/** The ops inside the op of a sent request, which must be a batch. */
export function batchOps(request: unknown): Op[] {
  const { op } = request as { op: Op };
  if (op.type !== 'batch') throw new Error(`Expected a batch, got ${op.type}`);
  return op.payload.ops;
}

/** A person's card button, named by their label: the name, then the years and generation. */
export function cardName(name: string): RegExp {
  return new RegExp(`^${name}(,|$)`);
}

export function card(name: string): HTMLElement {
  return screen.getByRole('button', { name: cardName(name) });
}

/** Mocks the tree and accepts every op; returns the bodies the page sent. */
export function editableTree(tree: TreeResponse, clan: Clan = CLAN) {
  let seq = tree.version;
  const api = mockApi({
    ...treeRoutes(tree, clan),
    [OPS]: () => {
      seq += 1;
      return { body: { seq } };
    },
  });
  return () => api.calls.filter((call) => call.method === 'POST').map((call) => call.body);
}
```

In `TreeEditing.test.tsx`, delete its own `OPS`, `EDITOR`, `batchOps`, `cardName`, `card` and `editableTree`, and import them from `./testKit`. Run `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree/TreeEditing.test.tsx`: PASS, unchanged.

- [ ] **Step 2: Write the failing tests**

Append to `apps/web/src/features/tree/ops.test.ts`, inside `describe('op builders', …)`:

```ts
  it('adds several people in one batch, without relationships', () => {
    const op = addSeveralOp([input, { fullName: 'Lê Thị Mai', gender: 'female', isDeceased: true }]);
    expect(op.type).toBe('batch');
    const next = applyOp(tree, op).tree;
    const added = Object.values(next.persons).filter((person) => !tree.persons[person.id]);
    expect(added.map((person) => [person.fullName, person.parentUnionId])).toEqual([
      ['Nguyễn Văn Út', undefined],
      ['Lê Thị Mai', undefined],
    ]);
    expect(Object.keys(next.unions)).toEqual(Object.keys(tree.unions));
  });
```

(add `addSeveralOp` to the import from `./ops`).

Create `apps/web/src/features/tree/AddSeveral.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, FAMILY, ME } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { batchOps, EDITOR, editableTree } from './testKit';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

async function openFromToolbar(user: ReturnType<typeof userEvent.setup>) {
  const toolbar = await screen.findByRole('group', { name: 'Công cụ của cây' });
  await user.click(within(toolbar).getByRole('button', { name: 'Thêm nhiều người' }));
  return screen.getByRole('dialog', { name: 'Thêm nhiều người' });
}

function row(dialog: HTMLElement, n: number): HTMLElement {
  return within(dialog).getByRole('group', { name: `Người thứ ${n}` });
}

describe('Add several people', () => {
  it('adds the filled rows in one batch, as Loose photos, undone in one step', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openFromToolbar(user);
    expect(within(dialog).queryByRole('group', { name: 'Người thứ 2' })).not.toBeInTheDocument();

    await user.type(within(row(dialog, 1)).getByLabelText('Họ và tên'), 'Nguyễn Thị Mai');
    await user.selectOptions(within(row(dialog, 1)).getByLabelText('Giới tính'), 'Nữ');
    // Filling the last row adds an empty one.
    await user.type(within(row(dialog, 2)).getByLabelText('Họ và tên'), 'Nguyễn Văn Hùng');
    await user.click(within(row(dialog, 2)).getByRole('checkbox', { name: 'Đã mất' }));
    expect(row(dialog, 3)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào cây' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0])).toEqual([
      {
        type: 'addPerson',
        payload: expect.objectContaining({
          fullName: 'Nguyễn Thị Mai',
          gender: 'female',
          death: { isDeceased: false },
        }),
      },
      {
        type: 'addPerson',
        payload: expect.objectContaining({
          fullName: 'Nguyễn Văn Hùng',
          gender: 'male',
          death: { isDeceased: true },
        }),
      },
    ]);
    const tray = screen.getByRole('region', { name: 'Ảnh chưa dán' });
    expect(within(tray).getByRole('button', { name: 'Nguyễn Thị Mai' })).toBeInTheDocument();
    // Focus is back on the toolbar button that opened the form.
    const toolbar = screen.getByRole('group', { name: 'Công cụ của cây' });
    await waitFor(() =>
      expect(within(toolbar).getByRole('button', { name: 'Thêm nhiều người' })).toHaveFocus(),
    );

    await user.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(within(tray).queryByRole('button', { name: 'Nguyễn Thị Mai' })).not.toBeInTheDocument();
    expect(within(tray).queryByRole('button', { name: 'Nguyễn Văn Hùng' })).not.toBeInTheDocument();
  });

  it('asks for at least one name, and opens from the tray too', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const tray = await screen.findByRole('region', { name: 'Ảnh chưa dán' });
    await user.click(within(tray).getByRole('button', { name: 'Thêm nhiều người' }));
    const dialog = screen.getByRole('dialog', { name: 'Thêm nhiều người' });
    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào cây' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Nhập ít nhất một họ tên.');
    expect(within(row(dialog, 1)).getByLabelText('Họ và tên')).toHaveFocus();
    expect(sent()).toEqual([]);
  });

  it('is not offered to viewers', async () => {
    editableTree(FAMILY, { ...CLAN, role: 'viewer' });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('region', { name: 'Ảnh chưa dán' });
    expect(screen.queryByRole('button', { name: 'Thêm nhiều người' })).not.toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree/AddSeveral.test.tsx src/features/tree/ops.test.ts`
Expected: FAIL (`addSeveralOp` and the button do not exist).

- [ ] **Step 3: The op and the strings**

Add to `apps/web/src/features/tree/ops.ts` (import `MAX_BATCH_OPS` from `@ancestors-tree/shared/tree`):

```ts
/** "Add several people" sends one batch, so at most a batch's ops (spec §7.6: 500 rows). */
export const MAX_SEVERAL = MAX_BATCH_OPS;

/** People without relationships, in one batch: one undo step; they start in Loose photos. */
export function addSeveralOp(inputs: readonly NewPersonInput[]): Op {
  return {
    type: 'batch',
    payload: { ops: inputs.map((input) => ({ type: 'addPerson', payload: buildPerson(input) })) },
  };
}
```

Locales, a new `tree.several` block. vi.json:

```json
"several": {
  "open": "Thêm nhiều người",
  "title": "Thêm nhiều người",
  "hint": "Mỗi dòng một người. Họ sẽ vào mục Ảnh chưa dán, rồi bạn kéo từng người lên cây hoặc dùng “Đổi quan hệ…”.",
  "row": "Người thứ {{n}}",
  "none": "Nhập ít nhất một họ tên.",
  "full": "Mỗi lần thêm được tối đa 500 người."
}
```

en.json:

```json
"several": {
  "open": "Add several people",
  "title": "Add several people",
  "hint": "One person per row. They go to Loose photos; then drag each onto the tree or use “Change relationship…”.",
  "row": "Person {{n}}",
  "none": "Enter at least one full name.",
  "full": "You can add up to 500 people at a time."
}
```

- [ ] **Step 4: The dialog**

Create `apps/web/src/features/tree/AddSeveralDialog.tsx`:

```tsx
import type { Gender } from '@ancestors-tree/shared/tree';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogContent, TextField } from '../../shared/ui';
import { applyFailureMessage } from './format';
import { MAX_SEVERAL, type NewPersonInput } from './ops';
import type { ApplyResult } from './store';

interface Row {
  key: number;
  fullName: string;
  gender: Gender;
  isDeceased: boolean;
}

/** Matches FullNameSchema's limit, so a row is never refused by the server for its length. */
const MAX_NAME = 120;

function emptyRow(key: number): Row {
  return { key, fullName: '', gender: 'male', isDeceased: false };
}

/** A new empty row follows a filled last row, up to MAX_SEVERAL rows. */
function withSpare(rows: Row[], nextKey: () => number): Row[] {
  const last = rows.at(-1);
  if (last === undefined || (last.fullName.trim() !== '' && rows.length < MAX_SEVERAL)) {
    return [...rows, emptyRow(nextKey())];
  }
  return rows;
}

interface AddSeveralDialogProps {
  onSubmit: (inputs: NewPersonInput[]) => ApplyResult;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

/** "Add several people" (spec §7.6): names first, places on the tree later. */
export function AddSeveralDialog({ onSubmit, onClose, onCloseAutoFocus }: AddSeveralDialogProps) {
  const { t } = useTranslation();
  const counter = useRef(1);
  const nextKey = () => (counter.current += 1);
  const [rows, setRows] = useState<Row[]>([emptyRow(1)]);
  const [error, setError] = useState<string | null>(null);
  const firstName = useRef<HTMLInputElement>(null);

  const change = (key: number, patch: Partial<Row>) => {
    setRows((current) =>
      withSpare(
        current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
        nextKey,
      ),
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const inputs: NewPersonInput[] = rows
      .filter((row) => row.fullName.trim() !== '')
      .map((row) => ({ fullName: row.fullName, gender: row.gender, isDeceased: row.isDeceased }));
    if (inputs.length === 0) {
      setError(t('tree.several.none'));
      firstName.current?.focus();
      return;
    }
    const result = onSubmit(inputs);
    if (result.ok) onClose();
    else setError(applyFailureMessage(t, result.reason));
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={t('tree.several.title')}
        description={t('tree.several.hint')}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-1">
            {rows.map((row, at) => (
              <fieldset
                key={row.key}
                className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
              >
                <legend className="sr-only">{t('tree.several.row', { n: at + 1 })}</legend>
                <TextField
                  ref={at === 0 ? firstName : undefined}
                  label={t('tree.form.fullName')}
                  value={row.fullName}
                  maxLength={MAX_NAME}
                  autoComplete="off"
                  onChange={(event) => change(row.key, { fullName: event.target.value })}
                />
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                  {t('tree.form.gender')}
                  <select
                    value={row.gender}
                    onChange={(event) => change(row.key, { gender: event.target.value as Gender })}
                    className="h-10 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
                  >
                    <option value="male">{t('tree.form.male')}</option>
                    <option value="female">{t('tree.form.female')}</option>
                  </select>
                </label>
                <label className="flex h-10 items-center gap-2 text-base text-ink">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={row.isDeceased}
                    onChange={(event) => change(row.key, { isDeceased: event.target.checked })}
                  />
                  {t('tree.form.deceased')}
                </label>
              </fieldset>
            ))}
          </div>
          {rows.length >= MAX_SEVERAL ? (
            <p className="text-sm text-ink-muted">{t('tree.several.full')}</p>
          ) : null}
          {error !== null ? (
            <p role="alert" className="text-sm font-medium text-stamp">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('tree.form.cancel')}
            </Button>
            <Button type="submit">{t('tree.form.submit')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`TextField` spreads its props onto the `<input>`; React 19 passes `ref` as a prop, so `ref` reaches the input only if `TextField` forwards it. Read `TextField.tsx`: it destructures `...inputProps` and spreads them on the input, and in React 19 `ref` is a normal prop, so it arrives in `inputProps`. If TypeScript refuses `ref` on `TextFieldProps`, it already extends `ComponentProps<'input'>`, which includes `ref` in React 19.

- [ ] **Step 5: Open it from the toolbar and the tray**

`TreeDialogs.tsx`:
- `export type TreeDialog = { kind: 'first' | 'several' } | { kind: 'child' | 'spouse' | 'parent' | 'delete'; personId: string } | null;`
- In `changeDialog`, `personId: 'personId' in next ? next.personId : null`.
- `missing` reads `dialog !== null && 'personId' in dialog && tree.persons[dialog.personId] === undefined`.
- After the `'first'` branch:

```tsx
  if (dialog.kind === 'several') {
    return (
      <AddSeveralDialog
        onSubmit={(inputs) => apply(addSeveralOp(inputs))}
        onClose={close}
        onCloseAutoFocus={onCloseAutoFocus}
      />
    );
  }
```

`TreeToolbar.tsx`:

```tsx
import { UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui';
import { SaveStatus } from './SaveStatus';
import { UndoRedoButtons } from './UndoRedoButtons';

/**
 * The tree page's toolbar (spec §7.5): ↶ ↷ and "Add several people" for editors, then the save
 * status.
 */
export function TreeToolbar({
  canEdit,
  onAddSeveral,
}: {
  canEdit: boolean;
  onAddSeveral?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('tree.toolbar.label')}
      className="flex flex-wrap items-center gap-x-4 gap-y-2"
    >
      {canEdit ? <UndoRedoButtons /> : null}
      {canEdit && onAddSeveral ? (
        <Button variant="secondary" size="sm" onClick={onAddSeveral}>
          <UsersRound aria-hidden="true" strokeWidth={1.75} className="size-4" />
          {t('tree.several.open')}
        </Button>
      ) : null}
      <SaveStatus />
    </div>
  );
}
```

`UnlinkedTray.tsx`: take `{ onAddSeveral }: { onAddSeveral?: () => void }` and render, after the hint:

```tsx
      {onAddSeveral ? (
        <Button variant="secondary" size="sm" className="self-start" onClick={onAddSeveral}>
          <UsersRound aria-hidden="true" strokeWidth={1.75} className="size-4" />
          {t('tree.several.open')}
        </Button>
      ) : null}
```

`TreePage.tsx`: `const addSeveral = canEdit ? () => changeDialog({ kind: 'several' }) : undefined;`, then `<TreeToolbar canEdit={canEdit} onAddSeveral={addSeveral} />` and `<UnlinkedTray onAddSeveral={addSeveral} />`.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree`
Expected: PASS.

Mutation checks: let `withSpare` never add a row (test 1 fails at "Người thứ 2"); send empty rows too (test 1's batch has three ops); drop the `canEdit &&` in the toolbar (viewer test fails).

- [ ] **Step 7: Run the whole check, then commit**

Prettier on the changed files, then `pnpm check` (exit 0).

Commit message (`.superpowers/sdd/p6c-task-4-commit.txt`):

```
feat(web): add several people at once

One row per person; a new row appears when the last is filled and
empty rows are ignored. Saving sends one batch of addPerson (at most
500), so it is one undo step, and the people start in Loose photos.
Opened from the toolbar and from the tray (spec 7.6).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 5: The change runner, its question dialog and Undo toast, and Move earlier / later

Spec §7.6: every change from drag, "Change relationship…" and Cut is one op with a toast "Đã đổi: …" and "Undo"; follow-up questions with "Thôi, không đổi"; the rules run again on the latest tree just before applying, and "the tree has just changed" shows when the answer differs. "Move earlier" and "Move later" in the card menu are its first users.

**Files:**
- Create: `apps/web/src/features/tree/changes.ts`, `relateText.ts`, `RelateQuestionDialog.tsx`, `ChangeRunner.tsx`
- Modify: `apps/web/src/features/tree/usePersonActions.ts`, `TreePage.tsx`, `fixtures.ts`, locales
- Test: `changes.test.ts`, `relateText.test.ts`, `RelateQuestionDialog.test.tsx`, `MoveSibling.test.tsx` (new), `usePersonActions.test.ts`

**Interfaces:**
- Consumes: `relate`, `ALONE`, `cutMarriage`, `cutThreadOp`, `detach`, `removeParentOp`, `unionStatusOp`, `RelateAnswers`, `RelateBlock`, `RelateEffect`, `RelateQuestion` (Tasks 1–2); `useTreeStore().apply/undo`, `applyFailureMessage`, `ruleKey`, `personCardButton`.
- Produces:
  - `changes.ts`:
    - `type Change = { kind: 'relate'; personId: string; targetId: string; relation: Relation } | { kind: 'removeParent'; childId: string; parentId: string } | { kind: 'cutThread'; childId: string } | { kind: 'cutMarriage'; unionId: string } | { kind: 'status'; unionId: string; status: UnionStatus } | { kind: 'detach'; personId: string }`
    - `type ChangeQuestion = RelateQuestion | { kind: 'keepChildren'; partnerIds: [string, string] }`
    - `interface ChangeAnswers extends RelateAnswers { keepWith?: string }`
    - `type ChangeSummary = { kind: 'relate'; effect: RelateEffect } | { kind: 'cutThread'; childId: string; parentIds: string[] } | { kind: 'removeParent'; childId: string; parentId: string } | { kind: 'cutMarriage'; partnerIds: string[] } | { kind: 'status'; partnerIds: string[]; status: UnionStatus } | { kind: 'detach'; personId: string }`
    - `type ChangeResult = { kind: 'ok'; op: BatchOp; summary: ChangeSummary } | { kind: 'ask'; question: ChangeQuestion } | { kind: 'blocked'; reason: RelateBlock }`
    - `planChange(tree, change, answers?): ChangeResult`, `sameOutcome(a, b): boolean`, `decide(latest, seen, change, answers?): ChangeResult | { kind: 'outOfDate' }`
  - `relateText.ts`: `changeSentence(t, tree, summary): string`, `blockMessage(t, reason): string`, `questionText(t, tree, change, question): QuestionText`, `interface QuestionText { title: string; description?: string; answers: { label: string; answers: ChangeAnswers }[] }`
  - `RelateQuestionDialog(props: QuestionText & { onAnswer: (answers: ChangeAnswers) => void; onCancel: () => void })`
  - `ChangeRunner.tsx`: `interface ChangeRequest { change: Change; focusPersonId?: string; focusFallback?: () => HTMLElement | null; seenTree?: TreeState }`, `type RequestChange = (request: ChangeRequest) => void`, `ChangeContext` (React context, `RequestChange | null`), `useChangeRunner(): { requestChange: RequestChange; element: ReactNode }`
  - `usePersonActions.ts`: `PersonActionId` gains `'moveEarlier' | 'moveLater'`; `siblingNeighbour(tree, index, personId, side: 'earlier' | 'later'): string | null`
  - `fixtures.ts`: `SISTER = '64b7f0c2a1b2c3d4e5f6a006'`, `SIBLINGS: TreeResponse` (FAMILY plus Nam's younger sister Lan).

Order of the actions (spec §7.6): Add child · Add spouse · Add parent · Change relationship… (Task 6) · Move earlier · Move later · Choose as progenitor · Delete.

- [ ] **Step 1: Write the failing pure tests**

Add to `fixtures.ts`:

```ts
export const SISTER = '64b7f0c2a1b2c3d4e5f6a006';

/** FAMILY with Nam's younger sister Lan (neither is numbered: Lan's id sorts after Nam's). */
export const SIBLINGS: TreeResponse = {
  ...FAMILY,
  persons: [
    ...FAMILY.persons,
    fixturePerson(SISTER, 'Nguyễn Thị Lan', { gender: 'female', parentUnionId: PARENTS_UNION }),
  ],
};
```

(If `TreeEditing.test.tsx` already declares its own `SISTER` with the same id, import it from `./fixtures` there instead.)

Create `apps/web/src/features/tree/changes.test.ts`:

```ts
import { applyOp, treeStateFromLists, type TreeState } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { decide, planChange, sameOutcome } from './changes';
import {
  FAMILY,
  fixturePerson,
  GRANDMA,
  GRANDPA,
  LOOSE,
  PARENTS_UNION,
  SIBLINGS,
  SISTER,
  SON,
} from './fixtures';

function stateOf(response: typeof FAMILY): TreeState {
  return treeStateFromLists(response.progenitorId, response.persons, response.unions);
}

describe('planChange', () => {
  it('describes a relate change by its effect', () => {
    const result = planChange(stateOf(SIBLINGS), {
      kind: 'relate',
      personId: SISTER,
      targetId: SON,
      relation: 'before',
    });
    expect(result).toMatchObject({
      kind: 'ok',
      summary: { kind: 'relate', effect: { relation: 'before', personId: SISTER, targetId: SON } },
    });
  });

  it('cuts a thread, and says when there is none', () => {
    const tree = stateOf(FAMILY);
    expect(planChange(tree, { kind: 'cutThread', childId: SON })).toMatchObject({
      kind: 'ok',
      summary: { kind: 'cutThread', childId: SON, parentIds: [GRANDPA, GRANDMA] },
    });
    expect(planChange(tree, { kind: 'cutThread', childId: LOOSE })).toEqual({
      kind: 'blocked',
      reason: 'ALREADY',
    });
  });

  it('asks who keeps the children when a marriage is cut', () => {
    const tree = stateOf(FAMILY);
    const change = { kind: 'cutMarriage', unionId: PARENTS_UNION } as const;
    expect(planChange(tree, change)).toEqual({
      kind: 'ask',
      question: { kind: 'keepChildren', partnerIds: [GRANDPA, GRANDMA] },
    });
    expect(planChange(tree, change, { keepWith: GRANDMA })).toMatchObject({
      kind: 'ok',
      summary: { kind: 'cutMarriage', partnerIds: [GRANDPA, GRANDMA] },
    });
  });

  it('changes a marriage’s status, but not to the same one', () => {
    const tree = stateOf(FAMILY);
    expect(
      planChange(tree, { kind: 'status', unionId: PARENTS_UNION, status: 'widowed' }),
    ).toMatchObject({ kind: 'ok', summary: { kind: 'status', status: 'widowed' } });
    expect(
      planChange(tree, { kind: 'status', unionId: PARENTS_UNION, status: 'married' }),
    ).toEqual({ kind: 'blocked', reason: 'ALREADY' });
  });

  it('removes one parent, and refuses someone who is not a parent', () => {
    const tree = stateOf(FAMILY);
    expect(
      planChange(tree, { kind: 'removeParent', childId: SON, parentId: GRANDMA }),
    ).toMatchObject({ kind: 'ok', summary: { kind: 'removeParent', childId: SON } });
    expect(planChange(tree, { kind: 'removeParent', childId: SON, parentId: LOOSE })).toEqual({
      kind: 'blocked',
      reason: 'ALREADY',
    });
  });
});

describe('decide (the tree changed meanwhile)', () => {
  const change = { kind: 'relate', personId: LOOSE, targetId: GRANDPA, relation: 'child' } as const;

  it('applies on the latest tree when the outcome is the same', () => {
    const seen = stateOf(FAMILY);
    const latest = applyOp(seen, {
      type: 'updatePerson',
      payload: { id: GRANDMA, changes: { fullName: 'Lê Thị Huệ' } },
    }).tree;
    expect(decide(latest, seen, change).kind).toBe('ok');
  });

  it('says out of date when the outcome is no longer the same', () => {
    const seen = stateOf(FAMILY);
    // Grandpa married again on another device: "child of Grandpa" now asks "with whom?".
    const SECOND_WIFE = '64b7f0c2a1b2c3d4e5f6a0ff';
    const latest = applyOp(seen, {
      type: 'batch',
      payload: {
        ops: [
          { type: 'addPerson', payload: fixturePerson(SECOND_WIFE, 'Đỗ Thị Sen', { gender: 'female' }) },
          {
            type: 'addUnion',
            payload: { id: '64b7f0c2a1b2c3d4e5f6b0ff', partnerIds: [GRANDPA, SECOND_WIFE], order: 2, status: 'married' },
          },
        ],
      },
    }).tree;
    expect(planChange(latest, change).kind).toBe('ask');
    expect(decide(latest, seen, change)).toEqual({ kind: 'outOfDate' });
    // Nothing changed: the same answer twice.
    expect(sameOutcome(planChange(seen, change), planChange(seen, change))).toBe(true);
  });
});
```

Create `apps/web/src/features/tree/relateText.test.ts`:

```ts
import { treeStateFromLists } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import i18n from '../../shared/i18n';
import { FAMILY, GRANDMA, GRANDPA, LOOSE, PARENTS_UNION, SON } from './fixtures';
import { blockMessage, changeSentence, questionText } from './relateText';

// The tests run in Vietnamese, as format.test.ts does.
const t = i18n.t;
const tree = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);

describe('relate sentences', () => {
  it('says what a change does, with the names', () => {
    expect(
      changeSentence(t, tree, {
        kind: 'relate',
        effect: { relation: 'child', personId: LOOSE, targetId: GRANDPA, withId: GRANDMA },
      }),
    ).toBe('Trần Văn Bình thành con của Nguyễn Văn Tư và Lê Thị Hoa');
    expect(
      changeSentence(t, tree, { kind: 'cutThread', childId: SON, parentIds: [GRANDPA, GRANDMA] }),
    ).toBe('Nguyễn Văn Nam không còn là con của Nguyễn Văn Tư và Lê Thị Hoa');
    expect(changeSentence(t, tree, { kind: 'detach', personId: SON })).toBe(
      'Nguyễn Văn Nam chuyển vào Ảnh chưa dán',
    );
  });

  it('says why a change is blocked, for relate and server rules alike', () => {
    expect(blockMessage(t, 'ALREADY')).toBe('Quan hệ này đã có rồi.');
    expect(blockMessage(t, 'CYCLE')).toBe(
      'Thay đổi này sẽ khiến một người thành tổ tiên của chính mình.',
    );
  });

  it('words a question and its answers', () => {
    const text = questionText(
      t,
      tree,
      { kind: 'cutMarriage', unionId: PARENTS_UNION },
      { kind: 'keepChildren', partnerIds: [GRANDPA, GRANDMA] },
    );
    expect(text.title).toBe('Các con ở với ai?');
    expect(text.answers).toEqual([
      { label: 'Ở với Nguyễn Văn Tư', answers: { keepWith: GRANDPA } },
      { label: 'Ở với Lê Thị Hoa', answers: { keepWith: GRANDMA } },
    ]);
  });
});
```

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree/changes.test.ts src/features/tree/relateText.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: Write `changes.ts`**

```ts
import {
  applyOp,
  cutMarriage,
  cutThreadOp,
  detach,
  OpError,
  relate,
  removeParentOp,
  unionStatusOp,
  type BatchOp,
  type Relation,
  type RelateAnswers,
  type RelateBlock,
  type RelateEffect,
  type RelateQuestion,
  type TreeState,
  type UnionStatus,
} from '@ancestors-tree/shared/tree';

/** Every relationship change the editors make (spec §7.6), from any way in. */
export type Change =
  | { kind: 'relate'; personId: string; targetId: string; relation: Relation }
  | { kind: 'removeParent'; childId: string; parentId: string }
  | { kind: 'cutThread'; childId: string }
  | { kind: 'cutMarriage'; unionId: string }
  | { kind: 'status'; unionId: string; status: UnionStatus }
  | { kind: 'detach'; personId: string };

export type ChangeQuestion =
  | RelateQuestion
  | { kind: 'keepChildren'; partnerIds: [string, string] };

export interface ChangeAnswers extends RelateAnswers {
  /** keepChildren: the partner the children stay with. */
  keepWith?: string;
}

/** What a change did, for its sentence ("Đã đổi: …"). */
export type ChangeSummary =
  | { kind: 'relate'; effect: RelateEffect }
  | { kind: 'cutThread'; childId: string; parentIds: string[] }
  | { kind: 'removeParent'; childId: string; parentId: string }
  | { kind: 'cutMarriage'; partnerIds: string[] }
  | { kind: 'status'; partnerIds: string[]; status: UnionStatus }
  | { kind: 'detach'; personId: string };

export type ChangeResult =
  | { kind: 'ok'; op: BatchOp; summary: ChangeSummary }
  | { kind: 'ask'; question: ChangeQuestion }
  | { kind: 'blocked'; reason: RelateBlock };

function blocked(reason: RelateBlock): ChangeResult {
  return { kind: 'blocked', reason };
}

/** The op as the server would take it: an OpError becomes a block with its code. */
function checked(tree: TreeState, build: () => BatchOp | null, summary: ChangeSummary): ChangeResult {
  try {
    const op = build();
    if (op === null) return blocked('ALREADY');
    applyOp(tree, op);
    return { kind: 'ok', op, summary };
  } catch (error) {
    if (error instanceof OpError) return blocked(error.code);
    throw error;
  }
}

export function planChange(
  tree: TreeState,
  change: Change,
  answers: ChangeAnswers = {},
): ChangeResult {
  switch (change.kind) {
    case 'relate': {
      const result = relate(tree, change.personId, change.targetId, change.relation, answers);
      return result.kind === 'ok'
        ? { kind: 'ok', op: result.op, summary: { kind: 'relate', effect: result.effect } }
        : result;
    }
    case 'removeParent':
      return checked(tree, () => removeParentOp(tree, change.childId, change.parentId), {
        kind: 'removeParent',
        childId: change.childId,
        parentId: change.parentId,
      });
    case 'cutThread': {
      const person = tree.persons[change.childId];
      if (person === undefined) return blocked('PERSON_NOT_FOUND');
      const unionId = person.parentUnionId;
      if (unionId === undefined) return blocked('ALREADY');
      const parentIds = [...(tree.unions[unionId]?.partnerIds ?? [])];
      return checked(tree, () => cutThreadOp(change.childId), {
        kind: 'cutThread',
        childId: change.childId,
        parentIds,
      });
    }
    case 'cutMarriage': {
      const union = tree.unions[change.unionId];
      const result = cutMarriage(tree, change.unionId, answers.keepWith);
      if (result.kind !== 'ok' || union === undefined) return result;
      return {
        kind: 'ok',
        op: result.op,
        summary: { kind: 'cutMarriage', partnerIds: [...union.partnerIds] },
      };
    }
    case 'status': {
      const union = tree.unions[change.unionId];
      if (union === undefined) return blocked('UNION_NOT_FOUND');
      if (union.status === change.status) return blocked('ALREADY');
      return checked(tree, () => unionStatusOp(change.unionId, change.status), {
        kind: 'status',
        partnerIds: [...union.partnerIds],
        status: change.status,
      });
    }
    case 'detach': {
      const result = detach(tree, change.personId);
      return result.kind === 'ok'
        ? { kind: 'ok', op: result.op, summary: { kind: 'detach', personId: change.personId } }
        : result;
    }
  }
}

/** The same outcome: what it does, asks or blocks for (new ids aside). */
export function sameOutcome(a: ChangeResult, b: ChangeResult): boolean {
  if (a.kind === 'ok' && b.kind === 'ok') {
    return JSON.stringify(a.summary) === JSON.stringify(b.summary);
  }
  if (a.kind === 'ask' && b.kind === 'ask') {
    return JSON.stringify(a.question) === JSON.stringify(b.question);
  }
  return a.kind === 'blocked' && b.kind === 'blocked' && a.reason === b.reason;
}

/**
 * The change on the latest tree. When the tree changed since the user saw the answer (while
 * dragging, or while a question was open) and the answer is not the same, nothing is applied:
 * the "tree has just changed" message shows instead (spec §7.6 "After a drop").
 */
export function decide(
  latest: TreeState,
  seen: TreeState,
  change: Change,
  answers: ChangeAnswers = {},
): ChangeResult | { kind: 'outOfDate' } {
  const result = planChange(latest, change, answers);
  if (latest === seen) return result;
  return sameOutcome(planChange(seen, change, answers), result) ? result : { kind: 'outOfDate' };
}
```

- [ ] **Step 3: Write `relateText.ts` and the strings**

Locales, a new `tree.relate` block. vi.json:

```json
"relate": {
  "someone": "(người đã bị xoá)",
  "and": "{{a}} và {{b}}",
  "toast": "Đã đổi: {{change}}",
  "failed": "Không đổi được: {{reason}}",
  "undoThis": "Hoàn tác thay đổi này",
  "dismiss": "Đóng thông báo",
  "done": {
    "parent": "{{a}} thành cha/mẹ của {{b}}",
    "spouse": "{{a}} và {{b}} thành vợ chồng",
    "child": "{{a}} thành con của {{b}}",
    "childWith": "{{a}} thành con của {{b}} và {{with}}",
    "before": "{{a}} xếp trước {{b}}",
    "after": "{{a}} xếp sau {{b}}",
    "notChildOf": "{{a}} không còn là con của {{parents}}",
    "cutMarriage": "{{a}} và {{b}} không còn là vợ chồng",
    "cutAlone": "Các con không còn là con của {{a}}",
    "status": "Hôn nhân của {{a}} và {{b}}: {{status}}",
    "detach": "{{a}} chuyển vào Ảnh chưa dán"
  },
  "status": {
    "married": "Vợ chồng",
    "divorced": "Đã ly hôn",
    "widowed": "Goá"
  },
  "blocked": {
    "SAME_PERSON": "Không thể nối một người với chính họ.",
    "ALREADY": "Quan hệ này đã có rồi.",
    "IN_LAW_PARENT": "Cha mẹ của dâu, rể được ghi ở mục Gia đình gốc trong hồ sơ của họ.",
    "NOT_SIBLINGS": "Chỉ xếp được thứ tự giữa anh chị em cùng cha mẹ.",
    "TOO_MANY_SIBLINGS": "Nhóm anh chị em này có hơn 99 người nên không đánh số lại được.",
    "IS_PROGENITOR": "Không thể chuyển thuỷ tổ vào Ảnh chưa dán. Hãy chọn thuỷ tổ khác trước."
  },
  "ask": {
    "cancel": "Thôi, không đổi",
    "withWhom": "{{a}} là con của {{b}} với ai?",
    "withPartner": "Con của {{b}} và {{partner}}",
    "onlyOf": "Chỉ con của {{b}}",
    "replaceParent": "{{b}} đã có đủ cha và mẹ. {{a}} thay cho ai?",
    "replaces": "Thay {{name}}",
    "sharedChildren": "{{names}} có phải là con chung của {{a}} và {{b}} không?",
    "shared": "Có, là con chung",
    "notShared": "Không phải con chung",
    "keepChildren": "Các con ở với ai?",
    "keepWith": "Ở với {{name}}"
  }
}
```

en.json:

```json
"relate": {
  "someone": "(a deleted person)",
  "and": "{{a}} and {{b}}",
  "toast": "Changed: {{change}}",
  "failed": "Could not change it: {{reason}}",
  "undoThis": "Undo this change",
  "dismiss": "Dismiss",
  "done": {
    "parent": "{{a}} becomes a parent of {{b}}",
    "spouse": "{{a}} and {{b}} become spouses",
    "child": "{{a}} becomes the child of {{b}}",
    "childWith": "{{a}} becomes the child of {{b}} and {{with}}",
    "before": "{{a}} goes before {{b}}",
    "after": "{{a}} goes after {{b}}",
    "notChildOf": "{{a}} is no longer the child of {{parents}}",
    "cutMarriage": "{{a}} and {{b}} are no longer spouses",
    "cutAlone": "The children no longer have {{a}} as a parent",
    "status": "Marriage of {{a}} and {{b}}: {{status}}",
    "detach": "{{a}} moves to Loose photos"
  },
  "status": {
    "married": "Married",
    "divorced": "Divorced",
    "widowed": "Widowed"
  },
  "blocked": {
    "SAME_PERSON": "A person cannot be linked to themselves.",
    "ALREADY": "This relationship is already there.",
    "IN_LAW_PARENT": "The parents of someone who married in go under Birth family in their profile.",
    "NOT_SIBLINGS": "Only siblings with the same parents can be put in order.",
    "TOO_MANY_SIBLINGS": "This group has more than 99 siblings, so it cannot be renumbered.",
    "IS_PROGENITOR": "The progenitor cannot move to Loose photos. Choose another progenitor first."
  },
  "ask": {
    "cancel": "Cancel, change nothing",
    "withWhom": "{{a}} is the child of {{b}} with whom?",
    "withPartner": "Child of {{b}} and {{partner}}",
    "onlyOf": "Only the child of {{b}}",
    "replaceParent": "{{b}} already has two parents. Who does {{a}} replace?",
    "replaces": "Replace {{name}}",
    "sharedChildren": "Are {{names}} the children of both {{a}} and {{b}}?",
    "shared": "Yes, they are both theirs",
    "notShared": "No",
    "keepChildren": "Who do the children stay with?",
    "keepWith": "With {{name}}"
  }
}
```

Also add to `tree.actions` (vi / en): `"moveEarlier": "Xếp lên trước"` / `"Move earlier"`, `"moveLater": "Xếp ra sau"` / `"Move later"`.

Create `apps/web/src/features/tree/relateText.ts`:

```ts
import { ALONE, type RelateBlock, type TreeState } from '@ancestors-tree/shared/tree';
import type { TFunction } from 'i18next';
import type { Change, ChangeAnswers, ChangeQuestion, ChangeSummary } from './changes';
import { ruleKey } from './format';

export interface QuestionText {
  title: string;
  description?: string;
  answers: { label: string; answers: ChangeAnswers }[];
}

const RELATE_BLOCKS = [
  'SAME_PERSON',
  'ALREADY',
  'IN_LAW_PARENT',
  'NOT_SIBLINGS',
  'TOO_MANY_SIBLINGS',
  'IS_PROGENITOR',
] as const;
type RelateOnlyBlock = (typeof RELATE_BLOCKS)[number];

function isRelateOnly(reason: RelateBlock): reason is RelateOnlyBlock {
  return (RELATE_BLOCKS as readonly string[]).includes(reason);
}

function nameOf(t: TFunction, tree: TreeState, id: string): string {
  return tree.persons[id]?.fullName ?? t('tree.relate.someone');
}

/** "A and B", or one name. */
function names(t: TFunction, tree: TreeState, ids: readonly string[]): string {
  const [first, second] = ids.map((id) => nameOf(t, tree, id));
  return second === undefined ? (first ?? '') : t('tree.relate.and', { a: first, b: second });
}

/** Why a change cannot be made, and what to do instead. */
export function blockMessage(t: TFunction, reason: RelateBlock): string {
  return isRelateOnly(reason) ? t(`tree.relate.blocked.${reason}`) : t(ruleKey(reason));
}

/** What a change does, in a sentence ("Lan thành con của Nam và Hoa"). */
export function changeSentence(t: TFunction, tree: TreeState, summary: ChangeSummary): string {
  const name = (id: string) => nameOf(t, tree, id);
  switch (summary.kind) {
    case 'relate': {
      const { relation, personId, targetId, withId } = summary.effect;
      const a = name(personId);
      const b = name(targetId);
      if (relation === 'child' && withId !== null) {
        return t('tree.relate.done.childWith', { a, b, with: name(withId) });
      }
      return t(`tree.relate.done.${relation}`, { a, b });
    }
    case 'cutThread':
      return t('tree.relate.done.notChildOf', {
        a: name(summary.childId),
        parents: names(t, tree, summary.parentIds),
      });
    case 'removeParent':
      return t('tree.relate.done.notChildOf', {
        a: name(summary.childId),
        parents: name(summary.parentId),
      });
    case 'cutMarriage': {
      const [a, b] = summary.partnerIds;
      return b === undefined
        ? t('tree.relate.done.cutAlone', { a: name(a ?? '') })
        : t('tree.relate.done.cutMarriage', { a: name(a ?? ''), b: name(b) });
    }
    case 'status': {
      const [a, b] = summary.partnerIds;
      return t('tree.relate.done.status', {
        a: name(a ?? ''),
        b: b === undefined ? '' : name(b),
        status: t(`tree.relate.status.${summary.status}`),
      });
    }
    case 'detach':
      return t('tree.relate.done.detach', { a: name(summary.personId) });
  }
}

/** A follow-up question and its answers; "Thôi, không đổi" is the dialog's own. */
export function questionText(
  t: TFunction,
  tree: TreeState,
  change: Change,
  question: ChangeQuestion,
): QuestionText {
  const name = (id: string) => nameOf(t, tree, id);
  const a = change.kind === 'relate' ? name(change.personId) : '';
  const b = change.kind === 'relate' ? name(change.targetId) : '';
  switch (question.kind) {
    case 'withWhom':
      return {
        title: t('tree.relate.ask.withWhom', { a, b }),
        answers: [
          ...question.unions.map(({ unionId, partnerId }) => ({
            label:
              partnerId === null
                ? t('tree.relate.ask.onlyOf', { b })
                : t('tree.relate.ask.withPartner', { b, partner: name(partnerId) }),
            answers: { union: unionId },
          })),
          ...(question.alone
            ? [{ label: t('tree.relate.ask.onlyOf', { b }), answers: { union: ALONE } }]
            : []),
        ],
      };
    case 'replaceParent':
      return {
        title: t('tree.relate.ask.replaceParent', { a, b }),
        answers: question.parentIds.map((id) => ({
          label: t('tree.relate.ask.replaces', { name: name(id) }),
          answers: { replaces: id },
        })),
      };
    case 'sharedChildren':
      return {
        title: t('tree.relate.ask.sharedChildren', {
          a,
          b,
          names: question.childIds.map(name).join(', '),
        }),
        answers: [
          { label: t('tree.relate.ask.shared'), answers: { shareChildren: true } },
          { label: t('tree.relate.ask.notShared'), answers: { shareChildren: false } },
        ],
      };
    case 'keepChildren':
      return {
        title: t('tree.relate.ask.keepChildren'),
        answers: question.partnerIds.map((id) => ({
          label: t('tree.relate.ask.keepWith', { name: name(id) }),
          answers: { keepWith: id },
        })),
      };
  }
}
```

Run the two pure test files: PASS.

- [ ] **Step 4: The question dialog**

Create `apps/web/src/features/tree/RelateQuestionDialog.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogContent } from '../../shared/ui';
import type { ChangeAnswers } from './changes';
import type { QuestionText } from './relateText';

interface RelateQuestionDialogProps extends QuestionText {
  onAnswer: (answers: ChangeAnswers) => void;
  onCancel: () => void;
}

/**
 * A follow-up question instead of a dead end (spec §7.6). Focus is the runner's to place when it
 * closes (the card, or what opened it), so Radix's own return is turned off.
 */
export function RelateQuestionDialog({
  title,
  description,
  answers,
  onAnswer,
  onCancel,
}: RelateQuestionDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent
        title={title}
        description={description}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-2">
          {answers.map((answer) => (
            <Button
              key={answer.label}
              variant="secondary"
              className="justify-start"
              onClick={() => onAnswer(answer.answers)}
            >
              {answer.label}
            </Button>
          ))}
          <Button variant="ghost" className="justify-start" onClick={onCancel}>
            {t('tree.relate.ask.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Create `apps/web/src/features/tree/RelateQuestionDialog.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { RelateQuestionDialog } from './RelateQuestionDialog';

describe('RelateQuestionDialog', () => {
  it('answers with the chosen option, or cancels', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <RelateQuestionDialog
        title="Các con ở với ai?"
        answers={[
          { label: 'Ở với Nguyễn Văn Tư', answers: { keepWith: 'a' } },
          { label: 'Ở với Lê Thị Hoa', answers: { keepWith: 'b' } },
        ]}
        onAnswer={onAnswer}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Các con ở với ai?' });
    await user.click(within(dialog).getByRole('button', { name: 'Ở với Lê Thị Hoa' }));
    expect(onAnswer).toHaveBeenCalledWith({ keepWith: 'b' });
    await user.click(within(dialog).getByRole('button', { name: 'Thôi, không đổi' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
```

(Read `apps/web/src/test/render.tsx` for the exact name and signature of the provider wrapper.)

- [ ] **Step 5: The runner and its toast**

Create `apps/web/src/features/tree/ChangeRunner.tsx`:

```tsx
import type { Op, TreeState } from '@ancestors-tree/shared/tree';
import { X } from 'lucide-react';
import { createContext, useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui';
import { decide, type Change, type ChangeAnswers, type ChangeQuestion } from './changes';
import { applyFailureMessage } from './format';
import { personCardButton } from './profileParams';
import { RelateQuestionDialog } from './RelateQuestionDialog';
import { blockMessage, changeSentence, questionText } from './relateText';
import { useTreeStore } from './store';

export interface ChangeRequest {
  change: Change;
  /** Focus goes to this person's card afterwards (a drop: card A, spec §7.6). */
  focusPersonId?: string;
  /**
   * Else back to what had focus; when that is gone (a removed row), here (a dialog's own
   * content); else the main content.
   */
  focusFallback?: () => HTMLElement | null;
  /** The tree the user saw the answer on (a drag's hover); defaults to the latest. */
  seenTree?: TreeState;
}

export type RequestChange = (request: ChangeRequest) => void;

/** Null for viewers. Stable, so the cards do not re-render with the page. */
export const ChangeContext = createContext<RequestChange | null>(null);

type Toast =
  | { kind: 'done'; text: string; op: Op; request: ChangeRequest }
  | { kind: 'error'; text: string };

interface Asking {
  request: ChangeRequest;
  question: ChangeQuestion;
  answers: ChangeAnswers;
  /** The tree the question was asked on. */
  seen: TreeState;
}

/**
 * Runs a relationship change (spec §7.6): asks the follow-up questions, checks the answer again on
 * the latest tree, applies one op, and confirms it in a toast with Undo.
 */
export function useChangeRunner(): { requestChange: RequestChange; element: ReactNode } {
  const { t } = useTranslation();
  const [asking, setAsking] = useState<Asking | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const focusAfter = useCallback((request: ChangeRequest) => {
    // After React has drawn the change: the card may have moved, or into the tray.
    requestAnimationFrame(() => {
      const from = opener.current;
      const target =
        (request.focusPersonId === undefined ? null : personCardButton(request.focusPersonId)) ??
        (from?.isConnected ? from : null) ??
        request.focusFallback?.() ??
        document.querySelector<HTMLElement>('main');
      target?.focus();
    });
  }, []);

  const run = useCallback(
    (request: ChangeRequest, answers: ChangeAnswers, seen: TreeState) => {
      const store = useTreeStore.getState();
      const before = store.tree;
      const decision = decide(before, seen, request.change, answers);
      if (decision.kind === 'ask') {
        setAsking({ request, question: decision.question, answers, seen: before });
        return;
      }
      setAsking(null);
      if (decision.kind === 'outOfDate') {
        setToast({ kind: 'error', text: t('tree.outOfDate') });
      } else if (decision.kind === 'blocked') {
        setToast({
          kind: 'error',
          text: t('tree.relate.failed', { reason: blockMessage(t, decision.reason) }),
        });
      } else {
        const applied = store.apply(decision.op);
        setToast(
          applied.ok
            ? {
                kind: 'done',
                text: t('tree.relate.toast', {
                  change: changeSentence(t, before, decision.summary),
                }),
                op: decision.op,
                request,
              }
            : {
                kind: 'error',
                text: t('tree.relate.failed', { reason: applyFailureMessage(t, applied.reason) }),
              },
        );
      }
      focusAfter(request);
    },
    [focusAfter, t],
  );

  const requestChange = useCallback<RequestChange>(
    (request) => {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement ? active : null;
      setToast(null);
      run(request, {}, request.seenTree ?? useTreeStore.getState().tree);
    },
    [run],
  );

  const undo = () => {
    if (toast?.kind !== 'done') return;
    const result = useTreeStore.getState().undo();
    setToast(
      result !== null && !result.ok
        ? {
            kind: 'error',
            text: t('tree.undo.failed', { reason: applyFailureMessage(t, result.reason) }),
          }
        : null,
    );
    focusAfter(toast.request);
  };

  const question =
    asking === null ? null : questionText(t, asking.seen, asking.request.change, asking.question);
  const element = (
    <>
      {asking !== null && question !== null ? (
        <RelateQuestionDialog
          {...question}
          onAnswer={(answer) => run(asking.request, { ...asking.answers, ...answer }, asking.seen)}
          onCancel={() => {
            setAsking(null);
            focusAfter(asking.request);
          }}
        />
      ) : null}
      <ChangeToast toast={toast} onUndo={undo} onDismiss={() => setToast(null)} />
    </>
  );
  return { requestChange, element };
}

function ChangeToast({
  toast,
  onUndo,
  onDismiss,
}: {
  toast: Toast | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const op = toast?.kind === 'done' ? toast.op : null;
  // The toast's Undo undoes this change only while it is the latest one (spec §7.6 "Undo"); a
  // boolean, so the selector is stable.
  const canUndo = useTreeStore((state) => op !== null && state.undoStack.at(-1)?.op === op);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div
        className={
          toast === null
            ? 'sr-only'
            : 'pointer-events-auto flex max-w-xl items-center gap-3 rounded-control border border-line-strong bg-surface px-4 py-2'
        }
      >
        {/* Always in the accessibility tree, so each new message is announced. */}
        <p role="status" className="text-sm text-ink empty:sr-only">
          {toast?.kind === 'done' ? toast.text : ''}
        </p>
        <p role="alert" className="text-sm font-medium text-stamp empty:sr-only">
          {toast?.kind === 'error' ? toast.text : ''}
        </p>
        {canUndo ? (
          <Button variant="secondary" size="sm" aria-label={t('tree.relate.undoThis')} onClick={onUndo}>
            {t('tree.undo.label')}
          </Button>
        ) : null}
        {toast !== null ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('tree.relate.dismiss')}
            title={t('tree.relate.dismiss')}
            onClick={onDismiss}
          >
            <X aria-hidden="true" strokeWidth={1.75} className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Move earlier / later**

`usePersonActions.ts`:

```ts
import { ArrowLeft, ArrowRight, /* existing icons */ } from 'lucide-react';
import type { TreeIndex } from '@ancestors-tree/shared/tree';

export type PersonActionId =
  | 'addChild'
  | 'addSpouse'
  | 'addParent'
  | 'moveEarlier'
  | 'moveLater'
  | 'setProgenitor'
  | 'delete';

/** The sibling just before or after the person, as the chart orders them; null when none. */
export function siblingNeighbour(
  tree: TreeState,
  index: TreeIndex,
  personId: string,
  side: 'earlier' | 'later',
): string | null {
  const unionId = tree.persons[personId]?.parentUnionId;
  if (unionId === undefined) return null;
  const ids = index.childrenOf(unionId).map((child) => child.id);
  const at = ids.indexOf(personId);
  if (at === -1) return null;
  return ids[side === 'earlier' ? at - 1 : at + 1] ?? null;
}
```

In `availableActions`, after the `addParent` push:

```ts
  if (siblingNeighbour(tree, index, personId, 'earlier') !== null) actions.push('moveEarlier');
  if (siblingNeighbour(tree, index, personId, 'later') !== null) actions.push('moveLater');
```

`ACTION_ICONS` gains `moveEarlier: ArrowLeft, moveLater: ArrowRight`.

Add to `usePersonActions.test.ts` (build the tree from `SIBLINGS` the way the file builds `FAMILY`):

```ts
  it('offers moving among siblings only towards a sibling', () => {
    const tree = treeStateFromLists(SIBLINGS.progenitorId, SIBLINGS.persons, SIBLINGS.unions);
    expect(availableActions(tree, SON, true)).toContain('moveLater');
    expect(availableActions(tree, SON, true)).not.toContain('moveEarlier');
    expect(availableActions(tree, SISTER, true)).toContain('moveEarlier');
    expect(availableActions(tree, SISTER, true)).not.toContain('moveLater');
  });
```

`TreePage.tsx`: call `const runner = useChangeRunner();` near the top. In `actions`' `run` switch add:

```ts
          case 'moveEarlier':
          case 'moveLater': {
            const tree = useTreeStore.getState().tree;
            const side = action === 'moveEarlier' ? 'earlier' : 'later';
            const targetId = siblingNeighbour(tree, buildTreeIndex(tree), id, side);
            if (targetId !== null) {
              runner.requestChange({
                change: {
                  kind: 'relate',
                  personId: id,
                  targetId,
                  relation: side === 'earlier' ? 'before' : 'after',
                },
                focusPersonId: id,
              });
            }
            return;
          }
```

Add `runner.requestChange` to the `useMemo` dependencies (it is stable). Wrap the page's providers in `<ChangeContext value={canEdit ? runner.requestChange : null}>` and render `{canEdit ? runner.element : null}` after `TreeDialogs`.

- [ ] **Step 7: The page test**

Create `apps/web/src/features/tree/MoveSibling.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN_ID, ME, SIBLINGS, SISTER, SON } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { batchOps, card, cardName, EDITOR, editableTree } from './testKit';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

describe('Move earlier / later', () => {
  it('moves a sibling earlier in one op, confirms it, and undoes it from the toast', async () => {
    const user = userEvent.setup();
    const sent = editableTree(SIBLINGS, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await user.click(await screen.findByRole('button', { name: cardName('Nguyễn Thị Lan') }));
    const profile = screen.getByRole('complementary', { name: 'Nguyễn Thị Lan' });
    expect(within(profile).queryByRole('button', { name: 'Xếp ra sau' })).not.toBeInTheDocument();

    await user.click(within(profile).getByRole('button', { name: 'Xếp lên trước' }));
    expect(screen.getByText('Đã đổi: Nguyễn Thị Lan xếp trước Nguyễn Văn Nam')).toBeInTheDocument();
    await waitFor(() => expect(card('Nguyễn Thị Lan')).toHaveFocus());
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0])).toEqual([
      { type: 'updatePerson', payload: { id: SISTER, changes: { siblingOrder: 1 } } },
      { type: 'updatePerson', payload: { id: SON, changes: { siblingOrder: 2 } } },
    ]);
    expect(useTreeStore.getState().tree.persons[SISTER]?.siblingOrder).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Hoàn tác thay đổi này' }));
    expect(useTreeStore.getState().tree.persons[SISTER]?.siblingOrder).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Hoàn tác thay đổi này' })).not.toBeInTheDocument();
    await waitFor(() => expect(card('Nguyễn Thị Lan')).toHaveFocus());
  });
});
```

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree`
Expected: PASS.

Mutation checks (each fails a test, then restore):
1. In `ChangeToast`, compare `state.undoStack.length > 0` instead of the op (the Undo button stays after undo).
2. In `decide`, return `result` without comparing (the out-of-date test fails).
3. In `relateText`, swap `a` and `b` in `before` (the page test's sentence fails).

- [ ] **Step 8: Run the whole check, then commit**

Prettier on the new and changed files, then `pnpm check` (exit 0).

Commit message (`.superpowers/sdd/p6c-task-5-commit.txt`):

```
feat(web): change runner with questions and Undo toast; move siblings

Every relationship change goes through one runner: it asks the
follow-up questions ("Thôi, không đổi" on each), checks the answer
again on the latest tree, applies one op and confirms it with
"Đã đổi: …" and Undo. "Xếp lên trước" and "Xếp ra sau" in the card
menu and the profile are its first users (spec 7.6).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---
### Task 6: "Change relationship…" dialog

Spec §7.6 "Keyboard and screen reader": a card-menu item (also a profile button) opens a dialog listing parents, spouses and children with **Remove**, each marriage's status, and **Add or replace** with a name search over the tree and the tray; blocked choices stay listed with their reason and `aria-disabled`; every change is one op with the Undo toast; focus returns to the card when the dialog closes.

**Files:**
- Create: `apps/web/src/features/tree/ChangeRelationshipDialog.tsx`, `apps/web/src/features/tree/PersonPicker.tsx`
- Modify: `usePersonActions.ts`, `TreeDialogs.tsx`, `TreePage.tsx`, locales
- Test: `apps/web/src/features/tree/ChangeRelationship.test.tsx` (new), `PersonPicker.test.tsx` (new), `usePersonActions.test.ts`

**Interfaces:**
- Consumes: `relationshipsOf`, `classifyLineage` (shared); `ChangeContext`, `RequestChange`, `planChange`, `Change`, `blockMessage` (Task 5); `useTreeDialog`.
- Produces:
  - `PersonActionId` gains `'changeRelationship'`, listed after `addParent` and before `moveEarlier`, for every person an editor can see.
  - `TreeDialog` gains `{ kind: 'relationships'; personId: string }`.
  - `PersonPicker.tsx`: `interface PickerOption { id: string; name: string; note?: string; blockedReason?: string }`, `PersonPicker(props: { label: string; listLabel: string; empty: string; query: string; onQueryChange: (query: string) => void; options: PickerOption[]; selectedId: string | null; onSelect: (id: string) => void })`
  - `ChangeRelationshipDialog.tsx`: `foldName(name: string): string` (accent- and case-insensitive key), `ChangeRelationshipDialog(props: { personId: string; onClose: () => void; onCloseAutoFocus: (event: Event) => void })`

In "Add or replace", the person being edited is B and the person picked is A: "Cha/mẹ của Nam" is `relate(A, Nam, 'parent')`, "Con của Nam" is `relate(A, Nam, 'child')`.

- [ ] **Step 1: Strings**

vi.json: `tree.actions.changeRelationship`: `"Đổi quan hệ…"`, and a new block:

```json
"relationships": {
  "title": "Đổi quan hệ của {{name}}",
  "parents": "Cha mẹ",
  "spouses": "Vợ/chồng",
  "children": "Con",
  "none": "Chưa có ai.",
  "remove": "Gỡ",
  "removeParent": "Gỡ cha/mẹ: {{name}}",
  "removeSpouse": "Gỡ vợ/chồng: {{name}}",
  "removeChild": "Gỡ con: {{name}}",
  "statusOf": "Tình trạng hôn nhân với {{name}}",
  "add": "Thêm hoặc thay",
  "relation": "Người kia là",
  "asParent": "Cha/mẹ của {{name}}",
  "asSpouse": "Vợ/chồng của {{name}}",
  "asChild": "Con của {{name}}",
  "search": "Tìm theo tên",
  "results": "Người tìm được",
  "inTray": "Ảnh chưa dán",
  "noMatch": "Không có ai trùng tên này.",
  "pick": "Hãy chọn một người trong danh sách.",
  "apply": "Áp dụng",
  "close": "Xong"
}
```

en.json: `"changeRelationship": "Change relationship…"` and:

```json
"relationships": {
  "title": "Change relationships of {{name}}",
  "parents": "Parents",
  "spouses": "Spouses",
  "children": "Children",
  "none": "No one yet.",
  "remove": "Remove",
  "removeParent": "Remove parent: {{name}}",
  "removeSpouse": "Remove spouse: {{name}}",
  "removeChild": "Remove child: {{name}}",
  "statusOf": "Marriage status with {{name}}",
  "add": "Add or replace",
  "relation": "The other person is",
  "asParent": "A parent of {{name}}",
  "asSpouse": "A spouse of {{name}}",
  "asChild": "A child of {{name}}",
  "search": "Search by name",
  "results": "People found",
  "inTray": "Loose photos",
  "noMatch": "No one has that name.",
  "pick": "Choose someone from the list.",
  "apply": "Apply",
  "close": "Done"
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/features/tree/PersonPicker.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { PersonPicker, type PickerOption } from './PersonPicker';

const OPTIONS: PickerOption[] = [
  { id: 'a', name: 'Nguyễn Văn Tư', blockedReason: 'Quan hệ này đã có rồi.' },
  { id: 'b', name: 'Trần Văn Bình', note: 'Ảnh chưa dán' },
];

function Harness() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <PersonPicker
      label="Tìm theo tên"
      listLabel="Người tìm được"
      empty="Không có ai trùng tên này."
      query={query}
      onQueryChange={setQuery}
      options={query === '' ? [] : OPTIONS}
      selectedId={selectedId}
      onSelect={setSelectedId}
    />
  );
}

describe('PersonPicker', () => {
  it('lists matches, keeps blocked ones with their reason, and selects with the keyboard', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.type(screen.getByRole('searchbox', { name: 'Tìm theo tên' }), 'n');
    const list = screen.getByRole('listbox', { name: 'Người tìm được' });
    const blocked = screen.getByRole('option', { name: /Nguyễn Văn Tư/ });
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    expect(blocked).toHaveTextContent('Quan hệ này đã có rồi.');
    await user.click(blocked);
    expect(blocked).toHaveAttribute('aria-selected', 'false');

    await user.tab();
    expect(list).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('option', { name: /Trần Văn Bình/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('says when no one matches', async () => {
    const user = userEvent.setup();
    function Empty() {
      const [query, setQuery] = useState('');
      return (
        <PersonPicker
          label="Tìm theo tên"
          listLabel="Người tìm được"
          empty="Không có ai trùng tên này."
          query={query}
          onQueryChange={setQuery}
          options={[]}
          selectedId={null}
          onSelect={() => undefined}
        />
      );
    }
    renderWithProviders(<Empty />);
    await user.type(screen.getByRole('searchbox', { name: 'Tìm theo tên' }), 'zz');
    expect(screen.getByText('Không có ai trùng tên này.')).toBeInTheDocument();
  });
});
```

Create `apps/web/src/features/tree/ChangeRelationship.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN_ID, FAMILY, GRANDMA, LOOSE, ME, PARENTS_UNION, SON } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { batchOps, card, cardName, EDITOR, editableTree } from './testKit';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

async function openDialog(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: cardName(name) }));
  const profile = screen.getByRole('complementary', { name });
  await user.click(within(profile).getByRole('button', { name: 'Đổi quan hệ…' }));
  return screen.getByRole('dialog', { name: `Đổi quan hệ của ${name}` });
}

function group(dialog: HTMLElement, name: string): HTMLElement {
  return within(dialog).getByRole('region', { name });
}

describe('Change relationship…', () => {
  it('lists parents, removes one with Remove, and keeps focus in the dialog', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Nam');
    const parents = group(dialog, 'Cha mẹ');
    expect(within(parents).getByText('Nguyễn Văn Tư')).toBeInTheDocument();
    expect(within(group(dialog, 'Vợ/chồng')).getByText('Chưa có ai.')).toBeInTheDocument();

    await user.click(within(parents).getByRole('button', { name: 'Gỡ cha/mẹ: Lê Thị Hoa' }));
    expect(
      screen.getByText('Đã đổi: Nguyễn Văn Nam không còn là con của Lê Thị Hoa'),
    ).toBeInTheDocument();
    expect(within(parents).queryByText('Lê Thị Hoa')).not.toBeInTheDocument();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await waitFor(() => expect(sent()).toHaveLength(1));
  });

  it('adds a child found by a name typed without accents, from the tray', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Tư');
    await user.click(within(dialog).getByRole('radio', { name: 'Con của Nguyễn Văn Tư' }));
    await user.type(within(dialog).getByRole('searchbox', { name: 'Tìm theo tên' }), 'binh');
    const option = within(dialog).getByRole('option', { name: /Trần Văn Bình/ });
    expect(option).toHaveTextContent('Ảnh chưa dán');
    await user.click(option);
    await user.click(within(dialog).getByRole('button', { name: 'Áp dụng' }));
    expect(
      screen.getByText('Đã đổi: Trần Văn Bình thành con của Nguyễn Văn Tư và Lê Thị Hoa'),
    ).toBeInTheDocument();
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0])).toEqual([
      { type: 'setParents', payload: { personId: LOOSE, parentUnionId: PARENTS_UNION } },
    ]);
  });

  it('keeps a blocked choice in the list, with its reason', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Nam');
    await user.click(within(dialog).getByRole('radio', { name: 'Cha/mẹ của Nguyễn Văn Nam' }));
    await user.type(within(dialog).getByRole('searchbox', { name: 'Tìm theo tên' }), 'Tư');
    const option = within(dialog).getByRole('option', { name: /Nguyễn Văn Tư/ });
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveTextContent('Quan hệ này đã có rồi.');
  });

  it('asks who keeps the children when a spouse is removed, and can change nothing', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Tư');
    const spouses = group(dialog, 'Vợ/chồng');
    await user.click(within(spouses).getByRole('button', { name: 'Gỡ vợ/chồng: Lê Thị Hoa' }));
    const question = screen.getByRole('dialog', { name: 'Các con ở với ai?' });
    await user.click(within(question).getByRole('button', { name: 'Thôi, không đổi' }));
    expect(screen.queryByRole('dialog', { name: 'Các con ở với ai?' })).not.toBeInTheDocument();
    expect(sent()).toEqual([]);

    await user.click(within(spouses).getByRole('button', { name: 'Gỡ vợ/chồng: Lê Thị Hoa' }));
    await user.click(screen.getByRole('button', { name: 'Ở với Lê Thị Hoa' }));
    expect(
      screen.getByText('Đã đổi: Nguyễn Văn Tư và Lê Thị Hoa không còn là vợ chồng'),
    ).toBeInTheDocument();
    expect(useTreeStore.getState().tree.unions[PARENTS_UNION]?.partnerIds).toEqual([GRANDMA]);
  });

  it('changes a marriage’s status, and returns focus to the card when closed', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Tư');
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Tình trạng hôn nhân với Lê Thị Hoa' }),
      'Goá',
    );
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0])).toEqual([
      { type: 'updateUnion', payload: { id: PARENTS_UNION, changes: { status: 'widowed' } } },
    ]);
    await user.click(within(dialog).getByRole('button', { name: 'Xong' }));
    // Opened from the profile's button: focus goes back there, inside the open profile.
    await waitFor(() =>
      expect(
        within(screen.getByRole('complementary', { name: 'Nguyễn Văn Tư' })).getByRole('button', {
          name: 'Đổi quan hệ…',
        }),
      ).toHaveFocus(),
    );
    expect(card('Nguyễn Văn Tư')).toBeInTheDocument();
  });
});
```

Also add to `usePersonActions.test.ts`: `availableActions(tree, SON, false)` contains `'changeRelationship'` right after `'addParent'`'s position (assert the whole list for SON as an editor: `['addChild', 'addSpouse', 'changeRelationship', 'delete']` — SON has both parents, so no `addParent`).

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree/PersonPicker.test.tsx src/features/tree/ChangeRelationship.test.tsx src/features/tree/usePersonActions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `PersonPicker.tsx`**

```tsx
import { useId, useState, type KeyboardEvent } from 'react';
import { cn } from '../../shared/lib/cn';

export interface PickerOption {
  id: string;
  name: string;
  /** Shown after the name, for example "Ảnh chưa dán". */
  note?: string;
  /** Why this person cannot be chosen; the option stays listed, aria-disabled (spec §7.6). */
  blockedReason?: string;
}

interface PersonPickerProps {
  label: string;
  listLabel: string;
  empty: string;
  query: string;
  onQueryChange: (query: string) => void;
  options: PickerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * A name search and a listbox of matches. The listbox is its own tab stop: arrows move, Enter
 * or Space choose (the ARIA listbox pattern); a blocked option cannot be chosen.
 */
export function PersonPicker({
  label,
  listLabel,
  empty,
  query,
  onQueryChange,
  options,
  selectedId,
  onSelect,
}: PersonPickerProps) {
  const inputId = useId();
  const listLabelId = useId();
  const optionPrefix = useId();
  const [active, setActive] = useState(0);
  const current = Math.min(active, Math.max(options.length - 1, 0));

  const choose = (option: PickerOption | undefined) => {
    if (option === undefined || option.blockedReason !== undefined) return;
    onSelect(option.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowDown') setActive(Math.min(current + 1, options.length - 1));
    else if (event.key === 'ArrowUp') setActive(Math.max(current - 1, 0));
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(options.length - 1);
    else if (event.key === 'Enter' || event.key === ' ') choose(options[current]);
    else return;
    event.preventDefault();
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        type="search"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setActive(0);
          onQueryChange(event.target.value);
        }}
        className="h-10 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
      />
      {query.trim() === '' ? null : options.length === 0 ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <>
          <span id={listLabelId} className="sr-only">
            {listLabel}
          </span>
          <ul
            role="listbox"
            tabIndex={0}
            aria-labelledby={listLabelId}
            aria-activedescendant={`${optionPrefix}-${current}`}
            onKeyDown={onKeyDown}
            className="group max-h-60 overflow-y-auto rounded-control border border-line p-1"
          >
            {options.map((option, at) => (
              <li
                key={option.id}
                id={`${optionPrefix}-${at}`}
                role="option"
                aria-selected={option.id === selectedId}
                aria-disabled={option.blockedReason === undefined ? undefined : true}
                onClick={() => {
                  setActive(at);
                  choose(option);
                }}
                className={cn(
                  'cursor-default rounded-control px-3 py-2 text-base',
                  at === current && 'group-focus-visible:bg-paper-grid',
                  option.id === selectedId && 'font-bold',
                  option.blockedReason === undefined ? 'text-ink' : 'text-ink-muted',
                )}
              >
                {option.name}
                {option.note === undefined ? null : (
                  <span className="text-sm text-ink-muted"> · {option.note}</span>
                )}
                {option.blockedReason === undefined ? null : (
                  <span className="block text-sm">{option.blockedReason}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `ChangeRelationshipDialog.tsx`**

```tsx
import {
  classifyLineage,
  relationshipsOf,
  type Relation,
  type UnionStatus,
} from '@ancestors-tree/shared/tree';
import { useContext, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogContent } from '../../shared/ui';
import { ChangeContext } from './ChangeRunner';
import { planChange, type Change } from './changes';
import { PersonPicker, type PickerOption } from './PersonPicker';
import { blockMessage } from './relateText';
import { useTreeStore } from './store';

const ADDABLE = ['parent', 'spouse', 'child'] as const satisfies readonly Relation[];
type Addable = (typeof ADDABLE)[number];
const RELATION_LABEL = {
  parent: 'tree.relationships.asParent',
  spouse: 'tree.relationships.asSpouse',
  child: 'tree.relationships.asChild',
} as const satisfies Record<Addable, string>;
const STATUSES: UnionStatus[] = ['married', 'divorced', 'widowed'];
/** The list shows this many matches; typing more narrows it (5,000 people would be too long). */
const MAX_PICKS = 20;

/** A search key without accents or case: "binh" finds "Bình", "dung" finds "Dũng". */
export function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi');
}

function RelationGroup({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode[];
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="font-bold text-ink">
        {title}
      </h3>
      {children.length === 0 ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

function RelationRow({
  name,
  removeLabel,
  onRemove,
  children,
}: {
  name: string;
  removeLabel: string;
  onRemove: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 text-base text-ink">{name}</span>
      {children}
      <Button variant="secondary" size="sm" aria-label={removeLabel} onClick={onRemove}>
        {t('tree.relationships.remove')}
      </Button>
    </li>
  );
}

interface ChangeRelationshipDialogProps {
  personId: string;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

/** "Change relationship…" (spec §7.6): the keyboard's way to do what dragging does. */
export function ChangeRelationshipDialog({
  personId,
  onClose,
  onCloseAutoFocus,
}: ChangeRelationshipDialogProps) {
  const { t } = useTranslation();
  const requestChange = useContext(ChangeContext);
  const tree = useTreeStore((state) => state.tree);
  const body = useRef<HTMLDivElement>(null);
  const radioName = useId();
  const addId = useId();
  const [relation, setRelation] = useState<Addable>('child');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const links = useMemo(() => relationshipsOf(tree, personId), [tree, personId]);
  const lineage = useMemo(() => classifyLineage(tree), [tree]);
  const options = useMemo<PickerOption[]>(() => {
    const needle = foldName(query.trim());
    if (needle === '') return [];
    return Object.values(tree.persons)
      .filter((other) => other.id !== personId && foldName(other.fullName).includes(needle))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
      .slice(0, MAX_PICKS)
      .map((other) => {
        const result = planChange(tree, {
          kind: 'relate',
          personId: other.id,
          targetId: personId,
          relation,
        });
        return {
          id: other.id,
          name: other.fullName,
          note: lineage.get(other.id) === 'unlinked' ? t('tree.relationships.inTray') : undefined,
          blockedReason: result.kind === 'blocked' ? blockMessage(t, result.reason) : undefined,
        };
      });
  }, [lineage, personId, query, relation, t, tree]);

  const person = tree.persons[personId];
  if (person === undefined || requestChange === null) return null;
  const name = (id: string) => tree.persons[id]?.fullName ?? t('tree.relate.someone');
  // Focus stays in the dialog: on the control that made the change, or on the dialog when that
  // control's row is gone.
  const run = (change: Change) => requestChange({ change, focusFallback: () => body.current });
  const marriages = links.marriages.filter((marriage) => marriage.partnerId !== null);
  const childIds = links.marriages.flatMap((marriage) => marriage.childIds);

  const apply = () => {
    if (selectedId === null) {
      setPickError(t('tree.relationships.pick'));
      return;
    }
    setPickError(null);
    run({ kind: 'relate', personId: selectedId, targetId: personId, relation });
    setSelectedId(null);
    setQuery('');
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={t('tree.relationships.title', { name: person.fullName })}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div ref={body} tabIndex={-1} className="flex flex-col gap-5 outline-none">
          <RelationGroup title={t('tree.relationships.parents')} empty={t('tree.relationships.none')}>
            {links.parentIds.map((id) => (
              <RelationRow
                key={id}
                name={name(id)}
                removeLabel={t('tree.relationships.removeParent', { name: name(id) })}
                onRemove={() => run({ kind: 'removeParent', childId: personId, parentId: id })}
              />
            ))}
          </RelationGroup>
          <RelationGroup title={t('tree.relationships.spouses')} empty={t('tree.relationships.none')}>
            {marriages.map(({ union, partnerId }) => {
              const partner = name(partnerId as string);
              return (
                <RelationRow
                  key={union.id}
                  name={partner}
                  removeLabel={t('tree.relationships.removeSpouse', { name: partner })}
                  onRemove={() => run({ kind: 'cutMarriage', unionId: union.id })}
                >
                  <select
                    aria-label={t('tree.relationships.statusOf', { name: partner })}
                    value={union.status}
                    onChange={(event) =>
                      run({
                        kind: 'status',
                        unionId: union.id,
                        status: event.target.value as UnionStatus,
                      })
                    }
                    className="h-8 rounded-control border border-line-strong bg-surface px-2 text-sm text-ink"
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`tree.relate.status.${status}`)}
                      </option>
                    ))}
                  </select>
                </RelationRow>
              );
            })}
          </RelationGroup>
          <RelationGroup title={t('tree.relationships.children')} empty={t('tree.relationships.none')}>
            {childIds.map((id) => (
              <RelationRow
                key={id}
                name={name(id)}
                removeLabel={t('tree.relationships.removeChild', { name: name(id) })}
                onRemove={() => run({ kind: 'cutThread', childId: id })}
              />
            ))}
          </RelationGroup>
          <section aria-labelledby={addId} className="flex flex-col gap-3">
            <h3 id={addId} className="font-bold text-ink">
              {t('tree.relationships.add')}
            </h3>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-medium text-ink">
                {t('tree.relationships.relation')}
              </legend>
              {ADDABLE.map((choice) => (
                <label key={choice} className="flex items-center gap-2 text-base text-ink">
                  <input
                    type="radio"
                    name={radioName}
                    className="size-4"
                    checked={relation === choice}
                    onChange={() => setRelation(choice)}
                  />
                  {t(RELATION_LABEL[choice], { name: person.fullName })}
                </label>
              ))}
            </fieldset>
            <PersonPicker
              label={t('tree.relationships.search')}
              listLabel={t('tree.relationships.results')}
              empty={t('tree.relationships.noMatch')}
              query={query}
              onQueryChange={(next) => {
                setQuery(next);
                setSelectedId(null);
              }}
              options={options}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setPickError(null);
              }}
            />
            {pickError === null ? null : (
              <p role="alert" className="text-sm font-medium text-stamp">
                {pickError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {t('tree.relationships.close')}
              </Button>
              <Button onClick={apply}>{t('tree.relationships.apply')}</Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

`useMemo` hooks sit above the early return on purpose (rules of hooks).

Add to `ChangeRelationship.test.tsx` (import `foldName` from `./ChangeRelationshipDialog`):

```tsx
it('searches without accents or case', () => {
  expect(foldName('Đặng Thị Bình')).toBe('dang thi binh');
  expect(foldName('Nguyễn Văn DŨNG')).toBe('nguyen van dung');
});
```

- [ ] **Step 5: Wire the action and the dialog**

`usePersonActions.ts`: add `'changeRelationship'` to `PersonActionId`; in `availableActions`, push it right after the `addParent` check (before the move items); `ACTION_ICONS.changeRelationship = Link2` (lucide).

`TreeDialogs.tsx`: `TreeDialog`'s person kinds gain `'relationships'`; add the case:

```tsx
    case 'relationships':
      return (
        <ChangeRelationshipDialog
          personId={person.id}
          onClose={close}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      );
```

`TreePage.tsx` `run` switch: `case 'changeRelationship': changeDialog({ kind: 'relationships', personId: id }); return;`. `TreeDialogs` renders inside the `ChangeContext` provider (move the provider so it wraps `TreeDialogs` too if it does not yet).

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree`
Expected: PASS. Update any existing test that asserts a whole action list for a person who now also gets `changeRelationship` (the new item is expected; the test is updated, not the code).

Mutation checks: choose a blocked option on click (the picker test fails); drop `focusFallback` (the first dialog test's focus check fails); swap `personId`/`targetId` in `apply` (the add test's sentence fails).

- [ ] **Step 7: Run the whole check, then commit**

Prettier, then `pnpm check` (exit 0).

Commit message (`.superpowers/sdd/p6c-task-6-commit.txt`):

```
feat(web): "Change relationship…" dialog

The keyboard way to do what dragging does (spec 7.6): parents,
spouses and children with Remove, each marriage's status, and Add or
replace with a name search over the tree and Loose photos (accents
optional). Blocked choices stay listed with their reason. Every change
goes through the change runner, so it asks the same questions and
offers Undo.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 7: Cut on the board, and the divorced stitch

Spec §7.6 "Cut": clicking a thread or its red pin, or a marriage knot, shows **Cắt chỉ** in a small popover; pins and knots are pointer-only buttons, not tab stops. A divorce is a union status, shown as a broken stitch.

**Files:**
- Create: `apps/web/src/features/tree/CutPopover.tsx`
- Modify: `ThreadEdge.tsx`, `UnionNode.tsx`, `flowElements.ts`, `flowElements.test.ts`, `shared/ui/scrapbook/Stitch.tsx`, locales
- Test: `apps/web/src/features/tree/Cut.test.tsx` (new), `apps/web/src/shared/ui/scrapbook/Stitch.test.tsx` (new, or the existing scrapbook test file if there is one)

**Interfaces:**
- Consumes: `ChangeContext` (Task 5), `Thread`, `Stitch`, `threadPath`, `EdgeLabelRenderer` (`@xyflow/react`), `Popover` (`radix-ui`).
- Produces:
  - `UnionNodeData = { couple: boolean; unionId: string }`.
  - `Stitch` gains `broken?: boolean` (two dashed halves with a gap where the knot was, and the knot drawn as an open ring).
  - `CutPopover(props: { label: string; open: boolean; onOpenChange: (open: boolean) => void; onCut: () => void; children: ReactElement })` — `children` is the pointer-only trigger.

- [ ] **Step 1: Strings**

vi.json `tree.cut`:

```json
"cut": {
  "action": "Cắt chỉ",
  "thread": "Chỉ nối {{name}} với cha mẹ",
  "knot": "Nút hôn nhân của {{names}}"
}
```

en.json `tree.cut`: `"action": "Cut"`, `"thread": "Thread from {{name}} to the parents"`, `"knot": "Marriage knot of {{names}}"`.

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/features/tree/Cut.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, FAMILY, GRANDMA, ME, PARENTS_UNION, SON } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { batchOps, card, EDITOR, editableTree } from './testKit';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

describe('Cut on the board', () => {
  it('cuts a thread from its pin, in one op, and focuses the child in the tray', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    // Pointer-only: hidden from screen readers and not a tab stop (spec §7.6).
    const pin = await screen.findByRole('button', {
      name: 'Chỉ nối Nguyễn Văn Nam với cha mẹ',
      hidden: true,
    });
    expect(pin).toHaveAttribute('tabindex', '-1');
    await user.click(pin);
    await user.click(screen.getByRole('button', { name: 'Cắt chỉ' }));
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0])).toEqual([
      { type: 'setParents', payload: { personId: SON, parentUnionId: null } },
    ]);
    expect(
      screen.getByText('Đã đổi: Nguyễn Văn Nam không còn là con của Nguyễn Văn Tư và Lê Thị Hoa'),
    ).toBeInTheDocument();
    await waitFor(() => expect(card('Nguyễn Văn Nam')).toHaveFocus());
  });

  it('cuts a marriage from its knot, asking who keeps the children', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await user.click(
      await screen.findByRole('button', {
        name: 'Nút hôn nhân của Nguyễn Văn Tư và Lê Thị Hoa',
        hidden: true,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Cắt chỉ' }));
    await user.click(screen.getByRole('button', { name: 'Ở với Lê Thị Hoa' }));
    expect(useTreeStore.getState().tree.unions[PARENTS_UNION]?.partnerIds).toEqual([GRANDMA]);
  });

  it('shows viewers no pins or knots to cut', async () => {
    editableTree(FAMILY, { ...CLAN, role: 'viewer' });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    expect(
      screen.queryByRole('button', { name: 'Chỉ nối Nguyễn Văn Nam với cha mẹ', hidden: true }),
    ).not.toBeInTheDocument();
  });
});
```

Stitch test (`apps/web/src/shared/ui/scrapbook/Stitch.test.tsx`):

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stitch } from './Stitch';

describe('Stitch', () => {
  it('draws a divorce as two halves with a gap', () => {
    const { container, rerender } = render(
      <svg>
        <Stitch left={{ x: 0, y: 0 }} right={{ x: 100, y: 0 }} />
      </svg>,
    );
    expect(container.querySelectorAll('path')).toHaveLength(1);
    rerender(
      <svg>
        <Stitch left={{ x: 0, y: 0 }} right={{ x: 100, y: 0 }} broken />
      </svg>,
    );
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelector('[data-relation="marriage"]')).toHaveAttribute(
      'data-broken',
      'true',
    );
  });
});
```

In `flowElements.test.ts`, the union node's expected `data` becomes `{ couple: true, unionId: U }`.

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree/Cut.test.tsx src/features/tree/flowElements.test.ts src/shared/ui/scrapbook`
Expected: FAIL.

- [ ] **Step 3: Write `CutPopover.tsx`**

```tsx
import { Scissors } from 'lucide-react';
import { Popover } from 'radix-ui';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui';

interface CutPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCut: () => void;
  /** The pointer-only pin or knot button. */
  children: ReactElement;
}

/** "Cắt chỉ" beside a pin or a knot (spec §7.6). */
export function CutPopover({ open, onOpenChange, onCut, children }: CutPopoverProps) {
  const { t } = useTranslation();
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={6}
          // The trigger is not a tab stop; the runner places focus after the cut.
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="z-50 rounded-control border border-line bg-paper p-1 shadow-lift"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onCut();
            }}
          >
            <Scissors aria-hidden="true" strokeWidth={1.75} className="size-4" />
            {t('tree.cut.action')}
          </Button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

- [ ] **Step 4: Pins, knots and the broken stitch**

`Stitch.tsx`: add `broken = false`. When broken, draw `stitchPath(left, { x: knot.x - GAP, y: knot.y })` and `stitchPath({ x: knot.x + GAP, y: knot.y }, right)` (`const GAP = 6`), keep the circle but with `className="fill-none …stroke"`, and set `data-broken={broken || undefined}` on the `<g>`.

`flowElements.ts`: `export type UnionNodeData = { couple: boolean; unionId: string };` and `data: { couple: union.couple, unionId: union.id }`.

`ThreadEdge.tsx`:

```tsx
import { EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { memo, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Thread, threadPath } from '../../shared/ui';
import { ChangeContext } from './ChangeRunner';
import { CutPopover } from './CutPopover';
import type { ThreadFlowEdge } from './flowElements';
import { useTreeStore } from './store';

/** A target of at least 24 px around the pin (WCAG 2.5.8). */
const PIN_TARGET = 24;

/** Parent → child thread. The layout already knows the exact points, so handles are ignored. */
function ThreadEdgeComponent({ data, target }: EdgeProps<ThreadFlowEdge>) {
  const { t } = useTranslation();
  const requestChange = useContext(ChangeContext);
  const [open, setOpen] = useState(false);
  const name = useTreeStore((state) => state.tree.persons[target]?.fullName ?? '');
  if (!data) return null;
  return (
    <>
      <Thread from={data.from} dropTo={data.dropTo} to={data.to} selected={open} />
      {requestChange === null ? null : (
        <>
          {/* A wide invisible stroke: the thread itself opens the same popover. */}
          <path
            d={threadPath(data.from, data.dropTo, data.to)}
            fill="none"
            stroke="transparent"
            strokeWidth={12}
            className="nopan cursor-pointer"
            style={{ pointerEvents: 'stroke' }}
            onClick={() => setOpen(true)}
          />
          <EdgeLabelRenderer>
            <CutPopover
              open={open}
              onOpenChange={setOpen}
              onCut={() =>
                requestChange({ change: { kind: 'cutThread', childId: target }, focusPersonId: target })
              }
            >
              <button
                type="button"
                // Pointer-only (spec §7.6): Remove in "Change relationship…" is the keyboard way.
                tabIndex={-1}
                aria-hidden="true"
                aria-label={t('tree.cut.thread', { name })}
                className="nodrag nopan absolute cursor-pointer rounded-full"
                style={{
                  width: PIN_TARGET,
                  height: PIN_TARGET,
                  transform: `translate(-50%, -50%) translate(${data.to.x}px, ${data.to.y}px)`,
                  pointerEvents: 'all',
                }}
              />
            </CutPopover>
          </EdgeLabelRenderer>
        </>
      )}
    </>
  );
}

export const ThreadEdge = memo(ThreadEdgeComponent);
```

`Thread` already takes `selected` and draws its pin at `to`, and `threadPath(from, dropTo, to)` is the path it draws, so the invisible stroke and the pin button sit exactly on it.

`UnionNode.tsx`:

```tsx
function UnionNodeComponent({ data, width = 0, height = 0 }: NodeProps<UnionFlowNode>) {
  const { t } = useTranslation();
  const requestChange = useContext(ChangeContext);
  const [open, setOpen] = useState(false);
  const status = useTreeStore((state) => state.tree.unions[data.unionId]?.status);
  // The partners' names as one string: a stable selector value.
  const names = useTreeStore((state) =>
    (state.tree.unions[data.unionId]?.partnerIds ?? [])
      .map((id) => state.tree.persons[id]?.fullName ?? '')
      .join(` ${t('tree.relate.andWord')} `),
  );
  const firstPartner = useTreeStore(
    (state) => state.tree.unions[data.unionId]?.partnerIds[0] ?? null,
  );
  return (
    <>
      <svg aria-hidden="true" width={width} height={height} className="overflow-visible">
        {data.couple ? (
          <Stitch
            left={{ x: 0, y: height / 2 }}
            right={{ x: width, y: height / 2 }}
            selected={open}
            broken={status === 'divorced'}
          />
        ) : (
          <circle cx={width / 2} cy={height / 2} r={4} className="fill-thread" />
        )}
      </svg>
      {requestChange === null ? null : (
        <CutPopover
          open={open}
          onOpenChange={setOpen}
          onCut={() =>
            requestChange({
              change: { kind: 'cutMarriage', unionId: data.unionId },
              focusPersonId: firstPartner ?? undefined,
            })
          }
        >
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            aria-label={t('tree.cut.knot', { names })}
            className="nodrag nopan absolute size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full"
            style={{ left: width / 2, top: height / 2, pointerEvents: 'auto' }}
          />
        </CutPopover>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={HIDDEN_HANDLE}
      />
    </>
  );
}
```

Add `"andWord": "và"` (vi) / `"and"` (en) under `tree.relate`, used only to join the knot's names. A one-person union's knot reads "Nút hôn nhân của Nguyễn Văn Tư".

`TreeBoard.test.tsx` counts the board's buttons and `[tabindex]` elements with `querySelectorAll`; it renders `TreeBoard` without `ChangeContext` (a viewer's board), so no pins or knots appear there and it stays as it is.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree src/shared/ui`
Expected: PASS.

Mutation checks: give the pin `tabIndex={0}` (test 1 fails); render the pins for viewers (test 3 fails); pass `focusPersonId` the union instead of the child (test 1's focus check fails).

- [ ] **Step 6: Run the whole check, then commit**

Prettier, then `pnpm check` (exit 0).

Commit message (`.superpowers/sdd/p6c-task-7-commit.txt`):

```
feat(web): cut threads and marriages on the board

Clicking a thread, its pin or a marriage knot shows "Cắt chỉ" in a
small popover. Pins and knots are pointer-only (the keyboard uses
Remove in "Change relationship…"); cutting a marriage with children
asks who they stay with. A divorced marriage is drawn as a broken
stitch (spec 7.6).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 8: Drag to relate with the mouse

Spec §7.6 "Drag to relate": a mouse drag starts after about 6 px; the lifted card follows with a tilt and a shadow while the original fades; drop zones are the top, middle and bottom thirds (parent, spouse, child) and, for siblings, the left and right fifths (before, after); the zones are labelled while hovering and blocked ones are crossed out; a polite status line says what the drop will do; the rules run again only when the target or zone changes; the board pans near its edges; Esc, empty space or the card's own place cancel with no op and no toast; dropping on the tray detaches; focus goes to A afterwards.

**Files:**
- Create: `apps/web/src/features/tree/dragZones.ts`, `dragStore.ts`, `TreeDnd.tsx`, `DropZones.tsx`
- Modify: `apps/web/package.json` (dependency), `PersonCard.tsx`, `UnlinkedTray.tsx`, `TreeBoard.tsx`, `TreePage.tsx`, locales
- Test: `dragZones.test.ts`, `Drag.test.tsx` (new)

**Interfaces:**
- Consumes: `planChange`, `Change`, `ChangeResult`, `ChangeContext`, `changeSentence`, `blockMessage` (Task 5); `classifyLineage`.
- Produces:
  - `dragZones.ts`: `type Zone = Relation | 'tray'`, `TRAY_ID = 'tray'`, `SIBLING_EDGE = 0.2`, `EDGE_PAN_ZONE = 40`, `EDGE_PAN_STEP = 12`, `type ZoneResults = Partial<Record<Zone, ChangeResult>>`, `zoneAt(point, rect, siblings): Relation`, `areSiblings(tree, a, b): boolean`, `zoneResults(tree, activeId, overId): ZoneResults | null`, `zoneFor(overId, activeId, point, rect, results): Zone | null`, `dropChange(activeId, overId, zone): Change | null`, `edgePan(point, rect): Point | null`, `pointerOf(event: { activatorEvent: Event; delta: Point }): Point`, `interface RectLike { left: number; top: number; width: number; height: number }`
  - `dragStore.ts`: `useDragStore` (`activeId`, `overId`, `zone`, `results`, `pointer`, `seenTree`, `endedAt`), `IDLE_DRAG`, `resetDrag()`, `CLICK_AFTER_DROP_MS = 250`, `justDropped(): boolean`
  - `TreeDnd({ canEdit, children })`, `MOUSE_DISTANCE = 6`; Task 9 adds the touch sensor here.
  - `DropZones({ results, zone })`
  - `TrayPhoto` gains `draggable?: boolean` (only a stack's root is draggable).

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @ancestors-tree/web add @dnd-kit/core`
Expected: `apps/web/package.json` lists `"@dnd-kit/core": "^6.…"` and `pnpm-lock.yaml` changes. Read `node_modules/@dnd-kit/core/package.json` for the installed version and confirm `DndContext`, `DragOverlay`, `MouseSensor`, `TouchSensor`, `useDraggable`, `useDroppable`, `pointerWithin`, `MeasuringStrategy` are exported (`dist/index.d.ts`).

- [ ] **Step 2: Write the failing pure tests**

Create `apps/web/src/features/tree/dragZones.test.ts`:

```ts
import { treeStateFromLists } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import {
  areSiblings,
  dropChange,
  edgePan,
  pointerOf,
  TRAY_ID,
  zoneAt,
  zoneFor,
  zoneResults,
} from './dragZones';
import { FAMILY, GRANDPA, LOOSE, SIBLINGS, SISTER, SON } from './fixtures';

const RECT = { left: 100, top: 100, width: 100, height: 150 };
const family = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);
const siblings = treeStateFromLists(SIBLINGS.progenitorId, SIBLINGS.persons, SIBLINGS.unions);

describe('zoneAt', () => {
  it('uses thirds for parent, spouse and child', () => {
    expect(zoneAt({ x: 150, y: 110 }, RECT, false)).toBe('parent');
    expect(zoneAt({ x: 150, y: 175 }, RECT, false)).toBe('spouse');
    expect(zoneAt({ x: 150, y: 240 }, RECT, false)).toBe('child');
  });

  it('uses the left and right fifths for siblings only', () => {
    expect(zoneAt({ x: 105, y: 175 }, RECT, true)).toBe('before');
    expect(zoneAt({ x: 195, y: 175 }, RECT, true)).toBe('after');
    expect(zoneAt({ x: 105, y: 175 }, RECT, false)).toBe('spouse');
  });
});

describe('the drop', () => {
  it('knows siblings', () => {
    expect(areSiblings(siblings, SON, SISTER)).toBe(true);
    expect(areSiblings(siblings, SON, GRANDPA)).toBe(false);
    expect(areSiblings(family, LOOSE, GRANDPA)).toBe(false);
  });

  it('plans every zone of a target once, with the sibling edges only for siblings', () => {
    expect(Object.keys(zoneResults(family, LOOSE, SON) ?? {})).toEqual(['parent', 'spouse', 'child']);
    expect(Object.keys(zoneResults(siblings, SISTER, SON) ?? {})).toEqual([
      'parent',
      'spouse',
      'child',
      'before',
      'after',
    ]);
    expect(zoneResults(family, SON, SON)).toBeNull();
    expect(zoneResults(family, SON, null)).toBeNull();
    // Someone already loose, dropped back on the tray: nothing to do, so a cancel.
    expect(zoneResults(family, LOOSE, TRAY_ID)).toBeNull();
    expect(zoneResults(family, SON, TRAY_ID)?.tray?.kind).toBe('ok');
  });

  it('cancels on empty space and on the card’s own place', () => {
    expect(dropChange(SON, null, null)).toBeNull();
    expect(dropChange(SON, SON, 'child')).toBeNull();
    expect(dropChange(LOOSE, SON, 'child')).toEqual({
      kind: 'relate',
      personId: LOOSE,
      targetId: SON,
      relation: 'child',
    });
    expect(dropChange(SON, TRAY_ID, 'tray')).toEqual({ kind: 'detach', personId: SON });
  });

  it('picks the zone from the pointer, or the tray', () => {
    const results = zoneResults(family, LOOSE, SON);
    expect(zoneFor(SON, LOOSE, { x: 150, y: 240 }, RECT, results)).toBe('child');
    expect(zoneFor(TRAY_ID, SON, { x: 0, y: 0 }, null, zoneResults(family, SON, TRAY_ID))).toBe(
      'tray',
    );
    expect(zoneFor(null, SON, { x: 0, y: 0 }, null, null)).toBeNull();
  });
});

describe('pointer and edges', () => {
  it('follows the pointer from where the drag started', () => {
    const start = new MouseEvent('mousedown', { clientX: 10, clientY: 20 });
    expect(pointerOf({ activatorEvent: start, delta: { x: 5, y: -3 } })).toEqual({ x: 15, y: 17 });
  });

  it('pans towards the edge the pointer is near, and not from the middle or outside', () => {
    const board = { left: 0, top: 0, width: 800, height: 600 };
    expect(edgePan({ x: 10, y: 300 }, board)).toEqual({ x: 12, y: 0 });
    expect(edgePan({ x: 790, y: 590 }, board)).toEqual({ x: -12, y: -12 });
    expect(edgePan({ x: 400, y: 300 }, board)).toBeNull();
    expect(edgePan({ x: -5, y: 300 }, board)).toBeNull();
  });
});
```

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree/dragZones.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `dragZones.ts` and `dragStore.ts`**

```ts
import { classifyLineage, type Relation, type TreeState } from '@ancestors-tree/shared/tree';
import type { Point } from '../../shared/ui';
import { planChange, type Change, type ChangeResult } from './changes';

/** A drop zone: one of the relations, or the Loose photos tray. */
export type Zone = Relation | 'tray';
export type ZoneResults = Partial<Record<Zone, ChangeResult>>;

/** The tray's droppable id (never a person's: those are 24 hex digits). */
export const TRAY_ID = 'tray';
/** Each side edge of a sibling's card that means "before" or "after" (spec §7.6: about a fifth). */
export const SIBLING_EDGE = 0.2;
/** How near the board's edge a dragged card pans it, and by how much per frame (px). */
export const EDGE_PAN_ZONE = 40;
export const EDGE_PAN_STEP = 12;

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

const ALL_RELATIONS: Relation[] = ['parent', 'spouse', 'child', 'before', 'after'];
const FAMILY_RELATIONS: Relation[] = ['parent', 'spouse', 'child'];

/** The zone under the pointer on a target card (spec §7.6 "Drop zones"). */
export function zoneAt(point: Point, rect: RectLike, siblings: boolean): Relation {
  const x = (point.x - rect.left) / rect.width;
  const y = (point.y - rect.top) / rect.height;
  if (siblings && x < SIBLING_EDGE) return 'before';
  if (siblings && x > 1 - SIBLING_EDGE) return 'after';
  if (y < 1 / 3) return 'parent';
  if (y < 2 / 3) return 'spouse';
  return 'child';
}

export function areSiblings(tree: TreeState, a: string, b: string): boolean {
  const unionId = tree.persons[a]?.parentUnionId;
  return unionId !== undefined && unionId === tree.persons[b]?.parentUnionId;
}

/**
 * Every zone's answer for this target, planned once when the target changes (spec §7.6: the rules
 * run again only when the target or zone changes). Null means a drop here is a cancel.
 */
export function zoneResults(
  tree: TreeState,
  activeId: string | null,
  overId: string | null,
): ZoneResults | null {
  if (activeId === null || overId === null || overId === activeId) return null;
  if (overId === TRAY_ID) {
    if (classifyLineage(tree).get(activeId) === 'unlinked') return null;
    return { tray: planChange(tree, { kind: 'detach', personId: activeId }) };
  }
  const relations = areSiblings(tree, activeId, overId) ? ALL_RELATIONS : FAMILY_RELATIONS;
  return Object.fromEntries(
    relations.map((relation) => [
      relation,
      planChange(tree, { kind: 'relate', personId: activeId, targetId: overId, relation }),
    ]),
  );
}

export function zoneFor(
  overId: string | null,
  activeId: string | null,
  point: Point,
  rect: RectLike | null,
  results: ZoneResults | null,
): Zone | null {
  if (overId === null || overId === activeId || results === null) return null;
  if (overId === TRAY_ID) return 'tray';
  if (rect === null) return null;
  return zoneAt(point, rect, results.before !== undefined);
}

/** What a drop does; null cancels it (empty space, the card's own place). */
export function dropChange(
  activeId: string | null,
  overId: string | null,
  zone: Zone | null,
): Change | null {
  if (activeId === null || overId === null || zone === null || overId === activeId) return null;
  if (zone === 'tray') return { kind: 'detach', personId: activeId };
  return { kind: 'relate', personId: activeId, targetId: overId, relation: zone };
}

/** The board's pan for a pointer near its edge (spec §7.6 "Edges of the board"); null inside. */
export function edgePan(point: Point, rect: RectLike): Point | null {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  if (point.x < rect.left || point.x > right || point.y < rect.top || point.y > bottom) return null;
  const x =
    point.x < rect.left + EDGE_PAN_ZONE
      ? EDGE_PAN_STEP
      : point.x > right - EDGE_PAN_ZONE
        ? -EDGE_PAN_STEP
        : 0;
  const y =
    point.y < rect.top + EDGE_PAN_ZONE
      ? EDGE_PAN_STEP
      : point.y > bottom - EDGE_PAN_ZONE
        ? -EDGE_PAN_STEP
        : 0;
  return x === 0 && y === 0 ? null : { x, y };
}

/** Where the pointer is now: where the drag started, plus how far it moved. */
export function pointerOf(event: { activatorEvent: Event; delta: Point }): Point {
  const start = event.activatorEvent as MouseEvent & { touches?: TouchList };
  const origin = start.touches?.[0] ?? start;
  return { x: (origin.clientX ?? 0) + event.delta.x, y: (origin.clientY ?? 0) + event.delta.y };
}
```

`dragStore.ts`:

```ts
import type { TreeState } from '@ancestors-tree/shared/tree';
import { create } from 'zustand';
import type { Point } from '../../shared/ui';
import type { Zone, ZoneResults } from './dragZones';

export interface DragState {
  /** The person being dragged. */
  activeId: string | null;
  /** The card (person id) or TRAY_ID under the pointer. */
  overId: string | null;
  zone: Zone | null;
  /** Every zone's answer for overId, planned on seenTree. */
  results: ZoneResults | null;
  pointer: Point | null;
  seenTree: TreeState | null;
  /** performance.now() when the last drag ended: the click that follows a drop is not a click. */
  endedAt: number;
}

export const IDLE_DRAG = {
  activeId: null,
  overId: null,
  zone: null,
  results: null,
  pointer: null,
  seenTree: null,
} as const satisfies Omit<DragState, 'endedAt'>;

/** The drag in progress, for the cards' zone labels, the status line and the edge pan. */
export const useDragStore = create<DragState>(() => ({ ...IDLE_DRAG, endedAt: 0 }));

export const CLICK_AFTER_DROP_MS = 250;

export function resetDrag(): void {
  useDragStore.setState({ ...IDLE_DRAG, endedAt: performance.now() });
}

/** True right after a drag ended: the browser's click on the dragged card is ignored. */
export function justDropped(): boolean {
  return performance.now() - useDragStore.getState().endedAt < CLICK_AFTER_DROP_MS;
}
```

Run the pure tests: PASS.

- [ ] **Step 4: Strings**

vi.json `tree.drag`:

```json
"drag": {
  "lifted": "Đang kéo {{name}}. Thả lên một thẻ khác, hoặc nhấn Esc để huỷ.",
  "willDo": "Thả để: {{change}}",
  "willAsk": "{{target}}: khi thả sẽ hỏi thêm một câu.",
  "blocked": "{{target}}: không được. {{reason}}",
  "zone": {
    "parent": "Làm cha/mẹ",
    "spouse": "Làm vợ/chồng",
    "child": "Làm con",
    "before": "Xếp trước",
    "after": "Xếp sau"
  },
  "target": {
    "parent": "Làm cha/mẹ của {{name}}",
    "spouse": "Làm vợ/chồng của {{name}}",
    "child": "Làm con của {{name}}",
    "before": "Xếp trước {{name}}",
    "after": "Xếp sau {{name}}",
    "tray": "Chuyển vào Ảnh chưa dán"
  },
  "trayDrop": "Thả vào đây để chuyển vào Ảnh chưa dán."
}
```

en.json `tree.drag`:

```json
"drag": {
  "lifted": "Dragging {{name}}. Drop on another card, or press Esc to cancel.",
  "willDo": "Drop to: {{change}}",
  "willAsk": "{{target}}: one more question when you drop.",
  "blocked": "{{target}}: not possible. {{reason}}",
  "zone": {
    "parent": "Parent",
    "spouse": "Spouse",
    "child": "Child",
    "before": "Before",
    "after": "After"
  },
  "target": {
    "parent": "Parent of {{name}}",
    "spouse": "Spouse of {{name}}",
    "child": "Child of {{name}}",
    "before": "Before {{name}}",
    "after": "After {{name}}",
    "tray": "Move to Loose photos"
  },
  "trayDrop": "Drop here to move to Loose photos."
}
```

- [ ] **Step 5: Write the failing page test**

Create `apps/web/src/features/tree/Drag.test.tsx`:

```tsx
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { treeStateFromLists } from '@ancestors-tree/shared/tree';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { useDragStore, resetDrag } from './dragStore';
import { zoneResults } from './dragZones';
import { CLAN, CLAN_ID, FAMILY, GRANDPA, LOOSE, ME, SON } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { batchOps, card, EDITOR, editableTree } from './testKit';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetDrag();
  resetTreeStore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const tree = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);

/** The card's wrapper, the droppable dnd-kit measures. */
function wrapperOf(name: string): HTMLElement {
  const wrapper = card(name).parentElement;
  if (wrapper === null) throw new Error('no card wrapper');
  return wrapper;
}

function placeAt(element: HTMLElement, left: number, top: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: left, y: top, width: 100, height: 150 }),
  );
}

describe('drag to relate (mouse)', () => {
  it('labels the zones on the target, crosses out the blocked ones, and says what will happen', async () => {
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    act(() => {
      useDragStore.setState({
        activeId: GRANDPA,
        overId: SON,
        zone: 'parent',
        results: zoneResults(tree, GRANDPA, SON),
        seenTree: tree,
      });
    });
    // Grandpa is already Nam's parent: that zone is crossed out.
    expect(screen.getByText('Làm cha/mẹ')).toHaveClass('line-through');
    expect(screen.getByText('Làm con')).not.toHaveClass('line-through');
    expect(
      screen.getByText(
        'Làm cha/mẹ của Nguyễn Văn Nam: không được. Quan hệ này đã có rồi.',
      ),
    ).toBeInTheDocument();
  });

  it('starts a drag after about 6 px, and Esc cancels it with no op', async () => {
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    fireEvent.mouseDown(nam, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 3, clientY: 0 });
    expect(useDragStore.getState().activeId).toBeNull();
    fireEvent.mouseMove(document, { clientX: 10, clientY: 0 });
    await waitFor(() => expect(useDragStore.getState().activeId).toBe(SON));
    expect(screen.getByText('Đang kéo Nguyễn Văn Nam. Thả lên một thẻ khác, hoặc nhấn Esc để huỷ.'))
      .toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(useDragStore.getState().activeId).toBeNull());
    fireEvent.mouseUp(document);
    expect(sent()).toEqual([]);
  });

  it('drops a loose photo on the bottom third of a card: one op, a toast, focus on the person', async () => {
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    placeAt(wrapperOf('Nguyễn Văn Nam'), 100, 100);
    const binh = card('Trần Văn Bình');
    fireEvent.mouseDown(binh, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 150, clientY: 240 });
    await waitFor(() => expect(useDragStore.getState().zone).toBe('child'));
    fireEvent.mouseUp(document, { clientX: 150, clientY: 240 });
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0]).map((op) => op.type)).toEqual(['addUnion', 'setParents']);
    expect(screen.getByText('Đã đổi: Trần Văn Bình thành con của Nguyễn Văn Nam')).toBeInTheDocument();
    await waitFor(() => expect(card('Trần Văn Bình')).toHaveFocus());
    expect(useTreeStore.getState().tree.persons[LOOSE]?.parentUnionId).toBeDefined();
  });

  it('lets viewers drag nothing', async () => {
    editableTree(FAMILY, { ...CLAN, role: 'viewer' });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    fireEvent.mouseDown(nam, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 0 });
    expect(useDragStore.getState().activeId).toBeNull();
    fireEvent.mouseUp(document);
  });
});
```

dnd-kit measures droppables with `getBoundingClientRect`, so the stub on Nam's wrapper is what it sees. If the third test still reports no target in jsdom (dnd-kit reads a rect from another element than the wrapper), find the element `useDroppable`'s `setNodeRef` is given (it must be the wrapper, Step 6) and stub that one; do not drop the test.

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree/Drag.test.tsx`
Expected: FAIL.

- [ ] **Step 6: Draggable cards and tray photos**

`DropZones.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { cn } from '../../shared/lib/cn';
import type { Relation } from '@ancestors-tree/shared/tree';
import type { Zone, ZoneResults } from './dragZones';

const BANDS: { zone: Relation; className: (edges: boolean) => string }[] = [
  { zone: 'parent', className: (edges) => cn('top-0 h-1/3', edges ? 'inset-x-[20%]' : 'inset-x-0') },
  { zone: 'spouse', className: (edges) => cn('top-1/3 h-1/3', edges ? 'inset-x-[20%]' : 'inset-x-0') },
  { zone: 'child', className: (edges) => cn('bottom-0 h-1/3', edges ? 'inset-x-[20%]' : 'inset-x-0') },
  { zone: 'before', className: () => 'inset-y-0 left-0 w-[20%]' },
  { zone: 'after', className: () => 'inset-y-0 right-0 w-[20%]' },
];

/**
 * The zones on the card under a dragged card (spec §7.6): the one under the pointer stands out,
 * blocked ones are crossed out. Hidden from screen readers: the status line says the same.
 */
export function DropZones({ results, zone }: { results: ZoneResults; zone: Zone | null }) {
  const { t } = useTranslation();
  const edges = results.before !== undefined;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-photo border-2 border-dashed border-ink"
    >
      {BANDS.map(({ zone: band, className }) => {
        const result = results[band];
        if (result === undefined) return null;
        return (
          <span
            key={band}
            className={cn(
              'absolute flex items-center justify-center px-1 text-center text-xs font-medium',
              className(edges),
              band === zone ? 'bg-ink text-paper' : 'bg-paper/85 text-ink',
              result.kind === 'blocked' && 'line-through',
            )}
          >
            {t(`tree.drag.zone.${band}`)}
          </span>
        );
      })}
    </div>
  );
}
```

`PersonCard.tsx` (keep everything that is there; add):

```tsx
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useCallback, useContext } from 'react';
import { ChangeContext } from './ChangeRunner';
import { justDropped, useDragStore } from './dragStore';
import { DropZones } from './DropZones';

  // In the component:
  const canDrag = useContext(ChangeContext) !== null;
  const drag = useDraggable({ id: person.id, disabled: !canDrag });
  const drop = useDroppable({ id: person.id, disabled: !canDrag });
  const setDragNode = drag.setNodeRef;
  const setDropNode = drop.setNodeRef;
  const wrapperRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDragNode(node);
      setDropNode(node);
    },
    [setDragNode, setDropNode],
  );
  const lifted = useDragStore((state) => state.activeId === person.id);
  const zone = useDragStore((state) => (state.overId === person.id ? state.zone : null));
  const zoneResults = useDragStore((state) => (state.overId === person.id ? state.results : null));
```

- The wrapper `div` gets `ref={wrapperRef}` and `className={cn('group relative', lifted && 'opacity-40')}`.
- The card `button` gets `ref={drag.setActivatorNodeRef}` and `{...(canDrag ? drag.listeners : {})}` (not `drag.attributes`: the button already has its role and name, and dnd-kit's keyboard dragging is replaced by "Change relationship…").
- `onClick={() => { if (!justDropped()) openPerson?.(person.id); }}`.
- After the Polaroid: `{zoneResults === null ? null : <DropZones results={zoneResults} zone={zone} />}`.

`UnlinkedTray.tsx`:
- `TrayPhoto({ person, draggable = false })`: `useDraggable({ id: person.id, disabled: !draggable || !canDrag })` on the wrapper `div` (with `setActivatorNodeRef` and `listeners` on the button, as on the board), `opacity-40` while lifted, and the same `justDropped()` guard on click.
- `TrayStack` renders `<TrayPhoto person={root} draggable />`; the photos inside an open stack are not draggable (spec §7.6: dragging the top person brings the branch).
- `UnlinkedTray`: `const drop = useDroppable({ id: TRAY_ID, disabled: !canDrag })` on the `section`; `const dragging = useDragStore((state) => state.activeId !== null)` and `const over = useDragStore((state) => state.overId === TRAY_ID)`. With no stacks, render nothing unless `dragging`; while dragging with no stacks, render the section with only the heading and `t('tree.drag.trayDrop')`. While `over`, add `rounded-control outline-2 outline-dashed outline-ink` to the section.
- `canDrag` is `useContext(ChangeContext) !== null`, as on the board.

- [ ] **Step 7: The drag context, the status line, the overlay and the edge pan**

Create `apps/web/src/features/tree/TreeDnd.tsx`:

```tsx
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Polaroid, tiltFor } from '../../shared/ui';
import { ChangeContext } from './ChangeRunner';
import { IDLE_DRAG, resetDrag, useDragStore } from './dragStore';
import { dropChange, pointerOf, zoneFor, zoneResults } from './dragZones';
import { blockMessage, changeSentence } from './relateText';
import { useTreeStore } from './store';

/** A mouse drag starts after the pointer moves this far with the button down (spec §7.6). */
export const MOUSE_DISTANCE = 6;

// The board re-measures cards while dragging: the edge pan moves them.
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };
// The status line below speaks for the drag in the page's language; dnd-kit's own English
// announcements and instructions stay silent.
const SILENT = {
  announcements: {
    onDragStart: () => undefined,
    onDragMove: () => undefined,
    onDragOver: () => undefined,
    onDragEnd: () => undefined,
    onDragCancel: () => undefined,
  },
  screenReaderInstructions: { draggable: '' },
};

function DragStatus() {
  const { t } = useTranslation();
  const activeId = useDragStore((state) => state.activeId);
  const overId = useDragStore((state) => state.overId);
  const zone = useDragStore((state) => state.zone);
  const results = useDragStore((state) => state.results);
  const tree = useTreeStore((state) => state.tree);
  const name = (id: string | null) =>
    (id === null ? undefined : tree.persons[id]?.fullName) ?? t('tree.relate.someone');
  let text = '';
  if (activeId !== null) {
    const result = zone === null ? undefined : results?.[zone];
    if (zone === null || result === undefined) {
      text = t('tree.drag.lifted', { name: name(activeId) });
    } else {
      const target =
        zone === 'tray' ? t('tree.drag.target.tray') : t(`tree.drag.target.${zone}`, { name: name(overId) });
      text =
        result.kind === 'ok'
          ? t('tree.drag.willDo', { change: changeSentence(t, tree, result.summary) })
          : result.kind === 'ask'
            ? t('tree.drag.willAsk', { target })
            : t('tree.drag.blocked', { target, reason: blockMessage(t, result.reason) });
    }
  }
  return (
    <p
      role="status"
      className={
        activeId === null
          ? 'sr-only'
          : 'pointer-events-none fixed inset-x-0 top-4 z-30 mx-auto w-fit max-w-xl rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink'
      }
    >
      {text}
    </p>
  );
}

function LiftedCard() {
  const activeId = useDragStore((state) => state.activeId);
  const person = useTreeStore((state) =>
    activeId === null ? undefined : state.tree.persons[activeId],
  );
  if (person === undefined) return null;
  return (
    // Lifted: a slight extra tilt and the lift shadow (spec §7.6 "Starting a drag").
    <div className="rotate-3 rounded-photo shadow-lift">
      <Polaroid
        aria-hidden="true"
        lod="label"
        name={person.fullName}
        label={person.fullName}
        tape="loose"
        tilt={tiltFor(person.id)}
      />
    </div>
  );
}

/** Drag to relate (spec §7.6), around the board and the tray. Viewers get no sensors. */
export function TreeDnd({ canEdit, children }: { canEdit: boolean; children: ReactNode }) {
  const requestChange = useContext(ChangeContext);
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE } });
  const sensors = useSensors(canEdit ? mouse : null);

  const onDragStart = ({ active }: DragStartEvent) => {
    useDragStore.setState({
      ...IDLE_DRAG,
      activeId: String(active.id),
      seenTree: useTreeStore.getState().tree,
    });
  };

  const onDragMove = (event: DragMoveEvent) => {
    const state = useDragStore.getState();
    if (state.activeId === null) return;
    const pointer = pointerOf(event);
    const overId = event.over === null ? null : String(event.over.id);
    if (overId === state.overId) {
      const zone = zoneFor(overId, state.activeId, pointer, event.over?.rect ?? null, state.results);
      useDragStore.setState({ pointer, zone });
      return;
    }
    // A new target: plan its zones once, on the tree as it is now.
    const tree = useTreeStore.getState().tree;
    const results = zoneResults(tree, state.activeId, overId);
    const zone = zoneFor(overId, state.activeId, pointer, event.over?.rect ?? null, results);
    useDragStore.setState({ pointer, overId, zone, results, seenTree: tree });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const state = useDragStore.getState();
    const overId = event.over === null ? null : String(event.over.id);
    const tree = useTreeStore.getState().tree;
    const sameTarget = overId === state.overId;
    const results = sameTarget ? state.results : zoneResults(tree, state.activeId, overId);
    // The pointer's last place decides the zone: the board may have panned under it.
    const zone = zoneFor(overId, state.activeId, pointerOf(event), event.over?.rect ?? null, results);
    const change = dropChange(state.activeId, overId, zone);
    const activeId = state.activeId;
    const seenTree = (sameTarget ? state.seenTree : null) ?? tree;
    resetDrag();
    if (change === null || activeId === null || requestChange === null) return;
    requestChange({ change, focusPersonId: activeId, seenTree });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      measuring={MEASURING}
      accessibility={SILENT}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={resetDrag}
    >
      {children}
      <DragStatus />
      <DragOverlay dropAnimation={null}>
        <LiftedCard />
      </DragOverlay>
    </DndContext>
  );
}
```

If `useSensors` does not accept `null` in the installed version's types, build the list as `canEdit ? [mouse] : []` and pass `useSensors(...list)`.

`TreeBoard.tsx`: add inside `<ReactFlow>`, next to `<RevealNewPeople …/>`:

```tsx
        <EdgePan surface={surface} />
```

with, in the same file:

```tsx
/** Dragging near the board's edge pans it, so far cards can be reached (spec §7.6). */
function EdgePan({ surface }: { surface: RefObject<HTMLDivElement | null> }) {
  const { getViewport, setViewport } = useReactFlow();
  useEffect(() => {
    let frame = 0;
    const step = () => {
      frame = 0;
      const { activeId, pointer } = useDragStore.getState();
      const element = surface.current;
      if (activeId === null || pointer === null || element === null) return;
      const move = edgePan(pointer, element.getBoundingClientRect());
      if (move === null) return;
      const viewport = getViewport();
      void setViewport({ ...viewport, x: viewport.x + move.x, y: viewport.y + move.y });
      frame = requestAnimationFrame(step);
    };
    const unsubscribe = useDragStore.subscribe((state) => {
      if (state.pointer !== null && frame === 0) frame = requestAnimationFrame(step);
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [getViewport, setViewport, surface]);
  return null;
}
```

`TreePage.tsx`: wrap the board and the tray (the `isEmpty` branch's fragment) in `<TreeDnd canEdit={canEdit}>…</TreeDnd>`, inside the `ChangeContext` provider.

- [ ] **Step 8: Run the tests**

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree`
Expected: PASS, the existing card, tray and board tests included (the card's click still opens the profile: no drag was started).

Mutation checks: set `MOUSE_DISTANCE = 0` (the "after about 6 px" assertion fails); make `zoneResults` ignore blocked results (the crossed-out check fails); call `requestChange` when `overId === activeId` (`dragZones.test.ts` fails).

- [ ] **Step 9: Run the whole check, then commit**

Prettier, then `pnpm check` (exit 0). The build must still split React Flow and dnd-kit into the lazy tree chunk: `TreeDnd` is imported only from `TreePage`.

Commit message (`.superpowers/sdd/p6c-task-8-commit.txt`):

```
feat(web): drag to relate with the mouse

Built on @dnd-kit/core. A drag starts after 6 px; the lifted card
tilts with a shadow and the original fades. Thirds of the target are
parent, spouse and child, and a sibling's side fifths are before and
after; the zones are labelled, blocked ones crossed out, and a polite
status line says what the drop will do. The board pans near its
edges. Esc, empty space or the card's own place cancel; the tray
detaches. Every drop goes through the change runner (spec 7.6).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 9: Touch — long press to drag

Spec §7.6 "Touch": a long press (about 400 ms, moving less than about 8 px) picks a card up; a swipe, even one that starts on a card, still pans; on touch the long press does not open the card menu (its actions are the profile's buttons).

**Files:**
- Modify: `TreeDnd.tsx`, `PersonCard.tsx`, `UnlinkedTray.tsx`
- Test: `apps/web/src/features/tree/Touch.test.tsx` (new)

**Interfaces:**
- Consumes: `TreeDnd`, `useDragStore` (Task 8).
- Produces: `TOUCH_DELAY_MS = 400`, `TOUCH_TOLERANCE = 8` (exported from `TreeDnd.tsx`). The card's touch handlers are written inline in `PersonCard.tsx`.

How the three needs are met:
1. **Pan with a swipe.** React Flow does not pan from inside an element with the `nopan` class. The card button loses its static `nopan`; the card wrapper adds `nopan` in a capturing `pointerdown` handler only when `pointerType !== 'touch'`, and removes it for touch. `pointerdown` comes before `mousedown`/`touchstart`, which is where React Flow (d3-zoom) decides, so a mouse press never pans and a finger does.
2. **Long press drags, and stops the pan.** dnd-kit's `TouchSensor` with `{ delay: 400, tolerance: 8 }` activates after the press. From then on, a native `touchmove` listener on the card wrapper (bubbling, so after dnd-kit's own listener on the button) calls `stopPropagation()` while a drag is active, so the board under the card does not pan along. React's synthetic events cannot do this: React listens at the root, after the board has seen the event.
3. **No menu on touch.** Radix's context-menu trigger opens on a 700 ms touch long press and on `contextmenu`. Its handlers are skipped when an earlier handler called `preventDefault()`: the button's `onPointerDown` does that for `pointerType === 'touch'` (a tap still fires `click`), and `onContextMenu` does it when the last pointer down was a touch.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/tree/Touch.test.tsx`:

```tsx
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { resetDrag, useDragStore } from './dragStore';
import { CLAN_ID, FAMILY, ME, SON } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { EDITOR, editableTree } from './testKit';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  vi.useRealTimers();
  resetDrag();
  resetTreeStore();
  vi.unstubAllGlobals();
});

/** jsdom has no PointerEvent: a mouse event with the pointer's type. */
function pointerDown(target: Element, pointerType: 'mouse' | 'touch') {
  const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(target, event);
  return event;
}

function touch(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] };
}

describe('touch', () => {
  it('keeps nopan for the mouse only, so a swipe on a card pans the board', async () => {
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    const wrapper = nam.parentElement as HTMLElement;
    pointerDown(nam, 'mouse');
    expect(wrapper).toHaveClass('nopan');
    pointerDown(nam, 'touch');
    expect(wrapper).not.toHaveClass('nopan');
    expect(nam).not.toHaveClass('nopan');
  });

  it('picks a card up after a 400 ms press, and not when the finger moves first', async () => {
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    vi.useFakeTimers();

    fireEvent.touchStart(nam, touch(0, 0));
    fireEvent.touchMove(nam, touch(20, 0));
    act(() => vi.advanceTimersByTime(500));
    expect(useDragStore.getState().activeId).toBeNull();
    fireEvent.touchEnd(nam, touch(20, 0));

    fireEvent.touchStart(nam, touch(0, 0));
    act(() => vi.advanceTimersByTime(399));
    expect(useDragStore.getState().activeId).toBeNull();
    act(() => vi.advanceTimersByTime(2));
    expect(useDragStore.getState().activeId).toBe(SON);
    fireEvent.touchEnd(nam, touch(0, 0));
  });

  it('opens no card menu on a touch long press', async () => {
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    vi.useFakeTimers();
    const down = pointerDown(nam, 'touch');
    expect(down.defaultPrevented).toBe(true);
    act(() => vi.advanceTimersByTime(800));
    fireEvent.contextMenu(nam);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree/Touch.test.tsx`
Expected: FAIL.

- [ ] **Step 2: The touch sensor**

`TreeDnd.tsx`:

```tsx
/** A long press picks a card up (spec §7.6 "Touch"); moving more first is a swipe. */
export const TOUCH_DELAY_MS = 400;
export const TOUCH_TOLERANCE = 8;

  // In TreeDnd:
  const touch = useSensor(TouchSensor, {
    activationConstraint: { delay: TOUCH_DELAY_MS, tolerance: TOUCH_TOLERANCE },
  });
  const sensors = useSensors(canEdit ? mouse : null, canEdit ? touch : null);
```

(Import `TouchSensor` from `@dnd-kit/core`.)

- [ ] **Step 3: The card on touch**

`PersonCard.tsx`:

```tsx
  // The last pointer down on this card was a finger: its contextmenu is the long press's.
  const touched = useRef(false);
  const wrapper = useRef<HTMLDivElement | null>(null);
  // While a drag is on, the board under the card must not pan with the finger (see TreeDnd).
  useEffect(() => {
    const element = wrapper.current;
    if (element === null) return;
    const stop = (event: TouchEvent) => {
      if (useDragStore.getState().activeId !== null) event.stopPropagation();
    };
    element.addEventListener('touchmove', stop);
    return () => element.removeEventListener('touchmove', stop);
  }, []);
```

- `wrapperRef` (Task 8) also sets `wrapper.current = node`.
- The wrapper gets `onPointerDownCapture={(event) => event.currentTarget.classList.toggle('nopan', event.pointerType !== 'touch')}` and `select-none [-webkit-touch-callout:none]` in its class.
- The button's class loses `nopan` (keep `nodrag`); its comment says the wrapper adds `nopan` for the mouse.
- The button gets:

```tsx
          onPointerDown={(event) => {
            touched.current = event.pointerType === 'touch';
            // Radix's trigger skips its 700 ms touch long press when this is prevented; a tap
            // still clicks. On touch the long press is for dragging (spec §7.6).
            if (touched.current) event.preventDefault();
          }}
          onContextMenu={(event) => {
            if (touched.current) event.preventDefault();
          }}
```

`UnlinkedTray.tsx` `TrayPhoto`: the tray is not on the board, so only the menu part applies; the tray photos have no card menu today, so nothing changes there beyond Task 8.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @ancestors-tree/web exec vitest run src/features/tree`
Expected: PASS, `CardMenu.test.tsx` included (mouse right-click and Shift+F10 still open the menu).

Mutation checks: keep `nopan` on the button (test 1 fails); drop `preventDefault` in `onPointerDown` (test 3 fails); set `TOUCH_DELAY_MS = 0` (test 2 fails).

- [ ] **Step 5: Run the whole check, then commit**

Prettier, then `pnpm check` (exit 0).

Commit message (`.superpowers/sdd/p6c-task-9-commit.txt`):

```
feat(web): long press to drag on touch

A 400 ms press with under 8 px of movement picks a card up; a swipe
that starts on a card still pans the board, because the card keeps
nopan for the mouse only. Once a drag is on, the board stops panning
under the finger, and the long press no longer opens the card menu
(spec 7.6).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 10: End-to-end tests

**Files:**
- Create: `e2e/relate.spec.ts`
- Modify: `e2e/support.ts`

**Interfaces:**
- Consumes: the whole feature; `register`, `createTree`, `addPerson`, `cardOf`, `openProfile`, `expectNoSeriousA11yViolations` (support.ts).
- Produces: `support.ts` `dragOnto(page, from: Locator, to: Locator, where: 'top' | 'middle' | 'bottom' | 'left' | 'right'): Promise<void>`, `longPressDrag(page, from: Locator, to: Locator, where): Promise<void>` (Chromium touch through CDP).

- [ ] **Step 1: The drag helpers**

Append to `e2e/support.ts`:

```ts
const ZONE_POINT = {
  top: { x: 0.5, y: 1 / 6 },
  middle: { x: 0.5, y: 0.5 },
  bottom: { x: 0.5, y: 5 / 6 },
  left: { x: 0.1, y: 0.5 },
  right: { x: 0.9, y: 0.5 },
} as const;

async function centreOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('not on screen');
  return { box, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags one card onto a zone of another with the mouse (spec §7.6). */
export async function dragOnto(
  page: Page,
  from: Locator,
  to: Locator,
  where: keyof typeof ZONE_POINT,
): Promise<void> {
  const start = await centreOf(from);
  const { box } = await centreOf(to);
  const point = ZONE_POINT[where];
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Past the 6 px that start a drag, then on to the zone.
  await page.mouse.move(start.x + 12, start.y, { steps: 3 });
  await page.mouse.move(box.x + box.width * point.x, box.y + box.height * point.y, { steps: 12 });
  await expect(page.getByRole('status').filter({ hasText: /^(Thả để|.*: khi thả|.*: không được)/ }))
    .toBeVisible();
  await page.mouse.up();
}

/** The same with a finger: a long press, then a move (Chromium, through CDP). */
export async function longPressDrag(
  page: Page,
  from: Locator,
  to: Locator,
  where: keyof typeof ZONE_POINT,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const start = await centreOf(from);
  const { box } = await centreOf(to);
  const point = ZONE_POINT[where];
  const touchAt = (type: string, x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  await touchAt('touchStart', start.x, start.y);
  // No fixed sleep: the status line says when the card is lifted (after about 400 ms).
  await expect(page.getByRole('status').filter({ hasText: /^Đang kéo/ })).toBeVisible();
  const end = { x: box.x + box.width * point.x, y: box.y + box.height * point.y };
  for (let step = 1; step <= 12; step += 1) {
    await touchAt(
      'touchMove',
      start.x + ((end.x - start.x) * step) / 12,
      start.y + ((end.y - start.y) * step) / 12,
    );
  }
  await touchAt('touchEnd', end.x, end.y);
  await cdp.detach();
}
```

(Import `type Locator` from `@playwright/test` at the top.)

- [ ] **Step 2: The specs**

Create `e2e/relate.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import {
  addPerson,
  cardOf,
  createTree,
  dragOnto,
  expectNoSeriousA11yViolations,
  longPressDrag,
  openProfile,
  register,
} from './support.ts';

/** A tree with a progenitor and, in Loose photos, three people added at once. */
async function treeWithLoosePhotos(page: import('@playwright/test').Page, slug: string) {
  await page.goto('/register');
  await register(page, 'Minh', slug);
  await createTree(page, 'Họ Phạm');
  await page.getByRole('button', { name: 'Thêm người đầu tiên' }).click();
  await addPerson(page, 'Phạm Văn Cả');
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await panel.getByRole('button', { name: 'Chọn làm thuỷ tổ' }).click();
  await panel.getByRole('button', { name: 'Đóng hồ sơ' }).click();

  await page
    .getByRole('group', { name: 'Công cụ của cây' })
    .getByRole('button', { name: 'Thêm nhiều người' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Thêm nhiều người' });
  const names = ['Phạm Văn Hai', 'Nguyễn Thị Ba', 'Phạm Thị Tư'];
  for (const [at, name] of names.entries()) {
    await dialog.getByRole('group', { name: `Người thứ ${at + 1}` }).getByLabel('Họ và tên').fill(name);
  }
  await dialog.getByRole('button', { name: 'Thêm vào cây' }).click();
  await expect(dialog).toBeHidden();
  const tray = page.getByRole('region', { name: 'Ảnh chưa dán' });
  for (const name of names) await expect(cardOf(page, name)).toBeVisible();
  return tray;
}

test('drag loose photos onto the tree, reorder siblings, undo from the toast', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'mouse drag');
  const tray = await treeWithLoosePhotos(page, 'drag');

  await dragOnto(page, cardOf(page, 'Phạm Văn Hai'), cardOf(page, 'Phạm Văn Cả'), 'bottom');
  await expect(page.getByText('Đã đổi: Phạm Văn Hai thành con của Phạm Văn Cả')).toBeVisible();
  await expect(cardOf(page, 'Phạm Văn Hai')).toHaveAccessibleName(/đời thứ 2/);
  await expect(cardOf(page, 'Phạm Văn Hai')).toBeFocused();
  // The drop did not open the profile.
  await expect(page.getByRole('complementary')).toHaveCount(0);

  await dragOnto(page, cardOf(page, 'Phạm Thị Tư'), cardOf(page, 'Phạm Văn Cả'), 'bottom');
  await expect(cardOf(page, 'Phạm Thị Tư')).toHaveAccessibleName(/đời thứ 2/);
  // Tư before Hai: the left fifth of a sibling.
  await dragOnto(page, cardOf(page, 'Phạm Thị Tư'), cardOf(page, 'Phạm Văn Hai'), 'left');
  await expect(page.getByText('Đã đổi: Phạm Thị Tư xếp trước Phạm Văn Hai')).toBeVisible();

  await page.getByRole('button', { name: 'Hoàn tác thay đổi này' }).click();
  await expect(page.getByRole('button', { name: 'Hoàn tác thay đổi này' })).toBeHidden();

  // A card dropped on the tray leaves the tree.
  await dragOnto(page, cardOf(page, 'Phạm Văn Hai'), tray, 'middle');
  await expect(page.getByText('Đã đổi: Phạm Văn Hai chuyển vào Ảnh chưa dán')).toBeVisible();
  await expect(tray.getByRole('button', { name: 'Phạm Văn Hai' })).toBeVisible();

  // Esc cancels: nothing changes, no toast.
  const before = await page.getByText(/^Đã đổi:/).textContent();
  const nguyen = await cardOf(page, 'Nguyễn Thị Ba').boundingBox();
  if (nguyen === null) throw new Error('no card');
  await page.mouse.move(nguyen.x + 10, nguyen.y + 10);
  await page.mouse.down();
  await page.mouse.move(nguyen.x + 60, nguyen.y + 10, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByText(/^Đã đổi:/)).toHaveText(before ?? '');
  await expect(page.getByText('Đã lưu', { exact: true })).toBeVisible();
});

test('change relationships from the keyboard, then cut a thread', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard and pointer pins');
  await treeWithLoosePhotos(page, 'keys');

  await cardOf(page, 'Phạm Văn Cả').focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Đổi quan hệ…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Đổi quan hệ của Phạm Văn Cả' });
  await dialog.getByRole('radio', { name: 'Vợ/chồng của Phạm Văn Cả' }).check();
  await dialog.getByRole('searchbox', { name: 'Tìm theo tên' }).fill('nguyen thi ba');
  await dialog.getByRole('option', { name: /Nguyễn Thị Ba/ }).click();
  await dialog.getByRole('button', { name: 'Áp dụng' }).click();
  await expect(page.getByText('Đã đổi: Nguyễn Thị Ba và Phạm Văn Cả thành vợ chồng')).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Vợ/chồng' })).toContainText('Nguyễn Thị Ba');

  await dialog.getByRole('radio', { name: 'Con của Phạm Văn Cả' }).check();
  await dialog.getByRole('searchbox', { name: 'Tìm theo tên' }).fill('hai');
  await dialog.getByRole('option', { name: /Phạm Văn Hai/ }).click();
  await dialog.getByRole('button', { name: 'Áp dụng' }).click();
  await expect(
    page.getByText('Đã đổi: Phạm Văn Hai thành con của Phạm Văn Cả và Nguyễn Thị Ba'),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await dialog.getByRole('button', { name: 'Xong' }).click();
  await expect(cardOf(page, 'Phạm Văn Cả')).toBeFocused();

  // Cut: the thread's pin is a pointer-only button.
  await page.getByRole('button', { name: 'Chỉ nối Phạm Văn Hai với cha mẹ', includeHidden: true }).click();
  await page.getByRole('button', { name: 'Cắt chỉ' }).click();
  await expect(
    page.getByText('Đã đổi: Phạm Văn Hai không còn là con của Phạm Văn Cả và Nguyễn Thị Ba'),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Ảnh chưa dán' }).getByRole('button', { name: 'Phạm Văn Hai' }),
  ).toBeVisible();
});

test('long press drags on touch', async ({ page, browserName }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile' || browserName !== 'chromium', 'touch through CDP');
  await treeWithLoosePhotos(page, 'touch');
  await longPressDrag(page, cardOf(page, 'Phạm Văn Hai'), cardOf(page, 'Phạm Văn Cả'), 'bottom');
  await expect(page.getByText('Đã đổi: Phạm Văn Hai thành con của Phạm Văn Cả')).toBeVisible();
  // The long press opened no card menu.
  await expect(page.getByRole('menu')).toHaveCount(0);
});
```

The third test runs only on the `mobile` project (Pixel 7, Chromium), where `treeWithLoosePhotos` closes the profile with its close button before using the toolbar. The swipe that pans is covered by Task 9's unit test (the `nopan` toggle).

- [ ] **Step 3: Run them**

Run: `pnpm e2e e2e/relate.spec.ts` (Playwright's config starts the API and web servers, as for the other specs).
Expected: PASS on both projects (the skipped ones reported as skipped).

- [ ] **Step 4: Run the whole check, then commit**

Prettier on the two files, `pnpm check` (exit 0), and the full e2e suite once: `pnpm e2e` (exit 0).

Commit message (`.superpowers/sdd/p6c-task-10-commit.txt`):

```
test(e2e): drag to relate, Change relationship…, Cut and touch

Drags loose photos onto the tree and onto a sibling's edge, undoes
from the toast, detaches onto the tray and cancels with Esc; adds a
spouse and a child from the keyboard dialog (axe-clean) and cuts a
thread from its pin; and long-presses to drag on touch.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 11: Docs, ADR 0010 and the roadmap

**Files:**
- Create: `docs/adr/0010-relate-rules-and-drag.md`
- Modify: `docs/superpowers/specs/2026-11-11-ancestors-tree-design.md`, `docs/superpowers/specs/2026-11-11-ancestors-tree-design.vi.md`, `docs/superpowers/plans/2026-11-12-roadmap.md`

- [ ] **Step 1: ADR 0010**

Read `docs/adr/0009-profile-panel-in-the-url.md` for the format (headings, status line, date), then write `docs/adr/0010-relate-rules-and-drag.md` in the same format:

- **Context:** P6c lets editors change relationships four ways (drag, "Change relationship…", Cut, Move earlier/later) and must never offer a change the server refuses.
- **Decision:**
  1. One pure rule set in `packages/shared/src/tree/relate.ts` (`relate`) and `relationships.ts` (cuts, detach, status), answering an op, a question or a block. Each step runs through `applyOp` on a working copy (`Draft`), so the server's own checks (cycles, partners, limits) decide.
  2. The web wraps them in `planChange` and one change runner: questions, the re-check on the latest tree before applying (`decide`: a different outcome shows "the tree has just changed"), one `batch` op, the Undo toast.
  3. Dragging uses `@dnd-kit/core` (mouse after 6 px, touch after a 400 ms press with under 8 px of movement, `pointerWithin`, measured always). dnd-kit's keyboard dragging and announcements are not used: the keyboard way is the dialog, and the page's own polite status line speaks in Vietnamese or English.
  4. Touch and the board's pan: the card has `nopan` for the mouse only; once a touch drag starts, a native `touchmove` listener on the card stops the board panning; the Radix card menu's touch long press is turned off.
- **Alternatives considered:** React Flow's own node dragging (it moves nodes freely and stores positions, while positions come from the layout, spec §7.4); `react-dnd` (HTML5 drag events have no touch support); writing the pointer handling by hand (dnd-kit already handles activation, cancel on Esc and the overlay).
- **Consequences:** a new dependency in the lazy tree chunk; the rules are shared, so a future server-side "relate" endpoint or AI import (§10) can reuse them; the nudge (P7) adds a display offset on the "near its place" drop that cancels today.

- [ ] **Step 2: The spec, in both languages**

In §7.6 of both spec files, record what P6c settled that the spec does not say yet (EN and VI in the same commit, the VI text natural Vietnamese):
- Only a stack's top person can be dragged out of Loose photos; the others are listed when the stack opens.
- A drop on a blocked zone does nothing and shows the reason in the toast area.
- In "Change relationship…", the search ignores accents and case, and lists at most 20 matches.
- The Undo in the toast undoes that change only while it is the latest one; after another change, the toast's Undo goes away (↶ still works).
- A divorced marriage is drawn as a stitch broken in the middle.

In the roadmap, mark P6c done (the way P6a and P6b are marked), and keep the nudge under P7.

- [ ] **Step 3: Check and commit**

Run `pnpm check` (exit 0; it includes the docs checks).

Commit message (`.superpowers/sdd/p6c-task-11-commit.txt`):

```
docs: ADR 0010 relate rules and drag; spec and roadmap for P6c

Records why the rules live in shared and run through applyOp, why
dragging uses @dnd-kit/core without its keyboard mode, and how touch
shares the board with panning. The spec (EN and VI) notes what P6c
settled, and the roadmap marks P6c done.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
