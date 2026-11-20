import { useEffect, useRef } from 'react';
import { useWakeStore } from '../../shared/lib/wake';
import { useTreeStore } from './store';

export type ClanTreeView =
  { state: 'loading' } | { state: 'error'; error: unknown; retry: () => void } | { state: 'ready' };

/** Loads a family tree into the store for a page that shows or changes it. */
export function useClanTree(clanId: string): ClanTreeView {
  const load = useTreeStore((state) => state.load);
  const loadedClanId = useTreeStore((state) => state.clanId);
  const status = useTreeStore((state) => state.status);
  const loadError = useTreeStore((state) => state.loadError);

  // Also when the store was reset while the page stayed open (another account signed in): the
  // page would otherwise wait for good.
  const needsLoad = loadedClanId !== clanId && status === 'idle';
  useEffect(() => {
    void load(clanId);
  }, [clanId, load, needsLoad]);

  // After the wake-up screen: a load that failed while the server slept is tried again. The
  // tree is a Zustand store, which invalidateQueries does not reach. The pending queue keeps its
  // own backoff and is left alone.
  const recoveries = useWakeStore((state) => state.recoveries);
  const seenRecoveries = useRef(recoveries);
  useEffect(() => {
    if (recoveries === seenRecoveries.current) return;
    seenRecoveries.current = recoveries;
    const state = useTreeStore.getState();
    if (state.clanId === clanId && state.status === 'error') void load(clanId);
  }, [recoveries, clanId, load]);

  if (loadedClanId === clanId && status === 'error') {
    return { state: 'error', error: loadError, retry: () => void load(clanId) };
  }
  if (loadedClanId !== clanId || status !== 'ready') return { state: 'loading' };
  return { state: 'ready' };
}
