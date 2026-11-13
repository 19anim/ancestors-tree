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
export type TreeNotice = { kind: 'reloaded' } | { kind: 'rejected'; error: unknown };
export type ApplyResult = { ok: true } | { ok: false; reason: OpErrorCode };

/** Waits between retries of an op the server could not take (network, 429, 5xx). */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

interface TreeStoreState {
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
  /** True while a failed send waits for its retry. */
  retrying: boolean;
  notice: TreeNotice | null;
  load: (clanId: string) => Promise<void>;
  apply: (op: Op) => ApplyResult;
  dismissNotice: () => void;
}

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
  notice: null,
};

/** A new session per load(): answers that belong to an older one are ignored. */
let session = 0;
let sending = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;

function clearRetry(): void {
  if (retryTimer !== undefined) clearTimeout(retryTimer);
  retryTimer = undefined;
  attempt = 0;
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
  async function reload(mine: number): Promise<void> {
    const { clanId } = get();
    if (clanId === null) return;
    try {
      const response = await fetchTree(clanId);
      if (mine !== session) return;
      const tree = treeStateFromLists(response.progenitorId, response.persons, response.unions);
      set({
        tree,
        confirmedTree: tree,
        confirmedVersion: response.version,
        pending: [],
        retrying: false,
        notice: { kind: 'reloaded' },
      });
    } catch (error) {
      if (mine === session) set({ status: 'error', loadError: error });
    }
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

  async function recover(error: unknown, mine: number): Promise<void> {
    if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
      attempt = 0;
      await reload(mine);
      return;
    }
    const retryable =
      error instanceof ApiError &&
      (error.status === 0 || error.status === 429 || error.status >= 500);
    if (retryable) {
      scheduleRetry(mine);
      return;
    }
    if (error instanceof ApiError) {
      attempt = 0;
      reject(error);
      return;
    }
    // Not an answer from the server (a bug or a corrupt response): start again from the server.
    await reload(mine);
  }

  async function flush(): Promise<void> {
    if (sending || retryTimer !== undefined) return;
    const { clanId, pending, confirmedVersion } = get();
    const op = pending[0];
    if (clanId === null || op === undefined) return;
    const mine = session;
    sending = true;
    try {
      const { seq } = await submitOp(clanId, { op, baseVersion: confirmedVersion });
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
      await recover(error, mine);
    } finally {
      if (mine === session) sending = false;
    }
    if (mine === session) void flush();
  }

  return {
    ...INITIAL,

    async load(clanId) {
      const current = get();
      // Coming back to the page while changes are still being saved: keep them.
      if (current.clanId === clanId && current.status === 'ready' && current.pending.length > 0) {
        return;
      }
      session += 1;
      const mine = session;
      sending = false;
      clearRetry();
      set({ ...INITIAL, clanId, status: 'loading' });
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
      }
    },

    apply(op) {
      const state = get();
      if (state.status !== 'ready') throw new Error('The tree is not loaded yet');
      try {
        const { tree } = applyOp(state.tree, op);
        set({ tree, pending: [...state.pending, op] });
      } catch (error) {
        if (error instanceof OpError) return { ok: false, reason: error.code };
        throw error;
      }
      void flush();
      return { ok: true };
    },

    dismissNotice() {
      set({ notice: null });
    },
  };
});

/** Tests: forget everything, including the module-level send state. */
export function resetTreeStore(): void {
  session += 1;
  sending = false;
  clearRetry();
  useTreeStore.setState(INITIAL);
}
