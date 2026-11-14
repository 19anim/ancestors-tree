import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../app/providers';
import { apiErrorReply, mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';
import { resetTreeStore, useTreeStore } from '../tree/store';

const ID = '64b7f0c2a1b2c3d4e5f6a0f1';

const LAN = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  email: 'lan@example.test',
  name: 'Lan',
  locale: 'vi',
  hasPassword: true,
  hasGoogle: false,
};

beforeEach(() => {
  resetTreeStore();
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it('validates before sending', async () => {
    const user = userEvent.setup();
    const api = mockApi();
    renderRoute('/login');
    await user.click(await screen.findByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Email chưa đúng định dạng')).toBeInTheDocument();
    expect(screen.getByText('Hãy điền mục này')).toBeInTheDocument();
    expect(api.calls.some((call) => call.path === '/auth/login')).toBe(false);
  });

  it('signs in and goes to the requested page', async () => {
    const user = userEvent.setup();
    const api = mockApi({ 'POST /auth/login': () => ({ body: LAN }) });
    renderRoute('/login?returnTo=/design');
    await user.type(await screen.findByLabelText('Email'), 'Lan@Example.test');
    await user.type(screen.getByLabelText('Mật khẩu'), 'long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bộ thiết kế' }),
    ).toBeInTheDocument();
    expect(api.calls.find((call) => call.path === '/auth/login')?.body).toEqual({
      email: 'lan@example.test',
      password: 'long-enough-password',
    });
  });

  it('shows a wrong password above the button', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /auth/login': () => apiErrorReply('INVALID_CREDENTIALS', 401) });
    renderRoute('/login');
    await user.type(await screen.findByLabelText('Email'), 'lan@example.test');
    await user.type(screen.getByLabelText('Mật khẩu'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu chưa đúng.');
  });

  it('offers Google only when it is configured, and explains a failed attempt', async () => {
    mockApi({ 'GET /auth/providers': () => ({ body: { google: true } }) });
    renderRoute('/login?error=google&returnTo=/clans/abc');
    expect(await screen.findByRole('link', { name: 'Tiếp tục với Google' })).toHaveAttribute(
      'href',
      '/api/auth/google/start?returnTo=%2Fclans%2Fabc',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Chưa đăng nhập được bằng Google');
  });

  it('warns that Google sign-in drops unsaved tree changes, only while there are any', async () => {
    mockApi({ 'GET /auth/providers': () => ({ body: { google: true } }) });
    renderRoute('/login');
    await screen.findByRole('link', { name: 'Tiếp tục với Google' });
    expect(
      screen.queryByText(/Đăng nhập bằng Google sẽ rời khỏi trang này/),
    ).not.toBeInTheDocument();

    act(() => useTreeStore.setState({ pending: [{ type: 'deletePerson', payload: { id: ID } }] }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Đăng nhập bằng Google sẽ rời khỏi trang này và bỏ 1 thay đổi chưa lưu.',
    );
    act(() => useTreeStore.setState({ pending: [] }));
    expect(
      screen.queryByText(/Đăng nhập bằng Google sẽ rời khỏi trang này/),
    ).not.toBeInTheDocument();
  });

  it('ignores return paths outside the app', async () => {
    mockApi({ 'GET /auth/providers': () => ({ body: { google: true } }) });
    renderRoute('/login?returnTo=https://evil.example.test');
    expect(await screen.findByRole('link', { name: 'Tiếp tục với Google' })).toHaveAttribute(
      'href',
      '/api/auth/google/start?returnTo=%2Fclans',
    );
  });

  it('never shows the previous user data to the next person who signs in', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /auth/login': () => ({ body: LAN }) });
    const queryClient = createQueryClient();
    queryClient.setQueryData(['clans'], [{ id: 'previous-user-clan' }]);
    renderRoute('/login?returnTo=/design', queryClient);
    await user.type(await screen.findByLabelText('Email'), 'lan@example.test');
    await user.type(screen.getByLabelText('Mật khẩu'), 'long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await screen.findByRole('heading', { level: 1, name: 'Bộ thiết kế' });
    expect(queryClient.getQueryData(['clans'])).toBeUndefined();
    expect(queryClient.getQueryData(['me'])).toEqual(LAN);
  });
});
