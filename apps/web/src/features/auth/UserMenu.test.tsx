import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '../../app/providers';
import { mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';
import { UserMenu } from './UserMenu';

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

  describe('asking before signing out', () => {
    const SENT_BODY = 'Còn 2 thay đổi chưa lưu. Đăng xuất thì các thay đổi này sẽ bị bỏ.';
    const PROFILE_BODY =
      'Bạn đã sửa hồ sơ nhưng chưa lưu. Đăng xuất thì những thay đổi này sẽ mất.';

    function renderMenu() {
      mockApi({ 'GET /me': () => ({ body: LAN }) });
      const queryClient = createQueryClient();
      const ui = (props: { unsentChanges: number; unsavedProfile: boolean }) => (
        <AppProviders queryClient={queryClient}>
          <MemoryRouter>
            <UserMenu {...props} />
          </MemoryRouter>
        </AppProviders>
      );
      return { ui, ...render(ui({ unsentChanges: 2, unsavedProfile: false })) };
    }

    it('keeps its wording when the unsent changes go out while it asks', async () => {
      const user = userEvent.setup();
      const { ui, rerender } = renderMenu();
      await user.click(await screen.findByRole('button', { name: 'Đăng xuất' }));
      const dialog = screen.getByRole('dialog', { name: 'Đăng xuất?' });
      expect(dialog).toHaveAccessibleDescription(SENT_BODY);
      // The queue empties meanwhile; nothing in the profile is unsaved.
      rerender(ui({ unsentChanges: 0, unsavedProfile: false }));
      expect(dialog).not.toHaveAccessibleDescription(PROFILE_BODY);
      expect(dialog).toHaveAccessibleDescription(SENT_BODY);
    });

    it('names both the unsent changes and the unsaved profile', async () => {
      const user = userEvent.setup();
      const { ui, rerender } = renderMenu();
      rerender(ui({ unsentChanges: 2, unsavedProfile: true }));
      await user.click(await screen.findByRole('button', { name: 'Đăng xuất' }));
      expect(screen.getByRole('dialog', { name: 'Đăng xuất?' })).toHaveAccessibleDescription(
        `${SENT_BODY} Các thay đổi chưa lưu trong hồ sơ cũng sẽ mất.`,
      );
    });
  });
});
