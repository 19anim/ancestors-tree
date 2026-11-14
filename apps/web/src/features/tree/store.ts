import {
  applyOp,
  EMPTY_TREE,
  OpError,
  treeStateFromLists,
  type ApplyOpResult,
  type Op,
  type OpErrorCode,
  type TreeState,
} from '@ancestors-tree/shared/tree';
import { create } from 'zustand';
import { ApiError } from '../../shared/lib/apiError';
import { fetchOpsSince, fetchTree, submitOp } from './api';
import {
  pushCapped,
  replayPending,
  resolveRefs,
  resolveStack,
  revertFieldsOf,
  withInverses,
  withoutPendingRefs,
  withoutRefsTo,
  type PendingEntry,
  type RedoEntry,
  type UndoEntry,
} from './pending';
import { clearSavedQueue, readSavedQueue, writeSavedQueue, type SavedQueueRead } from './persist';
import { rebase, restoreQueue } from './rebase';

export type TreeStatus = 'idle' | 'loading' | 'ready' | 'error';
/**
 * What happened to the user's unsent changes. `clanId` is the family tree they belonged to: the
 * notice is shown app-wide and stays until dismissed, whatever tree is on screen.
 */
export type TreeNotice =
  | ({ clanId: string } &
      /** The whole tree was read again (a third conflict in a row, or an answer it cannot read). */
      (
        | { kind: 'reloaded' }
        /**
         * A change was refused (by the server, or because the rebase found it no longer applies):
         * rolled back, and `dropped` other unsent changes with it.
         */
        | { kind: 'rejected'; error: unknown; dropped: number }
        /** The session expired: sending stopped, every unsent op is kept until the user signs in. */
        | { kind: 'signedOut' }
        /**
         * The server says this tab's cookie is another account's (IDENTITY_MISMATCH): sending
         * stopped, every unsent op is kept for the account that made them.
         */
        | { kind: 'otherAccount' }
        /**
         * `count` ops were still unsent when another tree opened or the account changed: dropped.
         * `inFlight`: the first of them was on its way, so it may have been saved after all.
         */
        | { kind: 'discarded'; count: number; inFlight: boolean }
      ))
  /** The queue saved in this tab could not be read after a reload: it was dropped. */
  | { kind: 'savedUnreadable'; clanId: null };
/**
 * Why apply() did nothing: a broken rule, the tree is not loaded, or (revertTo) the revert was
 * built on another version of the tree.
 */
export type ApplyFailure = OpErrorCode | 'NOT_LOADED' | 'OUT_OF_DATE';
export type ApplyResult = { ok: true } | { ok: false; reason: ApplyFailure };

/** Waits between retries of a request the server could not take (network, 429, 5xx). */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;
/** The conflict that makes the store read the whole tree again instead of rebasing (§6.3). */
export const MAX_CONFLICTS_IN_A_ROW = 3;

export interface TreeStoreState {
  /** The signed-in account (from the app shell); null until known and after sign-out. */
  userId: string | null;
  clanId: string | null;
  status: TreeStatus;
  loadError: unknown;
  /** What the user sees: the confirmed tree plus every pending entry. */
  tree: TreeState;
  /** What the server has accepted, at confirmedVersion. */
  confirmedTree: TreeState;
  confirmedVersion: number;
  /** Changes not yet accepted, oldest first; pending[0] is the one being sent. */
  pending: PendingEntry[];
  /** True while a failed request waits for its retry. */
  retrying: boolean;
  /**
   * True after a 401 the refresh cookie could not fix: nothing is sent until the next apply(),
   * load() or sign-in of the same account.
   */
  signedOut: boolean;
  /** True after IDENTITY_MISMATCH: nothing is sent until the right account is back. */
  otherAccount: boolean;
  notice: TreeNotice | null;
  /**
   * The version a queue restored from sessionStorage was made on, until load() has replayed it
   * on the server's tree; null otherwise.
   */
  restoredFrom: number | null;
  /** This user's changes in this session that can be undone, oldest first (spec §6.4). */
  undoStack: UndoEntry[];
  /** Undone changes that can be made again, oldest first; a new change clears it. */
  redoStack: RedoEntry[];
  load: (clanId: string) => Promise<void>;
  /**
   * The app shell says who is signed in. The same account again resumes a stopped queue;
   * another account drops what the previous one left unsent (spec §7.3).
   */
  setAccount: (userId: string) => void;
  apply: (op: Op) => ApplyResult;
  /** Undoes the latest step; null when there is none. A step that no longer applies leaves. */
  undo: () => ApplyResult | null;
  /** Makes the latest undone change again; null when there is none. */
  redo: () => ApplyResult | null;
  /** Reverts saved change `revertsSeq` by applying its inverse `op` (spec §6.4). */
  revertChange: (op: Op, revertsSeq: number) => ApplyResult;
  /**
   * "Revert to this point" (Owner): `op` undoes every change after `revertsToSeq` and was built
   * from the log at `atVersion`. Never rebased, so it is refused while anything is pending or
   * when the tree is at another version.
   */
  revertTo: (op: Op, revertsToSeq: number, atVersion: number) => ApplyResult;
  dismissNotice: () => void;
}

