import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('password reset pages', () => {
  it('asks for the email and confirms without saying whether it has an account', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /auth/forgot-password': () => ({ status: 204 }) });
    renderRoute('/forgot-password');
    await user.type(await screen.findByLabelText('Email'), 'lan@example.test');
    await user.click(screen.getByRole('button', { name: 'Gửi link' }));
    // The footer's server status is a status region too, so look inside <main>.
    expect(await within(screen.getByRole('main')).findByRole('status')).toHaveTextContent(
      'Nếu email này có tài khoản',
    );
  });

  it('sends the token from the link fragment with the new password', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'POST /auth/reset-password': () => ({
        body: {
          id: '64b7f0c2a1b2c3d4e5f60718',
          email: 'lan@example.test',
          name: 'Lan',
          locale: 'vi',
          hasPassword: true,
          hasGoogle: false,
        },
      }),
    });
    // The memory router leaves the address bar alone, so seed it like a real link click.
    window.history.replaceState(null, '', `/reset-password#token=${'t'.repeat(43)}`);
    renderRoute(`/reset-password#token=${'t'.repeat(43)}`);
    await user.type(await screen.findByLabelText('Mật khẩu mới'), 'brand-new-password');
    // The token is gone from the address bar before anything is submitted.
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/reset-password');
    await user.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }));
    await vi.waitFor(() =>
      expect(api.calls.find((call) => call.path === '/auth/reset-password')?.body).toEqual({
        token: 't'.repeat(43),
        password: 'brand-new-password',
      }),
    );
  });

  it('explains a missing or used link and offers a new one', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /auth/reset-password': () => apiErrorReply('INVALID_TOKEN', 400) });
    const { unmount } = renderRoute('/reset-password');
    expect(await screen.findByText(/Link này thiếu mã đặt lại mật khẩu/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lấy link mới' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    unmount();

    renderRoute(`/reset-password#token=${'t'.repeat(43)}`);
    await user.type(await screen.findByLabelText('Mật khẩu mới'), 'brand-new-password');
    await user.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đường link này không dùng được nữa',
    );
  });
});
