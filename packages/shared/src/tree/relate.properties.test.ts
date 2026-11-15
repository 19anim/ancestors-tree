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
                  {
                    type: 'addUnion',
                    payload: { id: 'f'.repeat(24), partnerIds: [b], order: 99, status: 'married' },
                  },
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
