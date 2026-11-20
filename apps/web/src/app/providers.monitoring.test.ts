import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../shared/lib/apiError';
import { createQueryClient } from './providers';

const identifyUser = vi.hoisted(() => vi.fn());
vi.mock('../shared/lib/monitoring', () => ({ identifyUser, reportError: vi.fn() }));

const LAN = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  email: 'lan@example.test',
  name: 'Nguyễn Thị Lan',
  locale: 'vi',
  hasPassword: true,
  hasGoogle: false,
};

const sessionOver = () => new ApiError('UNAUTHENTICATED', 'Session over', 401);

afterEach(() => {
  vi.clearAllMocks();
});

describe('createQueryClient and error reports', () => {
  it('names the signed-in user by id only, and nobody once /me answers signed out', async () => {
    const client = createQueryClient();
    await client.fetchQuery({ queryKey: ['me'], queryFn: async () => LAN });
    expect(identifyUser).toHaveBeenLastCalledWith(LAN.id);
    await client.fetchQuery({ queryKey: ['me'], queryFn: async () => null, staleTime: 0 });
    expect(identifyUser).toHaveBeenLastCalledWith(null);
  });

  it('follows a sign-in and a sign-out that write the user into the cache', () => {
    const client = createQueryClient();
    // What sign-in, register and reset-password do on success, then what logout does.
    client.setQueryData(['me'], LAN);
    expect(identifyUser).toHaveBeenLastCalledWith(LAN.id);
    client.setQueryData(['me'], null);
    expect(identifyUser).toHaveBeenLastCalledWith(null);
  });

  it('ignores the other queries', async () => {
    const client = createQueryClient();
    client.setQueryData(['clans'], [{ id: 'c1' }]);
    await client.fetchQuery({ queryKey: ['clan', 'c1'], queryFn: async () => ({ id: 'c1' }) });
    expect(identifyUser).not.toHaveBeenCalled();
  });

  it('forgets the user when a query finds the session over', async () => {
    const client = createQueryClient();
    client.setQueryData(['me'], LAN);
    await expect(
      client.fetchQuery({
        queryKey: ['clan', 'c1'],
        queryFn: () => Promise.reject(sessionOver()),
        retry: false,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(identifyUser.mock.calls).toEqual([[LAN.id], [null]]);
  });

  it('forgets the user when a mutation finds the session over', async () => {
    const client = createQueryClient();
    client.setQueryData(['me'], LAN);
    await expect(
      client
        .getMutationCache()
        .build(client, { mutationFn: () => Promise.reject(sessionOver()) })
        .execute(undefined),
    ).rejects.toBeInstanceOf(ApiError);
    expect(identifyUser).toHaveBeenLastCalledWith(null);
  });
});
