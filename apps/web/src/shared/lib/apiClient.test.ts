import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiRequest } from './apiClient';
import { ApiError } from './apiError';

const ItemSchema = z.object({ id: z.string() });

function mockFetch(implementation: () => Promise<Response>) {
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

  it('throws INVALID_RESPONSE when an error body is not an API error', async () => {
    mockFetch(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(apiRequest('/items', ItemSchema)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    });
  });
});