/** For the unsent-changes guard: primitives, so they are stable selectors. */
export const selectHasUnsentChanges = (state: TreeStoreState): boolean => state.pending.length > 0;
export const selectUnsentCount = (state: TreeStoreState): number => state.pending.length;

/** The store's data: every member that is not an action. */
type DataKeys = {
  [K in keyof TreeStoreState]: TreeStoreState[K] extends (...args: never[]) => unknown ? never : K;
}[keyof TreeStoreState];
type TreeData = Pick<TreeStoreState, DataKeys>;

const INITIAL: TreeData = {
  userId: null,
  clanId: null,
  status: 'idle',
  loadError: null,
  tree: EMPTY_TREE,
  confirmedTree: EMPTY_TREE,
  confirmedVersion: 0,
  pending: [],
  retrying: false,
  signedOut: false,
  otherAccount: false,
  notice: null,
  restoredFrom: null,
  undoStack: [],
  redoStack: [],
};

/** A new session per load(): answers that belong to an older one are ignored. */
let session = 0;
/** A request of the queue (a POST, the rebase's reads, or the reload) is on its way. */
let sending = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;
/** The queue must read the whole tree again (third conflict, or an answer it cannot trust). */
let needsReload = false;
/** The queue must catch up with the log and replay its entries (after a 409). */
let needsRebase = false;
/** 409s the same pending entry (conflictHead) got since the server last accepted a change. */
let conflictsInARow = 0;
/** The local id of the entry that got those 409s; another head starts the count again. */
let conflictHead: number | null = null;
/** The local id of the next pending entry. */
let nextPendingId = 1;
/** The load() in progress, so a second load() of the same tree (StrictMode) shares it. */
let loading: Promise<void> | undefined;

function clearRetry(): void {
  if (retryTimer !== undefined) clearTimeout(retryTimer);
  retryTimer = undefined;
  attempt = 0;
}

function resetConflicts(): void {
  conflictsInARow = 0;
  conflictHead = null;
}

/** Counts a 409 for the queue's head entry; a different head than last time counts from 1. */
function noteConflict(headId: number): void {
  if (conflictHead !== headId) conflictsInARow = 0;
  conflictHead = headId;
  conflictsInARow += 1;
}

function newEntry(op: Op): PendingEntry {
  const id = nextPendingId;
  nextPendingId += 1;
  return { id, op };
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500)
  );
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** The cookie belongs to another account than the one that made the queue. */
function isOtherAccount(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'IDENTITY_MISMATCH';
}

/** A 409 (check IDENTITY_MISMATCH before this one). */
function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/** A 4xx answer (check 401, 409 and 429 before this one). */
function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

