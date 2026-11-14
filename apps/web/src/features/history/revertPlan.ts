import { HISTORY_PAGE_MAX, type HistoryEntry } from '@ancestors-tree/shared';
import { MAX_BATCH_OPS, type Op, type SingleOp } from '@ancestors-tree/shared/tree';
import { fetchHistoryPage } from './api';

export type RevertPlan =
  | { kind: 'ready'; op: Op; changes: number; atVersion: number }
  | { kind: 'tooMany' }
  | { kind: 'nothing' };

/** The inverses of `entries` (newest first), flattened: undoing them in this order goes back. */
export function revertStepsOf(entries: readonly HistoryEntry[]): SingleOp[] {
  return entries.flatMap((entry) =>
    entry.inverse.type === 'batch' ? entry.inverse.payload.ops : [entry.inverse],
  );
}

/** One op that undoes every entry (newest first, all after the point), at most 500 steps. */
export function buildRevertPlan(entries: readonly HistoryEntry[]): RevertPlan {
  const newest = entries[0];
  const steps = revertStepsOf(entries);
  if (newest === undefined || steps.length === 0) return { kind: 'nothing' };
  if (steps.length > MAX_BATCH_OPS) return { kind: 'tooMany' };
  const [only] = steps;
  const op: Op =
    steps.length === 1 && only !== undefined ? only : { type: 'batch', payload: { ops: steps } };
  return { kind: 'ready', op, changes: entries.length, atVersion: newest.seq };
}

/** Reads every change after `seq` (newest first) and plans the revert; stops past 500 steps. */
export async function fetchRevertPlan(
  clanId: string,
  seq: number,
  signal?: AbortSignal,
): Promise<RevertPlan> {
  const entries: HistoryEntry[] = [];
  let steps = 0;
  let before: number | null = null;
  for (;;) {
    const page = await fetchHistoryPage(clanId, before, signal, HISTORY_PAGE_MAX);
    for (const entry of page.entries) {
      if (entry.seq <= seq) return buildRevertPlan(entries);
      entries.push(entry);
      steps += entry.inverse.type === 'batch' ? entry.inverse.payload.ops.length : 1;
    }
    if (steps > MAX_BATCH_OPS) return { kind: 'tooMany' };
    if (page.nextBefore === null) return buildRevertPlan(entries);
    before = page.nextBefore;
  }
}
