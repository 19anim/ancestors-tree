import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  vi.clearAllMocks();
});

describe('createQueryClient and error reports', () => {
  it('names the signed-in user by id only, and nobody once signed out', async () => {
    const client = createQueryClient();
    await client.fetchQuery({ queryKey: ['me'], queryFn: async () => LAN });
    expect(identifyUser).toHaveBeenLastCalledWith(LAN.id);
    await client.fetchQuery({ queryKey: ['me'], queryFn: async () => null, staleTime: 0 });
    expect(identifyUser).toHaveBeenLastCalledWith(null);
  });
});
