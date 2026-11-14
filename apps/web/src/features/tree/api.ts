import {
  OPS_PAGE_SIZE,
  OperationListSchema,
  SubmitOpResponseSchema,
  TreeResponseSchema,
  type OperationEntry,
  type SubmitOpRequest,
  type SubmitOpResponse,
  type TreeResponse,
} from '@ancestors-tree/shared';
import { apiRequest } from '../../shared/lib/apiClient';

export function fetchTree(clanId: string, signal?: AbortSignal): Promise<TreeResponse> {
  return apiRequest(`/clans/${clanId}/tree`, TreeResponseSchema, { signal });
}

export function submitOp(clanId: string, request: SubmitOpRequest): Promise<SubmitOpResponse> {
  return apiRequest(`/clans/${clanId}/ops`, SubmitOpResponseSchema, {
    method: 'POST',
    json: request,
  });
}

/** Every operation saved after version `since`, oldest first, page after page. */
export async function fetchOpsSince(clanId: string, since: number): Promise<OperationEntry[]> {
  const entries: OperationEntry[] = [];
  let after = since;
  for (;;) {
    const page = await apiRequest(`/clans/${clanId}/ops?since=${after}`, OperationListSchema);
    entries.push(...page);
    const last = page.at(-1);
    if (page.length < OPS_PAGE_SIZE || last === undefined) return entries;
    // A full page that does not move past `after` would repeat forever: stop, and let the
    // rebase's gap check decide what the entries read so far mean.
    if (last.seq <= after) return entries;
    after = last.seq;
  }
}
