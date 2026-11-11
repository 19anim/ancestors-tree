import { ApiErrorBodySchema } from '@ancestors-tree/shared';
import type { z } from 'zod';
import { ApiError } from './apiError';

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Network request failed', 0);
  }

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const apiError = ApiErrorBodySchema.safeParse(payload);
    if (apiError.success) {
      const { code, message } = apiError.data.error;
      throw new ApiError(code, message, response.status);
    }
    throw new ApiError(
      'INVALID_RESPONSE',
      `Unexpected error response (HTTP ${response.status})`,
      response.status,
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      'INVALID_RESPONSE',
      'Response did not match the expected schema',
      response.status,
    );
  }
  return parsed.data;
}
