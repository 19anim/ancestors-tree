import { ViewPreferenceSchema, type ViewPreference } from '@ancestors-tree/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { apiRequest } from '../../shared/lib/apiClient';

/** Picks within this many ms of each other are saved with one request (spec §13.4). */
export const SAVE_DELAY_MS = 500;

export function viewPreferenceKey(clanId: string) {
  return ['clans', clanId, 'view-preference'] as const;
}

function fetchViewPreference(clanId: string, signal?: AbortSignal): Promise<ViewPreference> {
  return apiRequest(`/clans/${clanId}/view-preference`, ViewPreferenceSchema, { signal });
}

function saveViewPreference(clanId: string, preference: ViewPreference): Promise<ViewPreference> {
  return apiRequest(`/clans/${clanId}/view-preference`, ViewPreferenceSchema, {
    method: 'PUT',
    json: preference,
  });
}

export type SaveState = 'idle' | 'saving' | 'failed';

export interface PersonalDecor {
  /** My choices as shown; null until they load (or when they could not be loaded). */
  preference: ViewPreference | null;
  /** Changes my choices at once and saves them a moment later; nothing before they load. */
  change: (update: (current: ViewPreference) => ViewPreference) => void;
  saveState: SaveState;
  /** Sends my current choices again, after a failed save. */
  retry: () => void;
}

/**
 * "Only for me" (spec §13.4). The board follows the query cache at once. One PUT of the whole
 * preference goes `delay` ms after the last pick; the saves run one at a time, so the last one
 * asked for is the last one stored. No undo: picking again is the undo.
 */
export function usePersonalDecor(
  clanId: string,
  { delay = SAVE_DELAY_MS }: { delay?: number } = {},
): PersonalDecor {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: viewPreferenceKey(clanId),
    queryFn: ({ signal }) => fetchViewPreference(clanId, signal),
    // Only this page changes it, and the cache holds picks not saved yet: never refetch them away.
    staleTime: Infinity,
  });
  const latestSave = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { mutate, isPending, isError } = useMutation({
    mutationFn: ({ preference }: { preference: ViewPreference; save: number }) =>
      saveViewPreference(clanId, preference),
    // One at a time, in the order asked for.
    scope: { id: `view-preference:${clanId}` },
    onSuccess: (saved, { save }) => {
      // Picks made since are on screen already; their own save answers for them.
      if (save === latestSave.current) queryClient.setQueryData(viewPreferenceKey(clanId), saved);
    },
  });

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const preference = queryClient.getQueryData<ViewPreference>(viewPreferenceKey(clanId));
    if (preference === undefined) return;
    latestSave.current += 1;
    mutate({ preference, save: latestSave.current });
  }, [clanId, mutate, queryClient]);

  const change = useCallback(
    (update: (current: ViewPreference) => ViewPreference) => {
      const key = viewPreferenceKey(clanId);
      const current = queryClient.getQueryData<ViewPreference>(key);
      if (current === undefined) return;
      void queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, update(current));
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [clanId, delay, flush, queryClient],
  );

  // Leaving the page still saves a pick that is waiting.
  const flushWaiting = useCallback(() => {
    if (timer.current !== undefined) flush();
  }, [flush]);
  useEffect(() => flushWaiting, [flushWaiting]);

  return {
    preference: query.data ?? null,
    change,
    saveState: isPending ? 'saving' : isError ? 'failed' : 'idle',
    retry: flush,
  };
}
