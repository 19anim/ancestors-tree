import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../app/providers';
import { mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';

const LAN = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  email: 'lan@example.test',
  name: 'Nguyễn Thị Lan',
  locale: 'vi',
  hasPassword: true,
  hasGoogle: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UserMenu', () => {
  it('offers sign-in to visitors', async () => {
    mockApi();
    renderRoute('/');
    expect(await screen.findByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('shows the signed-in user and signs out', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /me': () => ({ body: LAN }),
      'POST /auth/logout': () => ({ status: 204 }),
    });
    const queryClient = createQueryClient();
    queryClient.setQueryData(['clans'], [{ id: 'previous-user-data' }]);
    renderRoute('/design', queryClient);
    expect(await screen.findByText('Nguyễn Thị Lan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cây gia phả' })).toHaveAttribute('href', '/clans');
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByRole('link', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(api.calls.some((call) => call.path === '/auth/logout')).toBe(true);
    expect(screen.queryByRole('link', { name: 'Cây gia phả' })).not.toBeInTheDocument();
    expect(queryClient.getQueryData(['me'])).toBeNull();
    expect(queryClient.getQueryData(['clans'])).toBeUndefined();
  });
});
