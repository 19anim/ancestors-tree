import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ME } from '../features/clans/fixtures';
import { apiRequest } from '../shared/lib/apiClient';
import { ApiError } from '../shared/lib/apiError';
import { mockApi, UNAUTHENTICATED_REPLY } from '../test/api';
import { createQueryClient } from './providers';

afterEach(() => {
  vi.unstubAllGlobals();
});

function seed() {
  const client = createQueryClient();
  client.setQueryData(['me'], ME);
  client.setQueryData(['clans'], [{ id: 'previous-user-clan' }]);
  client.setQueryData(['clans', 'x', 'members'], []);
  return client;
}

describe('createQueryClient session rules', () => {
  it('drops the previous user data when a query finds the session over', async () => {
    mockApi({ 'GET /clans/x': () => UNAUTHENTICATED_REPLY });
    const client = seed();
    await expect(
      client.fetchQuery({
        queryKey: ['clan', 'x'],
        queryFn: () => apiRequest('/clans/x', z.unknown()),
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(client.getQueryData(['me'])).toBeNull();
    expect(client.getQueryData(['clans'])).toBeUndefined();
    expect(client.getQueryData(['clans', 'x', 'members'])).toBeUndefined();
  });

  it('does the same when a mutation finds the session over', async () => {
    mockApi({ 'POST /clans': () => UNAUTHENTICATED_REPLY });
    const client = seed();
    await expect(
      client
        .getMutationCache()
        .build(client, { mutationFn: () => apiRequest('/clans', z.unknown(), { method: 'POST' }) })
        .execute(undefined),
    ).rejects.toBeInstanceOf(ApiError);
    expect(client.getQueryData(['me'])).toBeNull();
    expect(client.getQueryData(['clans'])).toBeUndefined();
  });

  it('does the same when /me answers signed out', async () => {
    mockApi();
    const client = seed();
    await client.fetchQuery({
      queryKey: ['me'],
      queryFn: () => Promise.resolve(null),
      staleTime: 0,
    });
    expect(client.getQueryData(['clans'])).toBeUndefined();
    expect(client.getQueryData(['me'])).toBeNull();
  });
});
