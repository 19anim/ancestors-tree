import { useEffect } from 'react';
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

  if (loadedClanId === clanId && status === 'error') {
    return { state: 'error', error: loadError, retry: () => void load(clanId) };
  }
  if (loadedClanId !== clanId || status !== 'ready') return { state: 'loading' };
  return { state: 'ready' };
}
