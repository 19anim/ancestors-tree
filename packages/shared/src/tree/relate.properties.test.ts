import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyOp } from './apply-op.ts';
import { OpError } from './op-error.ts';
import { OpSchema, type BatchOp } from './ops.ts';
import { ALONE, relate, type Relation, type RelateResult } from './relate.ts';
import { cutMarriage, detach } from './relationships.ts';
import type { TreeState } from './state.ts';
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

function parentIdsOf(tree: TreeState, personId: string): readonly string[] {
  const unionId = tree.persons[personId]?.parentUnionId;
  return unionId === undefined ? [] : (tree.unions[unionId]?.partnerIds ?? []);
}

/** How many one-person unions each person is the partner of. */
function aloneCounts(tree: TreeState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const union of Object.values(tree.unions)) {
    const [only] = union.partnerIds;
    if (union.partnerIds.length === 1 && only !== undefined) {
      counts.set(only, (counts.get(only) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The op passes the server's schema and applyOp, keeps the tree valid, and gives no one a second
 * one-person union (two knots for "only B"; a tree that already had two keeps them).
 */
function checkOp(tree: TreeState, op: BatchOp): void {
  expect(() => OpSchema.parse(op)).not.toThrow();
  const next = applyOp(tree, op).tree;
  expect(invariantViolations(next)).toEqual([]);
  const before = aloneCounts(tree);
  for (const [personId, count] of aloneCounts(next)) {
    expect(count).toBeLessThanOrEqual(Math.max(1, before.get(personId) ?? 0));
  }
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
          checkOp(tree, result.op);
          // The progenitor never gains a parent through relate (spec §7.6).
          const progenitor = tree.progenitorId;
          if (progenitor === null) return;
          const had = parentIdsOf(tree, progenitor);
          const now = parentIdsOf(applyOp(tree, result.op).tree, progenitor);
          expect(now.filter((id) => !had.includes(id))).toEqual([]);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('cuts a marriage, or drops someone on the tray, with ops of the same quality', () => {
    fc.assert(
      fc.property(arbitraryTree(), fc.nat(), fc.nat(), (tree, i, j) => {
        const unionIds = Object.keys(tree.unions);
        const unionId = unionIds[i % Math.max(1, unionIds.length)];
        if (unionId !== undefined) {
          const union = tree.unions[unionId];
          for (const keepWith of [undefined, ...(union?.partnerIds ?? [])]) {
            const result = cutMarriage(tree, unionId, keepWith);
            if (result.kind === 'ok') checkOp(tree, result.op);
          }
        }
        const ids = Object.keys(tree.persons);
        const personId = ids[j % ids.length] as string;
        const result = detach(tree, personId);
        if (result.kind === 'ok') checkOp(tree, result.op);
      }),
      { numRuns: 500 },
    );
  });

  it('never blocks with an OpError code that applyOp would not raise', () => {
    let cycles = 0;
    fc.assert(
      fc.property(arbitraryTree(), (tree) => {
        // Every pair: a cycle needs A to be B's grandparent or older, which few trees have.
        const ids = Object.keys(tree.persons);
        for (const a of ids) {
          for (const b of ids) {
            const result = relate(tree, a, b, 'child', { union: ALONE });
            if (result.kind !== 'blocked' || result.reason !== 'CYCLE') continue;
            cycles += 1;
            // Directly: putting A under B alone is a cycle exactly when A is B's ancestor.
            const attempt = () =>
              applyOp(tree, {
                type: 'batch',
                payload: {
                  ops: [
                    {
                      type: 'addUnion',
                      payload: {
                        id: 'f'.repeat(24),
                        partnerIds: [b],
                        order: 99,
                        status: 'married',
                      },
                    },
                    { type: 'setParents', payload: { personId: a, parentUnionId: 'f'.repeat(24) } },
                  ],
                },
              });
            expect(attempt).toThrow(OpError);
            expect(attempt).toThrow(expect.objectContaining({ code: 'CYCLE' }));
          }
        }
      }),
      { numRuns: 1000 },
    );
    // The property really met the cycles it is about.
    expect(cycles).toBeGreaterThan(0);
  });
});
