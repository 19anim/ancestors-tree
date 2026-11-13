import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyOp, type ApplyOpResult } from './apply-op.ts';
import { OpError } from './op-error.ts';
import type { Op, SingleOp } from './ops.ts';
import { EMPTY_TREE, type TreeState } from './state.ts';
import { invariantViolations, makePerson, makeUnion, testId } from './testing.ts';

/** Indexes pick an existing person or union (modulo the count), so most commands apply. */
type Command =
  | { kind: 'addPerson'; parent: number | null }
  | { kind: 'addUnion'; a: number; b: number | null }
  | { kind: 'updatePerson'; target: number; name: string; clearBio: boolean }
  | { kind: 'updateUnion'; target: number; a: number; b: number | null }
  | { kind: 'deletePerson'; target: number }
  | { kind: 'deleteUnion'; target: number }
  | { kind: 'setParents'; target: number; union: number | null }
  | { kind: 'setProgenitor'; target: number | null };

const index = fc.nat({ max: 50 });
const command: fc.Arbitrary<Command> = fc.oneof(
  fc.record({ kind: fc.constant('addPerson' as const), parent: fc.option(index) }),
  fc.record({ kind: fc.constant('addUnion' as const), a: index, b: fc.option(index) }),
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
  fc.record({ kind: fc.constant('deleteUnion' as const), target: index }),
  fc.record({ kind: fc.constant('setParents' as const), target: index, union: fc.option(index) }),
  fc.record({ kind: fc.constant('setProgenitor' as const), target: fc.option(index) }),
);

function pick(ids: readonly string[], at: number): string | undefined {
  return ids.length === 0 ? undefined : ids[at % ids.length];
}

function partners(a: string, b: string | undefined): string[] {
  return b !== undefined && b !== a ? [a, b] : [a];
}

/** Turns a command into an op on this tree, or null when there is nothing to act on. */
function toOp(tree: TreeState, cmd: Command, nextId: () => string): SingleOp | null {
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
  }
}

function tryApply(tree: TreeState, op: Op): ApplyOpResult | null {
  try {
    return applyOp(tree, op);
  } catch (error) {
    if (error instanceof OpError) return null;
    throw error;
  }
}

/** Applies op; checks immutability, invariants and the inverse round trip on success. */
function step(tree: TreeState, op: Op): TreeState {
  const before = structuredClone(tree);
  const result = tryApply(tree, op);
  expect(tree).toEqual(before);
  if (!result) return tree;
  expect(invariantViolations(result.tree)).toEqual([]);
  expect(applyOp(result.tree, result.inverse).tree).toEqual(before);
  return result.tree;
}

function idMaker(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return testId(counter);
  };
}

describe('applyOp properties', () => {
  it('keeps the tree valid, never mutates it, and every inverse restores it exactly', () => {
    fc.assert(
      fc.property(fc.array(command, { maxLength: 60 }), (commands) => {
        const nextId = idMaker();
        let tree = EMPTY_TREE;
        for (const cmd of commands) {
          const op = toOp(tree, cmd, nextId);
          if (op) tree = step(tree, op);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('round-trips batches', () => {
    fc.assert(
      fc.property(
        fc.array(command, { maxLength: 30 }),
        fc.array(fc.array(command, { minLength: 1, maxLength: 4 }), { maxLength: 8 }),
        (setup, groups) => {
          const nextId = idMaker();
          let tree = EMPTY_TREE;
          for (const cmd of setup) {
            const op = toOp(tree, cmd, nextId);
            if (op) tree = step(tree, op);
          }
          for (const group of groups) {
            // Build each child op against the tree as the batch will see it.
            const ops: SingleOp[] = [];
            let preview = tree;
            for (const cmd of group) {
              const op = toOp(preview, cmd, nextId);
              const result = op ? tryApply(preview, op) : null;
              if (op && result) {
                ops.push(op);
                preview = result.tree;
              }
            }
            if (ops.length > 0) tree = step(tree, { type: 'batch', payload: { ops } });
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