export const useTreeStore = create<TreeStoreState>()((set, get) => {
  type Applied = { ok: true; entry: PendingEntry } | { ok: false; reason: ApplyFailure };

  /**
   * Applies a change on screen and queues it. `stacks` gives the new undo and redo stacks for
   * the entry and its inverse, so the tree, the queue and the stacks change in one update.
   */
  function applyChange(
    op: Op,
    extra: Pick<PendingEntry, 'reverts' | 'revertsToSeq'>,
    stacks: (
      entry: PendingEntry,
      inverse: Op,
      state: TreeStoreState,
    ) => Pick<TreeStoreState, 'undoStack' | 'redoStack'>,
  ): Applied {
    const state = get();
    // While a reload is pending it would drop every new entry: refuse instead. No account yet:
    // an op could not be tied to the person who made it.
    if (state.status !== 'ready' || needsReload || state.userId === null) {
      return { ok: false, reason: 'NOT_LOADED' };
    }
    let result: ApplyOpResult;
    try {
      result = applyOp(state.tree, op);
    } catch (error) {
      if (error instanceof OpError) return { ok: false, reason: error.code };
      throw error;
    }
    const entry: PendingEntry = { ...newEntry(op), ...extra };
    set({
      tree: result.tree,
      pending: [...state.pending, entry],
      ...stacks(entry, result.inverse, state),
    });
    resume();
    return { ok: true, entry };
  }

  function toApplyResult(applied: Applied): ApplyResult {
    return applied.ok ? { ok: true } : applied;
  }

  /** Stops the queue after a 401; every pending entry stays. */
  function stopSignedOut(clanId: string): void {
    attempt = 0;
    set({ signedOut: true, retrying: false, notice: { kind: 'signedOut', clanId } });
  }

  /** Stops the queue after IDENTITY_MISMATCH; every pending entry stays for its account. */
  function stopOtherAccount(clanId: string): void {
    attempt = 0;
    set({ otherAccount: true, retrying: false, notice: { kind: 'otherAccount', clanId } });
  }

  /**
   * The user is back (apply, load, or a sign-in after a stop): send again, or first finish the
   * restore of a saved queue that a 401 stopped.
   */
  function resume(): void {
    const { signedOut, otherAccount, notice, clanId, status, restoredFrom } = get();
    if (signedOut || otherAccount) {
      const stopNotice = notice?.kind === 'signedOut' || notice?.kind === 'otherAccount';
      set({ signedOut: false, otherAccount: false, notice: stopNotice ? null : notice });
    }
    if (clanId !== null && restoredFrom !== null && status === 'loading' && loading === undefined) {
      void restoreSession(clanId);
      return;
    }
    void flush();
  }

  /** The server refused pending[0]: roll it back, with the entries that depended on it. */
  function reject(clanId: string, error: unknown): void {
    const { confirmedTree, pending } = get();
    const [refused, ...rest] = pending;
    if (refused === undefined) return;
    const replayed = replayPending(confirmedTree, rest, { alreadyDropped: [refused.id] });
    if (replayed.kept.length === 0) resetConflicts();
    const gone = [refused.id, ...replayed.dropped.map((dropped) => dropped.entry.id)];
    const { undoStack, redoStack } = get();
    set({
      tree: replayed.tree,
      pending: replayed.kept,
      retrying: false,
      notice: { kind: 'rejected', clanId, error, dropped: replayed.dropped.length },
      undoStack: withInverses(withoutRefsTo(undoStack, gone), replayed.inverses),
      redoStack: withoutRefsTo(redoStack, gone),
    });
  }

  function scheduleRetry(mine: number, again: () => void = () => void flush()): void {
    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    attempt += 1;
    set({ retrying: true });
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (mine === session) again();
    }, delay);
  }

  /** A read of the queue (the reload or the rebase) failed: retry, stop, or show the error. */
  function readFailed(clanId: string, error: unknown, mine: number): void {
    if (isUnauthenticated(error)) {
      stopSignedOut(clanId);
    } else if (isRetryable(error)) {
      scheduleRetry(mine);
    } else if (isRefusal(error)) {
      // The tree is gone or no longer ours (404, 403). The pending entries stay in the store:
      // the app-level UnsentChangesGuard still counts them, and the next load() reports them
      // as discarded.
      needsReload = false;
      needsRebase = false;
      attempt = 0;
      set({ status: 'error', loadError: error, retrying: false });
    } else {
      // An answer we cannot read: try again later rather than at once.
      scheduleRetry(mine);
    }
  }

  /**
   * Reads the tree again and drops every pending entry, including entries applied while this
   * request was on its way; the `reloaded` notice tells the user. When the reload fails, the
   * entries are kept and the reload is retried with backoff.
   */
  async function reload(clanId: string, mine: number): Promise<void> {
    try {
      const response = await fetchTree(clanId);
      if (mine !== session) return;
      const tree = treeStateFromLists(response.progenitorId, response.persons, response.unions);
      needsReload = false;
      needsRebase = false;
      resetConflicts();
      attempt = 0;
      set({
        tree,
        confirmedTree: tree,
        confirmedVersion: response.version,
        pending: [],
        retrying: false,
        notice: { kind: 'reloaded', clanId },
        undoStack: withoutPendingRefs(get().undoStack),
        redoStack: withoutPendingRefs(get().redoStack),
      });
    } catch (error) {
      if (mine !== session) return;
      readFailed(clanId, error, mine);
    }
  }

  /**
   * Spec §6.3: reads what others saved since confirmedVersion and replays the queue on top.
   * Entries that no longer apply are dropped with the `rejected` notice (the first one's reason).
   */
  async function rebaseQueue(clanId: string, userId: string, mine: number): Promise<void> {
    try {
      const remote = await fetchOpsSince(clanId, get().confirmedVersion);
      if (mine !== session) return;
      // Read again after the await: entries applied meanwhile are replayed too.
      const state = get();
      const result = rebase({
        confirmedTree: state.confirmedTree,
        confirmedVersion: state.confirmedVersion,
        pending: state.pending,
        remote,
        userId,
      });
      needsRebase = false;
      attempt = 0;
      if (!result.ok) {
        needsReload = true;
        return;
      }
      if (result.saved || result.pending.length === 0) resetConflicts();
      const [first, ...others] = result.dropped;
      let { undoStack, redoStack } = state;
      if (result.saved) {
        undoStack = resolveStack(undoStack, result.saved.entry.id, result.saved.seq);
        redoStack = resolveStack(redoStack, result.saved.entry.id, result.saved.seq);
      }
      const gone = result.dropped.map((dropped) => dropped.entry.id);
      set({
        confirmedTree: result.confirmedTree,
        confirmedVersion: result.confirmedVersion,
        tree: result.tree,
        pending: result.pending,
        retrying: false,
        notice: first
          ? { kind: 'rejected', clanId, error: first.error, dropped: others.length }
          : state.notice,
        undoStack: withInverses(withoutRefsTo(undoStack, gone), result.inverses),
        redoStack: withoutRefsTo(redoStack, gone),
      });
    } catch (error) {
      if (mine !== session) return;
      readFailed(clanId, error, mine);
    }
  }

  async function send(
    clanId: string,
    userId: string,
    entry: PendingEntry,
    baseVersion: number,
    mine: number,
  ): Promise<void> {
    try {
      const { seq } = await submitOp(clanId, {
        op: entry.op,
        baseVersion,
        expectedUserId: userId,
        ...revertFieldsOf(entry),
      });
      if (mine !== session) return;
      attempt = 0;
      resetConflicts();
      const state = get();
      set({
        confirmedTree: applyOp(state.confirmedTree, entry.op).tree,
        confirmedVersion: seq,
        pending: resolveRefs(state.pending.slice(1), entry.id, seq),
        retrying: false,
        undoStack: resolveStack(state.undoStack, entry.id, seq),
        redoStack: resolveStack(state.redoStack, entry.id, seq),
      });
    } catch (error) {
      if (mine !== session) return;
      if (isRetryable(error)) {
        scheduleRetry(mine);
      } else if (isUnauthenticated(error)) {
        stopSignedOut(clanId);
      } else if (isOtherAccount(error)) {
        stopOtherAccount(clanId);
      } else if (isConflict(error)) {
        attempt = 0;
        noteConflict(entry.id);
        // Someone keeps saving first: stop rebasing and read the whole tree.
        if (conflictsInARow >= MAX_CONFLICTS_IN_A_ROW) needsReload = true;
        else needsRebase = true;
      } else if (isRefusal(error)) {
        attempt = 0;
        reject(clanId, error);
      } else {
        // No answer we can trust: a 2xx with an unreadable body (INVALID_RESPONSE; the op may
        // well be saved) or a non-API error. Start again from the server's tree.
        attempt = 0;
        needsReload = true;
      }
    }
  }

  async function flush(): Promise<void> {
    if (sending || retryTimer !== undefined) return;
    const { userId, clanId, status, signedOut, otherAccount, pending, confirmedVersion } = get();
    if (userId === null || clanId === null || status !== 'ready' || signedOut || otherAccount) {
      return;
    }
    const entry = pending[0];
    if (!needsReload && !needsRebase && entry === undefined) return;
    const mine = session;
    sending = true;
    try {
      if (needsReload) await reload(clanId, mine);
      else if (needsRebase) await rebaseQueue(clanId, userId, mine);
      else if (entry !== undefined) await send(clanId, userId, entry, confirmedVersion, mine);
    } finally {
      if (mine === session) sending = false;
    }
    if (mine === session) void flush();
  }

  /** A ready tree with nothing pending opened again: keep it, take a newer version quietly. */
  async function refresh(clanId: string): Promise<void> {
    const mine = session;
    try {
      const response = await fetchTree(clanId);
      const state = get();
      if (mine !== session || sending || needsReload || needsRebase || state.pending.length > 0) {
        return;
      }
      if (response.version <= state.confirmedVersion) return;
      const tree = treeStateFromLists(response.progenitorId, response.persons, response.unions);
      set({ tree, confirmedTree: tree, confirmedVersion: response.version });
    } catch {
      // The tree on screen is still valid; the next op's 409 would catch a missed change.
    }
  }

  /**
   * load() of a tree whose queue came from sessionStorage: reads the tree, the log since the
   * saved version when the tree moved on, and replays the queue (restoreQueue). A failure keeps
   * the queue and `restoredFrom`, so the next load() tries again; a network failure or a busy
   * server also schedules that again with the usual backoff.
   */
  function restoreSession(clanId: string): Promise<void> {
    session += 1;
    const mine = session;
    sending = false;
    needsReload = false;
    needsRebase = false;
    resetConflicts();
    clearRetry();
    set({ status: 'loading', loadError: null });
    const run = (async () => {
      try {
        const response = await fetchTree(clanId);
        if (mine !== session) return;
        const savedVersion = get().restoredFrom ?? response.version;
        const remote =
          response.version > savedVersion ? await fetchOpsSince(clanId, savedVersion) : [];
        if (mine !== session) return;
        attempt = 0;
        const state = get();
        const fetched = treeStateFromLists(
          response.progenitorId,
          response.persons,
          response.unions,
        );
        const base = {
          status: 'ready' as const,
          confirmedTree: fetched,
          confirmedVersion: response.version,
          restoredFrom: null,
        };
        const result = restoreQueue({
          tree: fetched,
          version: response.version,
          savedVersion,
          pending: state.pending,
          remote,
          userId: state.userId ?? '',
        });
        if (!result.ok) {
          // The saved queue does not fit the log: start from the server's tree and say so.
          set({ ...base, tree: fetched, pending: [], notice: { kind: 'reloaded', clanId } });
          return;
        }
        const [first, ...others] = result.dropped;
        // restoreSaved reset the store to INITIAL, so both stacks are empty here and these four
        // lines change nothing today. They keep the stacks consistent with the queue should a
        // restore ever start from a store that has steps (same handling as rebaseQueue).
        // Every confirmed entry of the prefix names its steps by its seq.
        let { undoStack, redoStack } = state;
        for (const { entry, seq } of result.saved) {
          undoStack = resolveStack(undoStack, entry.id, seq);
          redoStack = resolveStack(redoStack, entry.id, seq);
        }
        const gone = result.dropped.map((dropped) => dropped.entry.id);
        set({
          ...base,
          tree: result.tree,
          pending: result.pending,
          notice: first
            ? { kind: 'rejected', clanId, error: first.error, dropped: others.length }
            : state.notice,
          undoStack: withInverses(withoutRefsTo(undoStack, gone), result.inverses),
          redoStack: withoutRefsTo(redoStack, gone),
        });
        void flush();
      } catch (error) {
        if (mine !== session) return;
        if (isUnauthenticated(error)) {
          // Not an error page: the signedOut notice asks to sign in, and resume() restores.
          stopSignedOut(clanId);
          return;
        }
        set({ status: 'error', loadError: error });
        if (isRetryable(error)) scheduleRetry(mine, () => void restoreSession(clanId));
      } finally {
        if (mine === session) loading = undefined;
      }
    })();
    loading = run;
    return run;
  }

  /**
   * The first account this tab learns (after a reload or a sign-in redirect) picks up the queue
   * saved before: restored for the same account (then loaded and sent, whatever page is open),
   * dropped with a notice when another account made it or another tree is already open.
   */
  function restoreSaved(userId: string, saved: SavedQueueRead): void {
    if (saved.kind === 'none') return;
    if (saved.kind === 'unreadable') {
      set({ notice: { kind: 'savedUnreadable', clanId: null } });
      return;
    }
    const { queue } = saved;
    const current = get();
    if (queue.userId !== userId || (current.clanId !== null && current.clanId !== queue.clanId)) {
      set({
        notice: {
          kind: 'discarded',
          clanId: queue.clanId,
          count: queue.entries.length,
          inFlight: false,
        },
      });
      return;
    }
    // A load of the same tree may be on its way: the restore replaces it.
    stopSending();
    nextPendingId = Math.max(nextPendingId, ...queue.entries.map((entry) => entry.id + 1));
    set({
      ...INITIAL,
      userId,
      clanId: queue.clanId,
      pending: queue.entries,
      confirmedVersion: queue.version,
      restoredFrom: queue.version,
      notice: current.notice,
    });
    void get().load(queue.clanId);
  }

  return {
    ...INITIAL,

    load(clanId) {
      const current = get();
      if (current.clanId === clanId) {
        if (current.status === 'loading' && loading !== undefined) return loading;
        if (current.status === 'ready') {
          // Coming back while changes are still being saved (or waiting for a sign-in): keep
          // them and send again.
          if (current.pending.length > 0 || needsReload || needsRebase) {
            resume();
            return Promise.resolve();
          }
          return refresh(clanId);
        }
        if (current.restoredFrom !== null) return restoreSession(clanId);
      }

      // A new session. Unsent entries of the previous one are dropped: say how many
      // (UnsentChangesGuard asks before another tree opens and empties the queue itself when
      // the user agrees, so this notice only shows when something else got here). A notice the
      // user has not dismissed yet stays: it may be the only word they get about edits that
      // were dropped while another page was on screen.
      const discarded = current.pending.length;
      const inFlight = sending && !needsReload && !needsRebase;
      const unseen = current.notice;
      session += 1;
      const mine = session;
      sending = false;
      needsReload = false;
      needsRebase = false;
      resetConflicts();
      clearRetry();
      set({
        ...INITIAL,
        userId: current.userId,
        clanId,
        status: 'loading',
        notice:
          discarded > 0
            ? { kind: 'discarded', clanId: current.clanId ?? clanId, count: discarded, inFlight }
            : unseen,
      });
      const run = (async () => {
        try {
          const response = await fetchTree(clanId);
          if (mine !== session) return;
          const tree = treeStateFromLists(response.progenitorId, response.persons, response.unions);
          set({
            status: 'ready',
            tree,
            confirmedTree: tree,
            confirmedVersion: response.version,
          });
        } catch (error) {
          if (mine === session) set({ status: 'error', loadError: error });
        } finally {
          if (mine === session) loading = undefined;
        }
      })();
      loading = run;
      return run;
    },

    setAccount(userId) {
      const state = get();
      if (state.userId === userId) {
        if (state.signedOut || state.otherAccount) resume();
        return;
      }
      if (state.userId !== null) {
        discardForAccountChange();
        set({ userId });
        return;
      }
      // Read before the account is set: setting it saves the (still empty) queue.
      const saved = readSavedQueue();
      set({ userId });
      restoreSaved(userId, saved);
    },

    apply(op) {
      return toApplyResult(
        applyChange(op, {}, (entry, inverse, state) => ({
          undoStack: pushCapped(state.undoStack, { op, inverse, ref: { pendingId: entry.id } }),
          redoStack: [],
        })),
      );
    },

    undo() {
      const step = get().undoStack.at(-1);
      if (step === undefined) return null;
      const applied = applyChange(
        step.inverse,
        { reverts: step.ref },
        (entry, _inverse, state) => ({
          undoStack: state.undoStack.slice(0, -1),
          // Redo makes the undone change again (not the undo's inverse): the history reads as
          // the same change.
          redoStack: pushCapped(state.redoStack, { op: step.op, ref: { pendingId: entry.id } }),
        }),
      );
      // The inverse no longer applies (someone changed the tree): the step cannot come back.
      if (!applied.ok && applied.reason !== 'NOT_LOADED') {
        set({ undoStack: get().undoStack.slice(0, -1) });
      }
      return toApplyResult(applied);
    },

    redo() {
      const step = get().redoStack.at(-1);
      if (step === undefined) return null;
      const applied = applyChange(step.op, {}, (entry, inverse, state) => ({
        redoStack: state.redoStack.slice(0, -1),
        undoStack: pushCapped(state.undoStack, {
          op: step.op,
          inverse,
          ref: { pendingId: entry.id },
        }),
      }));
      if (!applied.ok && applied.reason !== 'NOT_LOADED') {
        set({ redoStack: get().redoStack.slice(0, -1) });
      }
      return toApplyResult(applied);
    },

    revertChange(op, revertsSeq) {
      return toApplyResult(
        applyChange(op, { reverts: { seq: revertsSeq } }, (entry, inverse, state) => ({
          undoStack: pushCapped(state.undoStack, { op, inverse, ref: { pendingId: entry.id } }),
          redoStack: [],
        })),
      );
    },

    revertTo(op, revertsToSeq, atVersion) {
      const state = get();
      if (
        state.status === 'ready' &&
        (state.pending.length > 0 || needsRebase || state.confirmedVersion !== atVersion)
      ) {
        return { ok: false, reason: 'OUT_OF_DATE' };
      }
      return toApplyResult(
        applyChange(op, { revertsToSeq }, (entry, inverse, current) => ({
          undoStack: pushCapped(current.undoStack, { op, inverse, ref: { pendingId: entry.id } }),
          redoStack: [],
        })),
      );
    },

    dismissNotice() {
      set({ notice: null });
    },
  };
});

