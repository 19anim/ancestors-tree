import {
  applyOp,
  EMPTY_TREE,
  OpError,
  treeStateFromLists,
  type Op,
  type OpErrorCode,
  type TreeState,
} from '@ancestors-tree/shared/tree';
import { create } from 'zustand';
import { ApiError } from '../../shared/lib/apiError';
import { fetchTree, submitOp } from './api';

export type TreeStatus = 'idle' | 'loading' | 'ready' | 'error';
export type TreeNotice =
  /** A 409 (or an unreadable answer) reloaded the tree; unsent ops were dropped. */
  | { kind: 'reloaded' }
  /** The server refused an op; it was rolled back. */
  | { kind: 'rejected'; error: unknown }
  /** The session expired: sending stopped, every unsent op is kept until the user signs in. */
  | { kind: 'signedOut' }
  /** load() opened a tree while `count` ops were still unsent; they were dropped. */
  | { kind: 'discarded'; count: number };
/** Why apply() did nothing: a broken rule, or no tree to edit (loading or failed to load). */
export type ApplyFailure = OpErrorCode | 'NOT_LOADED';
export type ApplyResult = { ok: true } | { ok: false; reason: ApplyFailure };

/** Waits between retries of an op the server could not take (network, 429, 5xx). */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

export interface TreeStoreState {
  clanId: string | null;
  status: TreeStatus;
  loadError: unknown;
  /** What the user sees: the confirmed tree plus every pending op. */
  tree: TreeState;
  /** What the server has accepted, at confirmedVersion. */
  confirmedTree: TreeState;
  confirmedVersion: number;
  /** Ops not yet accepted, oldest first; pending[0] is the one being sent. */
  pending: Op[];
  /** True while a failed send (or reload) waits for its retry. */
  retrying: boolean;
  /**
   * True after a 401 the refresh cookie could not fix: nothing is sent until the next apply()
   * or load() of the same family tree, which try again (the user signed in meanwhile).
   */
  signedOut: boolean;
  notice: TreeNotice | null;
  load: (clanId: string) => Promise<void>;
  apply: (op: Op) => ApplyResult;
  dismissNotice: () => void;
}

/** For the unsent-changes guard: primitives, so they are stable selectors. */
export const selectHasUnsentChanges = (state: TreeStoreState): boolean => state.pending.length > 0;
export const selectUnsentCount = (state: TreeStoreState): number => state.pending.length;

type TreeData = Omit<TreeStoreState, 'load' | 'apply' | 'dismissNotice'>;

const INITIAL: TreeData = {
  clanId: null,
  status: 'idle',
  loadError: null,
  tree: EMPTY_TREE,
  confirmedTree: EMPTY_TREE,
  confirmedVersion: 0,
  pending: [],
  retrying: false,
  signedOut: false,
  notice: null,
};

/** A new session per load(): answers that belong to an older one are ignored. */
let session = 0;
/** A request of the queue (POST of pending[0], or the reload) is on its way. */
let sending = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;
/** The queue must read the whole tree again (after a 409 or an answer it cannot trust). */
let needsReload = false;
/** The load() in progress, so a second load() of the same tree (StrictMode) shares it. */
let loading: Promise<void> | undefined;

function clearRetry(): void {
  if (retryTimer !== undefined) clearTimeout(retryTimer);
  retryTimer = undefined;
  attempt = 0;
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500)
  );
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/** A 4xx answer (check 401 and 429 before this one). */
function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/** Applies ops in order, dropping any that no longer fit (they depended on a rejected op). */
function replay(start: TreeState, ops: readonly Op[]): { tree: TreeState; kept: Op[] } {
  let tree = start;
  const kept: Op[] = [];
  for (const op of ops) {
    try {
      tree = applyOp(tree, op).tree;
      kept.push(op);
    } catch (error) {
      if (!(error instanceof OpError)) throw error;
    }
  }
  return { tree, kept };
}

