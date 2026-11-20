import { ApiErrorBodySchema } from '@ancestors-tree/shared';
import type { z } from 'zod';
import { ApiError, errorCodeForStatus } from './apiError';
import { hasApiErrorBody, noteFailedRequest, watchSlowRequest } from './wake';

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** Sent as JSON with Content-Type: application/json. */
  json?: unknown;
}

let refreshing: Promise<boolean> | undefined;

/** One refresh at a time, shared by every request that got a 401 meanwhile. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
    .then(
      (response) => response.ok,
      () => false,
    )
    .finally(() => {
      refreshing = undefined;
    });
  return refreshing;
}

async function send(path: string, options: ApiRequestOptions): Promise<Response> {
  const { json, headers: extraHeaders, ...init } = options;
  const headers = new Headers(extraHeaders);
  headers.set('Accept', 'application/json');
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  try {
    return await fetch(`/api${path}`, {
      ...init,
      headers,
      credentials: 'include',
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    // No answer at all: maybe a sleeping server (the wake-up screen decides, spec §13.1).
    noteFailedRequest(0, undefined);
    throw new ApiError('NETWORK_ERROR', 'Network request failed', 0);
  }
}

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  // A request still waiting after 4 s makes one quick /health check (spec §13.1).
  const stopWatching = watchSlowRequest();
  try {
    return await sendAndParse(path, schema, options);
  } finally {
    stopWatching();
  }
}

async function sendAndParse<T>(
  path: string,
  schema: z.ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  let response = await send(path, options);
  // The access cookie lasts 15 minutes: renew it once with the refresh cookie and retry.
  if (response.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) {
    response = await send(path, options);
  }

  const payload: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);

  if (!response.ok) {
    noteFailedRequest(response.status, payload);
    const apiError = ApiErrorBodySchema.safeParse(payload);
    if (apiError.success) {
      const { code, message, details, reason } = apiError.data.error;
      throw new ApiError(code, message, response.status, details, reason, { fromApiBody: true });
    }
    throw new ApiError(
      errorCodeForStatus(response.status),
      `Unexpected error response (HTTP ${response.status})`,
      response.status,
      undefined,
      undefined,
      // A code this client does not know is still the API answering.
      { fromApiBody: hasApiErrorBody(payload) },
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
