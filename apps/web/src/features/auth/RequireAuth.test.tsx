import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createQueryClient } from '../../app/providers';
import { apiRequest } from '../../shared/lib/apiClient';
import { ApiError } from '../../shared/lib/apiError';
import { serverAwake, useWakeStore } from '../../shared/lib/wake';
import { mockApi, UNAUTHENTICATED_REPLY } from '../../test/api';
import { renderRoute } from '../../test/render';

const USER = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  email: 'lan@example.test',
  name: 'Nguyễn Thị Lan',
  locale: 'vi',
  hasPassword: true,
  hasGoogle: false,
};

/** Signed in on /clans, then the server falls asleep: the next /me answers a bare 502. */
async function signedInThenAsleep() {
  let asleep = false;
  mockApi({
    'GET /me': () => (asleep ? { status: 502 } : { body: USER }),
    'GET /clans': () => ({ body: [] }),
  });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });
  queryClient.setQueryData(['me'], USER);
  renderRoute('/clans', queryClient);
  const page = await screen.findByRole('heading', { level: 1, name: 'Cây gia phả của tôi' });

  asleep = true;
  await act(() => queryClient.invalidateQueries({ queryKey: ['me'] }));
  await waitFor(() => expect(queryClient.getQueryState(['me'])?.status).toBe('error'));
  expect(queryClient.getQueryData(['me'])).toEqual(USER);
  return page;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
    await screen.findByRole('link', { name: 'Cây gia phả' });
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

  it('waits instead of showing the error page while the server wakes up', async () => {
    mockApi({ 'GET /me': () => ({ status: 502, body: 'Bad gateway' }) });
    const queryClient = createQueryClient();
    queryClient.setDefaultOptions({
      queries: { ...queryClient.getDefaultOptions().queries, retry: false },
    });
    renderRoute('/clans', queryClient);

    await waitFor(() => expect(queryClient.getQueryState(['me'])?.status).toBe('error'));
    expect(useWakeStore.getState().phase).toBe('waking');
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Trang này gặp lỗi' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the page mounted with the cached user when a refetch fails while the server wakes up', async () => {
    const page = await signedInThenAsleep();
    expect(useWakeStore.getState().phase).toBe('waking');
    expect(page).toBeInTheDocument();
    expect(screen.queryByText('Đang tải…')).not.toBeInTheDocument();
  });

  it('shows the error page when the server is back but /me still fails', async () => {
    // The route error page logs what it caught.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const page = await signedInThenAsleep();

    act(() => serverAwake());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Trang này gặp lỗi' }),
    ).toBeInTheDocument();
    expect(page).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });
});