export const useTreeStore = create<TreeStoreState>()((set, get) => {
  /** Stops the queue after a 401; every pending op stays. */
  function stopSignedOut(): void {
    attempt = 0;
    set({ signedOut: true, retrying: false, notice: { kind: 'signedOut' } });
  }

  /** The user is back (apply or load after a 401): send again. */
  function resume(): void {
    const { signedOut, notice } = get();
    if (signedOut) {
      set({ signedOut: false, notice: notice?.kind === 'signedOut' ? null : notice });
    }
    void flush();
  }

  function reject(error: unknown): void {
    const { confirmedTree, pending } = get();
    const { tree, kept } = replay(confirmedTree, pending.slice(1));
    set({ tree, pending: kept, retrying: false, notice: { kind: 'rejected', error } });
  }

  function scheduleRetry(mine: number): void {
    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    attempt += 1;
    set({ retrying: true });
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (mine === session) void flush();
    }, delay);
  }

  /**
   * Reads the tree again and drops every pending op (spec: a 409 reloads), including ops
   * applied while this request was on its way; the `reloaded` notice tells the user. When the
   * reload fails, the pending ops are kept and the reload is retried with backoff.
   */
  async function reload(clanId: string, mine: number): Promise<void> {
    try {
      const response = await fetchTree(clanId);
      if (mine !== session) return;
      const tree = treeStateFromLists(response.progenitorId, response.persons, response.unions);
      needsReload = false;
      attempt = 0;
      set({
        tree,
        confirmedTree: tree,
        confirmedVersion: response.version,
        pending: [],
        retrying: false,
        notice: { kind: 'reloaded' },
      });
    } catch (error) {
      if (mine !== session) return;
      if (isUnauthenticated(error)) {
        stopSignedOut();
      } else if (isRetryable(error)) {
        scheduleRetry(mine);
      } else if (isRefusal(error)) {
        // The tree is gone or no longer ours (404, 403). The pending ops stay in the store: the
        // app-level UnsentChangesGuard (dialog and beforeunload) still counts them, and the next
        // load() reports them as discarded.
        needsReload = false;
        attempt = 0;
        set({ status: 'error', loadError: error, retrying: false });
      } else {
        // An answer we cannot read: try again later rather than at once.
        scheduleRetry(mine);
      }
    }
  }

  async function send(clanId: string, op: Op, baseVersion: number, mine: number): Promise<void> {
    try {
      const { seq } = await submitOp(clanId, { op, baseVersion });
      if (mine !== session) return;
      attempt = 0;
      const state = get();
      set({
        confirmedTree: applyOp(state.confirmedTree, op).tree,
        confirmedVersion: seq,
        pending: state.pending.slice(1),
        retrying: false,
      });
    } catch (error) {
      if (mine !== session) return;
      if (isRetryable(error)) {
        scheduleRetry(mine);
      } else if (isUnauthenticated(error)) {
        stopSignedOut();
      } else if (isRefusal(error) && !isConflict(error)) {
        attempt = 0;
        reject(error);
      } else {
        // 409, or no answer we can trust: a 2xx with an unreadable body (INVALID_RESPONSE; the
        // op may well be saved) or a non-API error. Start again from the server's tree.
        attempt = 0;
        needsReload = true;
      }
    }
  }

  async function flush(): Promise<void> {
    if (sending || retryTimer !== undefined) return;
    const { clanId, status, signedOut, pending, confirmedVersion } = get();
    if (clanId === null || status !== 'ready' || signedOut) return;
    const op = pending[0];
    if (!needsReload && op === undefined) return;
    const mine = session;
    sending = true;
    try {
      if (needsReload) await reload(clanId, mine);
      else if (op !== undefined) await send(clanId, op, confirmedVersion, mine);
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
      if (mine !== session || sending || needsReload || state.pending.length > 0) return;
      if (response.version <= state.confirmedVersion) return;
      const tree = treeStateFromLists(response.progenitorId, response.persons, response.unions);
      set({ tree, confirmedTree: tree, confirmedVersion: response.version });
    } catch {
      // The tree on screen is still valid; the next op's 409 would catch a missed change.
    }
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
          if (current.pending.length > 0 || needsReload) {
            resume();
            return Promise.resolve();
          }
          return refresh(clanId);
        }
      }

      // A new session. Unsent ops of the previous one are dropped: say how many (UnsentChangesGuard
      // asks before another tree opens and empties the queue itself when the user agrees, so
      // this notice only shows when something else got here).
      const discarded = current.pending.length;
      session += 1;
      const mine = session;
      sending = false;
      needsReload = false;
      clearRetry();
      set({
        ...INITIAL,
        clanId,
        status: 'loading',
        notice: discarded > 0 ? { kind: 'discarded', count: discarded } : null,
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

    apply(op) {
      const state = get();
      if (state.status !== 'ready') return { ok: false, reason: 'NOT_LOADED' };
      try {
        const { tree } = applyOp(state.tree, op);
        set({ tree, pending: [...state.pending, op] });
      } catch (error) {
        if (error instanceof OpError) return { ok: false, reason: error.code };
        throw error;
      }
      resume();
      return { ok: true };
    },

    dismissNotice() {
      set({ notice: null });
    },
  };
});

/**
 * Forgets everything, including the module-level send state: answers still on their way are
 * ignored and nothing more is sent. For sign-out, a change of account, the user discarding
 * unsent changes, and tests.
 */
export function resetTreeStore(): void {
  session += 1;
  sending = false;
  needsReload = false;
  loading = undefined;
  clearRetry();
  useTreeStore.setState(INITIAL);
}

/** How many changes are not saved yet, for the app shell (sign-out asks first when any). */
export function useUnsentChangeCount(): number {
  return useTreeStore(selectUnsentCount);
}
