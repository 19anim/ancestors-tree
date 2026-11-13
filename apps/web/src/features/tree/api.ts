import {
  SubmitOpResponseSchema,
  TreeResponseSchema,
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
