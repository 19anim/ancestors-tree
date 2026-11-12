import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiRequest } from './apiClient';
import { ApiError } from './apiError';

const ItemSchema = z.object({ id: z.string() });

function mockFetch(implementation: (...args: unknown[]) => Promise<Response>) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('prefixes /api, sends cookies and returns parsed data', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 'a1' }));
    await expect(apiRequest('/items/a1', ItemSchema)).resolves.toEqual({ id: 'a1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/items/a1');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('Accept')).toBe('application/json');
  });

  it('throws the server error code for API errors', async () => {
    mockFetch(async () => jsonResponse({ error: { code: 'FORBIDDEN', message: 'No' } }, 403));
    const error = await apiRequest('/items', ItemSchema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'FORBIDDEN', status: 403, message: 'No' });
  });

  it('throws NETWORK_ERROR when the request cannot be sent', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(apiRequest('/items', ItemSchema)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('throws INVALID_RESPONSE when a success body does not match the schema', async () => {
    mockFetch(async () => jsonResponse({ id: 42 }));
    await expect(apiRequest('/items', ItemSchema)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('falls back to a status-based code when an error body is not an API error', async () => {
    mockFetch(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(apiRequest('/items', ItemSchema)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 502,
    });
  });
});

describe('apiRequest options', () => {
  it('sends JSON bodies with a Content-Type', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 'a1' }, 201));
    await apiRequest('/items', ItemSchema, { method: 'POST', json: { name: 'Lan' } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"Lan"}');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    await expect(
      apiRequest('/items/a1', z.undefined(), { method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });

  it('passes the abort signal through', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 'a1' }));
    const controller = new AbortController();
    await apiRequest('/items/a1', ItemSchema, { signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it('falls back to a code by status for unknown error bodies, and keeps details', async () => {
    mockFetch(async () => jsonResponse({ error: { code: 'BRAND_NEW_CODE', message: 'x' } }, 404));
    await expect(apiRequest('/items', ItemSchema)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    mockFetch(async () =>
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: [{ path: 'body.name', message: 'Too small' }],
          },
        },
        400,
      ),
    );
    await expect(apiRequest('/items', ItemSchema)).rejects.toMatchObject({
      details: [{ path: 'body.name', message: 'Too small' }],
    });
  });
});

describe('session refresh', () => {
  const unauthenticated = () =>
    jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'Sign in' } }, 401);

  it('refreshes once on 401 and retries the request', async () => {
    let signedIn = false;
    const fetchMock = mockFetch(async (...args: unknown[]) => {
      const url = String(args[0]);
      if (url === '/api/auth/refresh') {
        signedIn = true;
        return new Response(null, { status: 204 });
      }
      return signedIn ? jsonResponse({ id: 'a1' }) : unauthenticated();
    });
    await expect(apiRequest('/items/a1', ItemSchema)).resolves.toEqual({ id: 'a1' });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      '/api/items/a1',
      '/api/auth/refresh',
      '/api/items/a1',
    ]);
  });

  it('shares one refresh between requests that fail together', async () => {
    let refreshes = 0;
    let signedIn = false;
    mockFetch(async (...args: unknown[]) => {
      if (String(args[0]) === '/api/auth/refresh') {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        signedIn = true;
        return new Response(null, { status: 204 });
      }
      return signedIn ? jsonResponse({ id: 'a1' }) : unauthenticated();
    });
    await Promise.all([apiRequest('/a', ItemSchema), apiRequest('/b', ItemSchema)]);
    expect(refreshes).toBe(1);
  });

  it('gives up with UNAUTHENTICATED when the refresh fails', async () => {
    mockFetch(async () => unauthenticated());
    await expect(apiRequest('/items/a1', ItemSchema)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    });
  });

  it('never refreshes for the auth endpoints themselves', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({ error: { code: 'INVALID_CREDENTIALS', message: 'Wrong' } }, 401),
    );
    await expect(
      apiRequest('/auth/login', ItemSchema, { method: 'POST', json: {} }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
