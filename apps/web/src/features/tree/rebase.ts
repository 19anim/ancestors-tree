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

export interface RestoreInput {
  /** The server's tree now, at `version`. */
  tree: TreeState;
  version: number;
  /** The confirmed version the saved entries were made on. */
  savedVersion: number;
  pending: readonly PendingEntry[];
  /** The log after savedVersion; entries past `version` are ignored. */
  remote: readonly OperationEntry[];
  userId: string;
}

export type RestoreResult =
  | { ok: false }
  | {
      ok: true;
      /** The queue's leading entries found already saved, oldest first. */
      saved: SavedEntry[];
      tree: TreeState;
      pending: PendingEntry[];
      dropped: DroppedEntry[];
      inverses: Map<number, Op>;
    };

/**
 * A queue saved before a reload meets the server's tree as it is now; `ok: false` when the log
 * between the two versions has a gap.
 *
 * It confirms a prefix of the queue: walking the log from savedVersion + 1, entry i is saved
 * while the log's seq is savedVersion + 1 + i, the author is this account and the op is the same.
 * That is sound only here, not in rebase(): one tab sends its queue in order and rewrites the
 * mirror after every answer, so a run of this account's identical ops right after savedVersion
 * can only come from another copy of this very queue (a duplicated tab, or an answer lost
 * before the reload). During a live 409 the same run could be a coincidence, so rebase() keeps
 * to the head.
 */
export function restoreQueue(input: RestoreInput): RestoreResult {
  const missed = input.remote.filter((remote) => remote.seq <= input.version);
  const contiguous =
    input.version >= input.savedVersion &&
    missed.length === input.version - input.savedVersion &&
    missed.every((remote, index) => remote.seq === input.savedVersion + index + 1);
  if (!contiguous) return { ok: false };
  const saved: SavedEntry[] = [];
  for (const [index, remote] of missed.entries()) {
    const entry = input.pending[index];
    if (entry === undefined || remote.userId !== input.userId || !sameOp(remote.op, entry.op)) {
      break;
    }
    saved.push({ entry, seq: remote.seq });
  }
  let rest = input.pending.slice(saved.length);
  for (const { entry, seq } of saved) rest = resolveRefs(rest, entry.id, seq);
  const replayed = replayPending(input.tree, rest, { othersSaved: missed.length > saved.length });
  return {
    ok: true,
    saved,
    tree: replayed.tree,
    pending: replayed.kept,
    dropped: replayed.dropped,
    inverses: replayed.inverses,
  };
}
