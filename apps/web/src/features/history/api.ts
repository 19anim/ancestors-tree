import { HistoryPageSchema, type HistoryPage } from '@ancestors-tree/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiRequest } from '../../shared/lib/apiClient';

export const historyKeys = {
  list: (clanId: string) => ['clans', clanId, 'history'] as const,
};

/**
 * One page of changes, newest first, older than `before` (the newest page when null). `limit`
 * defaults to the server's page size.
 */
export function fetchHistoryPage(
  clanId: string,
  before: number | null,
  signal?: AbortSignal,
  limit?: number,
): Promise<HistoryPage> {
  const params = new URLSearchParams();
  if (before !== null) params.set('before', String(before));
  if (limit !== undefined) params.set('limit', String(limit));
  const query = params.toString();
  return apiRequest(`/clans/${clanId}/history${query ? `?${query}` : ''}`, HistoryPageSchema, {
    signal,
  });
}

export function useHistory(clanId: string) {
  return useInfiniteQuery({
    queryKey: historyKeys.list(clanId),
    queryFn: ({ pageParam, signal }) => fetchHistoryPage(clanId, pageParam, signal),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextBefore,
  });
}