// Mirrors the queue to sessionStorage, so a reload or a Google sign-in keeps it (spec §7.3).
useTreeStore.subscribe((state, previous) => {
  if (
    state.pending === previous.pending &&
    state.confirmedVersion === previous.confirmedVersion &&
    state.userId === previous.userId &&
    state.clanId === previous.clanId
  ) {
    return;
  }
  // No account yet (a reload before the app knows who is signed in): keep what is saved.
  if (state.userId === null) return;
  if (state.clanId === null || state.pending.length === 0) {
    clearSavedQueue();
    return;
  }
  writeSavedQueue({
    format: 1,
    userId: state.userId,
    clanId: state.clanId,
    version: state.confirmedVersion,
    entries: state.pending,
  });
});

/** Stops the queue and forgets every answer still on its way. */
function stopSending(): void {
  session += 1;
  sending = false;
  needsReload = false;
  needsRebase = false;
  resetConflicts();
  loading = undefined;
  clearRetry();
}

/**
 * Forgets the tree and the queue, including the module-level send state: answers still on their
 * way are ignored and nothing more is sent. Keeps the account. For the user discarding unsent
 * changes, a deleted tree, and tests.
 */
export function resetTreeStore(): void {
  const { userId } = useTreeStore.getState();
  stopSending();
  useTreeStore.setState({ ...INITIAL, userId });
}

/** Sign-out: forgets everything, the account too. */
export function signOutTreeStore(): void {
  stopSending();
  clearSavedQueue();
  useTreeStore.setState(INITIAL);
}

/** Another account signed in: what the previous one left unsent is dropped, with a notice. */
function discardForAccountChange(): void {
  const { pending, clanId } = useTreeStore.getState();
  const inFlight = sending && !needsReload && !needsRebase;
  signOutTreeStore();
  if (pending.length > 0 && clanId !== null) {
    useTreeStore.setState({
      notice: { kind: 'discarded', clanId, count: pending.length, inFlight },
    });
  }
}

/** Forgets the tree store when it holds this family tree (it was deleted); other trees stay. */
export function discardTreeStateFor(clanId: string): void {
  if (useTreeStore.getState().clanId === clanId) resetTreeStore();
}

/** How many changes are not saved yet, for the app shell (sign-out asks first when any). */
export function useUnsentChangeCount(): number {
  return useTreeStore(selectUnsentCount);
}
