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
    draft.push({
      type: 'updateUnion',
      payload: { id: union.id, changes: { partnerIds: [keeperId] } },
    });
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
    draft.push({
      type: 'updateUnion',
      payload: { id: unionId, changes: { partnerIds: [kept, a] } },
    });
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

function reorder(
  tree: TreeState,
  a: string,
  b: string,
  relation: 'before' | 'after',
): RelateResult {
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
