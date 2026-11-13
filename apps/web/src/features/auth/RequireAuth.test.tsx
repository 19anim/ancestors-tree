import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createQueryClient } from '../../app/providers';
import { apiRequest } from '../../shared/lib/apiClient';
import { ApiError } from '../../shared/lib/apiError';
import { mockApi, UNAUTHENTICATED_REPLY } from '../../test/api';
import { renderRoute } from '../../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RequireAuth', () => {
  it('sends signed-out visitors to sign in, remembering where they were going', async () => {
    mockApi();
    renderRoute('/clans');
    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeInTheDocument();
  });

  it('signs the user out when any query finds the session expired', async () => {
    mockApi({
      'GET /auth/providers': () => ({ body: { google: true } }),
      'GET /clans': () => UNAUTHENTICATED_REPLY,
    });
    const queryClient = createQueryClient();
    queryClient.setQueryData(['me'], {
      id: '64b7f0c2a1b2c3d4e5f60718',
      email: 'lan@example.test',
      name: 'Nguyễn Thị Lan',
      locale: 'vi',
      hasPassword: true,
      hasGoogle: false,
    });
    renderRoute('/clans', queryClient);
    // Signed in: the protected route renders, so no redirect yet.
    await screen.findByRole('link', { name: 'Dòng họ' });
    expect(screen.queryByRole('heading', { level: 1, name: 'Đăng nhập' })).not.toBeInTheDocument();

    // The silent refresh fails too (default mock), so the cache rule ends the session.
    await expect(
      queryClient.fetchQuery({
        queryKey: ['clans'],
        queryFn: () => apiRequest('/clans', z.unknown()),
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(queryClient.getQueryData(['me'])).toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Google/ })).toHaveAttribute(
      'href',
      `/api/auth/google/start?returnTo=${encodeURIComponent('/clans')}`,
    );
  });
});
