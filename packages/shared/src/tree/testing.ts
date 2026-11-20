import fc from 'fast-check';
import { applyOp } from './apply-op.ts';
import { OpError } from './op-error.ts';
import type { Op, SingleOp } from './ops.ts';
import type { Person, Union } from './schemas.ts';
import { EMPTY_TREE, treeStateFromLists, type TreeState } from './state.ts';
import { LINE_STYLES, SURFACES, type LineStyle, type Surface } from './theme.ts';

/** A readable, valid ObjectId for tests: testId(1) = "000…001". */
export function testId(n: number): string {
  return n.toString(16).padStart(24, '0');
}

export function makePerson(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    fullName: `Person ${id.slice(-4)}`,
    aliases: [],
    gender: 'male',
    death: { isDeceased: false },
    isAdopted: false,
    ...overrides,
  };
}

export function makeUnion(id: string, partnerIds: string[], overrides: Partial<Union> = {}): Union {
  return { id, partnerIds, order: 1, status: 'married', ...overrides };
}

export function treeOf(
  persons: Person[],
  unions: Union[] = [],
  progenitorId: string | null = null,
): TreeState {
  return treeStateFromLists(progenitorId, persons, unions);
}

/** Independent of apply-op.ts on purpose: a second, simpler cycle check. */
function isOwnAncestorSlow(tree: TreeState, personId: string): boolean {
  const seen = new Set<string>();
  const stack = [personId];
  for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
    const unionId = tree.persons[current]?.parentUnionId;
    const union =
      unionId === undefined || !Object.hasOwn(tree.unions, unionId)
        ? undefined
        : tree.unions[unionId];
    for (const parentId of union?.partnerIds ?? []) {
      if (parentId === personId) return true;
      if (!seen.has(parentId)) {
        seen.add(parentId);
        stack.push(parentId);
      }
    }
  }
  return false;
}

/** Every broken tree invariant as a short message; [] for a valid tree. */
export function invariantViolations(tree: TreeState): string[] {
  const problems: string[] = [];
  for (const [id, person] of Object.entries(tree.persons)) {
    if (person.id !== id) problems.push(`person ${id} is stored under another id`);
    if (person.parentUnionId !== undefined && !Object.hasOwn(tree.unions, person.parentUnionId)) {
      problems.push(`person ${id} points at a missing union`);
    }
    if (isOwnAncestorSlow(tree, id)) problems.push(`person ${id} is their own ancestor`);
  }
  for (const [id, union] of Object.entries(tree.unions)) {
    if (union.id !== id) problems.push(`union ${id} is stored under another id`);
    if (Object.hasOwn(tree.persons, id)) problems.push(`id ${id} is both a person and a union`);
    const partners = union.partnerIds;
    if (partners.length < 1 || partners.length > 2 || new Set(partners).size !== partners.length) {
      problems.push(`union ${id} has wrong partners`);
    }
    for (const partnerId of partners) {
      if (!Object.hasOwn(tree.persons, partnerId)) {
        problems.push(`union ${id} has a missing partner`);
      }
    }
  }
  if (tree.progenitorId !== null && !Object.hasOwn(tree.persons, tree.progenitorId)) {
    problems.push('the progenitor is missing');
  }
  return problems;
}

/** Indexes pick an existing person or union (modulo the count), so most commands apply. */
export type TreeCommand =
  | { kind: 'addPerson'; parent: number | null }
  | { kind: 'addUnion'; a: number; b: number | null }
  | { kind: 'updatePerson'; target: number; name: string; clearBio: boolean }
  | { kind: 'updateUnion'; target: number; a: number; b: number | null }
  | { kind: 'deletePerson'; target: number }
  | { kind: 'deleteUnion'; target: number }
  | { kind: 'setParents'; target: number; union: number | null }
  | { kind: 'setProgenitor'; target: number | null }
  | { kind: 'setTreeTheme'; surface: Surface | null; thread: LineStyle | null }
  /** Applies the inverse of the latest change not undone yet (restore ops come from here). */
  | { kind: 'undo' };

const index = fc.nat({ max: 50 });

/** One random edit of a tree, for property tests. */
export const treeCommand: fc.Arbitrary<TreeCommand> = fc.oneof(
  fc.record({ kind: fc.constant('addPerson' as const), parent: fc.option(index) }),
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant('addUnion' as const), a: index, b: fc.option(index) }),
  },
  fc.record({
    kind: fc.constant('updatePerson' as const),
    target: index,
    name: fc.string({ minLength: 1, maxLength: 8 }),
    clearBio: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant('updateUnion' as const),
    target: index,
    a: index,
    b: fc.option(index),
  }),
  fc.record({ kind: fc.constant('deletePerson' as const), target: index }),
  { weight: 5, arbitrary: fc.record({ kind: fc.constant('deleteUnion' as const), target: index }) },
  fc.record({ kind: fc.constant('setParents' as const), target: index, union: fc.option(index) }),
  fc.record({ kind: fc.constant('setProgenitor' as const), target: fc.option(index) }),
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('setTreeTheme' as const),
      surface: fc.option(fc.constantFrom(...SURFACES)),
      thread: fc.option(fc.constantFrom(...LINE_STYLES)),
    }),
  },
  { weight: 6, arbitrary: fc.constant({ kind: 'undo' as const }) },
);

