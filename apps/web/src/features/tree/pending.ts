import {
  applyOp,
  OpError,
  type ApplyOpResult,
  type Op,
  type TreeState,
} from '@ancestors-tree/shared/tree';
import { ApiError } from '../../shared/lib/apiError';

/** A change named by its seq once saved, or by its local id while it waits to be sent. */
export type OpRef = { seq: number } | { pendingId: number };

/** One change the server has not accepted yet. */
export interface PendingEntry {
  /** Local id, unique in this tab: links the entry to its undo and redo steps. */
  id: number;
  op: Op;
  /** The change this entry undoes or reverts; sent as revertsSeq once that change has a seq. */
  reverts?: OpRef;
  /** "Revert to this point" (spec §6.4): sent as revertsToSeq, and never rebased. */
  revertsToSeq?: number;
}

/**
 * An entry that no longer applies, and why: an OpError, the ApiError of revertOutdated(), or
 * null when it undid a change that was itself dropped.
 */
export interface DroppedEntry {
  entry: PendingEntry;
  error: unknown;
}

export interface Replayed {
  tree: TreeState;
  kept: PendingEntry[];
  dropped: DroppedEntry[];
  /** The inverse of every kept entry on the replayed tree, by entry id. */
  inverses: Map<number, Op>;
}

/** Why a "Revert to this point" was dropped: someone saved a change after it was prepared. */
export function revertOutdated(): ApiError {
  return new ApiError(
    'VERSION_CONFLICT',
    'The family tree changed after the revert was prepared',
    409,
  );
}

/**
 * Applies the entries in order on `start` and drops those that no longer fit: they broke a
 * rule there, they undid a dropped change (`alreadyDropped` seeds those ids), or they revert to
 * a point while someone else saved a change (`othersSaved`).
 */
export function replayPending(
  start: TreeState,
  entries: readonly PendingEntry[],
  options: { alreadyDropped?: readonly number[]; othersSaved?: boolean } = {},
): Replayed {
  let tree = start;
  const kept: PendingEntry[] = [];
  const dropped: DroppedEntry[] = [];
  const inverses = new Map<number, Op>();
  const gone = new Set(options.alreadyDropped);
  for (const entry of entries) {
    let applied: ApplyOpResult | undefined;
    let error: unknown = null;
    if (entry.reverts && 'pendingId' in entry.reverts && gone.has(entry.reverts.pendingId)) {
      // It undid a change that was dropped: nothing is left to undo.
      error = null;
    } else if (entry.revertsToSeq !== undefined && options.othersSaved === true) {
      error = revertOutdated();
    } else {
      try {
        applied = applyOp(tree, entry.op);
      } catch (thrown) {
        if (!(thrown instanceof OpError)) throw thrown;
        error = thrown;
      }
    }
    if (applied) {
      tree = applied.tree;
      kept.push(entry);
      inverses.set(entry.id, applied.inverse);
    } else {
      gone.add(entry.id);
      dropped.push({ entry, error });
    }
  }
  return { tree, kept, dropped, inverses };
}

/** Pending entry `pendingId` was saved as `seq`: entries that revert it now name the seq. */
export function resolveRefs(
  entries: readonly PendingEntry[],
  pendingId: number,
  seq: number,
): PendingEntry[] {
  return entries.map((entry) =>
    entry.reverts && 'pendingId' in entry.reverts && entry.reverts.pendingId === pendingId
      ? { ...entry, reverts: { seq } }
      : entry,
  );
}

/** The request fields that link an entry to what it reverts (spec §6.1). */
export function revertFieldsOf(entry: PendingEntry): {
  revertsSeq?: number;
  revertsToSeq?: number;
} {
  if (entry.revertsToSeq !== undefined) return { revertsToSeq: entry.revertsToSeq };
  if (entry.reverts && 'seq' in entry.reverts) return { revertsSeq: entry.reverts.seq };
  return {};
}
