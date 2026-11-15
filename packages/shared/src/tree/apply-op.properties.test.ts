import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyOp, type ApplyOpResult } from './apply-op.ts';
import { OpError } from './op-error.ts';
import type { Op, SingleOp } from './ops.ts';
import { EMPTY_TREE, type TreeState } from './state.ts';
import {
  idMaker,
  invariantViolations,
  treeCommand,
  treeCommandOp,
  type TreeCommand,
} from './testing.ts';

function tryApply(tree: TreeState, op: Op): ApplyOpResult | null {
  try {
    return applyOp(tree, op);
  } catch (error) {
    if (error instanceof OpError) return null;
    throw error;
  }
}

/** Applies op; checks immutability, invariants and the inverse round trip on success. */
function step(tree: TreeState, op: Op): ApplyOpResult | null {
  const before = structuredClone(tree);
  const result = tryApply(tree, op);
  expect(tree).toStrictEqual(before);
  if (!result) return null;
  expect(invariantViolations(result.tree)).toEqual([]);
  expect(applyOp(result.tree, result.inverse).tree).toStrictEqual(before);
  return result;
}

/** How often the undo command applied each op type, over all runs. */
type Seen = Partial<Record<Op['type'], number>>;

/** Runs the commands from an empty tree; undo applies the latest inverse not used yet. */
function run(commands: readonly TreeCommand[], nextId: () => string, seen: Seen): TreeState {
  let tree = EMPTY_TREE;
  const undoStack: Op[] = [];
  for (const cmd of commands) {
    if (cmd.kind === 'undo') {
      const inverse = undoStack.pop();
      const result = inverse ? step(tree, inverse) : null;
      if (inverse && result) {
        tree = result.tree;
        seen[inverse.type] = (seen[inverse.type] ?? 0) + 1;
      }
      continue;
    }
    const op = treeCommandOp(tree, cmd, nextId);
    const result = op ? step(tree, op) : null;
    if (result) {
      tree = result.tree;
      undoStack.push(result.inverse);
    }
  }
  return tree;
}

describe('applyOp properties', () => {
  it('keeps the tree valid, never mutates it, and every inverse restores it exactly', () => {
    const seen: Seen = {};
    fc.assert(
      fc.property(fc.array(treeCommand, { maxLength: 60, size: 'max' }), (commands) => {
        run(commands, idMaker(), seen);
      }),
      { numRuns: 500 },
    );
    // The undo command really produced the restore ops this test is about.
    expect(seen.restorePerson ?? 0).toBeGreaterThan(0);
    expect(seen.restoreUnion ?? 0).toBeGreaterThan(0);
  });

  it('round-trips batches', () => {
    fc.assert(
      fc.property(
        fc.array(treeCommand, { maxLength: 30 }),
        fc.array(fc.array(treeCommand, { minLength: 1, maxLength: 4 }), { maxLength: 8 }),
        (setup, groups) => {
          const nextId = idMaker();
          let tree = run(setup, nextId, {});
          for (const group of groups) {
            // Build each child op against the tree as the batch will see it.
            const ops: SingleOp[] = [];
            let preview = tree;
            for (const cmd of group) {
              const op = treeCommandOp(preview, cmd, nextId);
              const result = op ? tryApply(preview, op) : null;
              if (op && result) {
                ops.push(op);
                preview = result.tree;
              }
            }
            const result = ops.length > 0 ? step(tree, { type: 'batch', payload: { ops } }) : null;
            if (result) tree = result.tree;
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