function pick(ids: readonly string[], at: number): string | undefined {
  return ids.length === 0 ? undefined : ids[at % ids.length];
}

function partners(a: string, b: string | undefined): string[] {
  return b !== undefined && b !== a ? [a, b] : [a];
}

/** Turns a command into an op on this tree, or null when there is nothing to act on. */
export function treeCommandOp(
  tree: TreeState,
  cmd: TreeCommand,
  nextId: () => string,
): SingleOp | null {
  const people = Object.keys(tree.persons).sort();
  const unions = Object.keys(tree.unions).sort();
  switch (cmd.kind) {
    case 'addPerson': {
      const parent = cmd.parent === null ? undefined : pick(unions, cmd.parent);
      const person = makePerson(nextId(), parent === undefined ? {} : { parentUnionId: parent });
      return { type: 'addPerson', payload: person };
    }
    case 'addUnion': {
      const a = pick(people, cmd.a);
      if (a === undefined) return null;
      const b = cmd.b === null ? undefined : pick(people, cmd.b);
      return { type: 'addUnion', payload: makeUnion(nextId(), partners(a, b)) };
    }
    case 'updatePerson': {
      const id = pick(people, cmd.target);
      if (id === undefined) return null;
      const changes = cmd.clearBio
        ? { bio: null }
        : { fullName: cmd.name.trim() || 'x', bio: cmd.name };
      return { type: 'updatePerson', payload: { id, changes } };
    }
    case 'updateUnion': {
      const id = pick(unions, cmd.target);
      const a = pick(people, cmd.a);
      if (id === undefined || a === undefined) return null;
      const b = cmd.b === null ? undefined : pick(people, cmd.b);
      return {
        type: 'updateUnion',
        payload: { id, changes: { partnerIds: partners(a, b), status: 'divorced' } },
      };
    }
    case 'deletePerson': {
      const id = pick(people, cmd.target);
      return id === undefined ? null : { type: 'deletePerson', payload: { id } };
    }
    case 'deleteUnion': {
      const id = pick(unions, cmd.target);
      return id === undefined ? null : { type: 'deleteUnion', payload: { id } };
    }
    case 'setParents': {
      const personId = pick(people, cmd.target);
      if (personId === undefined) return null;
      const parentUnionId = cmd.union === null ? null : (pick(unions, cmd.union) ?? null);
      return { type: 'setParents', payload: { personId, parentUnionId } };
    }
    case 'setProgenitor': {
      const personId = cmd.target === null ? null : (pick(people, cmd.target) ?? null);
      return { type: 'setProgenitor', payload: { personId } };
    }
    case 'setTreeTheme':
      return {
        type: 'setTreeTheme',
        payload: { changes: { surface: cmd.surface, thread: cmd.thread } },
      };
    case 'undo':
      // Handled by the caller: an undo needs the stored inverses, not the tree.
      return null;
  }
}

/** testId(1), testId(2)… in turn: the ids a generated tree uses. */
export function idMaker(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return testId(counter);
  };
}

/** Applies the op, or answers null when applyOp refuses it. */
function tryApply(tree: TreeState, op: Op): { tree: TreeState; inverse: Op } | null {
  try {
    return applyOp(tree, op);
  } catch (error) {
    if (error instanceof OpError) return null;
    throw error;
  }
}

/**
 * A valid tree made by random edits (and undos) of a few starting people; ids are small testIds.
 * The starting people keep most trees from being empty: the edits delete more than they add.
 */
export function arbitraryTree(): fc.Arbitrary<TreeState> {
  const start = fc.array(fc.constant<TreeCommand>({ kind: 'addPerson', parent: null }), {
    minLength: 2,
    maxLength: 10,
  });
  const edits = fc.array(treeCommand, { maxLength: 60, size: 'max' });
  return fc.tuple(start, edits).map(([people, commands]) => {
    const nextId = idMaker();
    let tree = EMPTY_TREE;
    const undoStack: Op[] = [];
    for (const cmd of [...people, ...commands]) {
      const op = cmd.kind === 'undo' ? undoStack.pop() : treeCommandOp(tree, cmd, nextId);
      const result = op ? tryApply(tree, op) : null;
      if (!result) continue;
      tree = result.tree;
      if (cmd.kind !== 'undo') undoStack.push(result.inverse);
    }
    return tree;
  });
}
