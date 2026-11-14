import type { OperationEntry } from '@ancestors-tree/shared';
import { applyOp, OpError, sameOp, type Op, type TreeState } from '@ancestors-tree/shared/tree';
import { replayPending, resolveRefs, type DroppedEntry, type PendingEntry } from './pending';

export interface RebaseInput {
  confirmedTree: TreeState;
  confirmedVersion: number;
  pending: readonly PendingEntry[];
  /** The log after confirmedVersion, oldest first (GET /ops, every page). */
  remote: readonly OperationEntry[];
  /** The signed-in account: an op of its own in `remote` may be the queue's first. */
  userId: string;
}

/** The queue's first entry, found already saved at `seq`. */
export interface SavedEntry {
  entry: PendingEntry;
  seq: number;
}

export type RebaseResult =
  | { ok: false }
  | {
      ok: true;
      confirmedTree: TreeState;
      confirmedVersion: number;
      saved: SavedEntry | null;
      tree: TreeState;
      pending: PendingEntry[];
      dropped: DroppedEntry[];
      inverses: Map<number, Op>;
    };

/**
 * Spec §6.3: applies the missed ops to the confirmed tree, then replays the queue on top.
 * `ok: false` (reload the whole tree) when the log has a gap or a missed op does not apply to
 * this copy. When the first missed entry (seq confirmedVersion + 1, the only slot the server could
 * have given a lost answer) is by this account and equals the queue's first entry, that
 * entry was saved before its answer was lost (a retry then got the 409): it is confirmed with
 * that seq instead of being sent twice.
 */
export function rebase(input: RebaseInput): RebaseResult {
  let confirmedTree = input.confirmedTree;
  let version = input.confirmedVersion;
  const head = input.pending[0];
  let saved: SavedEntry | null = null;
  let othersSaved = false;
  for (const remote of input.remote) {
    if (remote.seq !== version + 1) return { ok: false };
    try {
      confirmedTree = applyOp(confirmedTree, remote.op).tree;
    } catch (error) {
      if (error instanceof OpError) return { ok: false };
      throw error;
    }
    version = remote.seq;
    // The server takes an op only at clan.version === baseVersion, so a lost answer was saved as
    // the very first missed entry; an identical op further on is a new one.
    if (
      saved === null &&
      head &&
      remote.seq === input.confirmedVersion + 1 &&
      remote.userId === input.userId &&
      sameOp(remote.op, head.op)
    ) {
      saved = { entry: head, seq: remote.seq };
    } else {
      othersSaved = true;
    }
  }
  const rest = saved
    ? resolveRefs(input.pending.slice(1), saved.entry.id, saved.seq)
    : [...input.pending];
  const replayed = replayPending(confirmedTree, rest, { othersSaved });
  return {
    ok: true,
    confirmedTree,
    confirmedVersion: version,
    saved,
    tree: replayed.tree,
    pending: replayed.kept,
    dropped: replayed.dropped,
    inverses: replayed.inverses,
  };
}
