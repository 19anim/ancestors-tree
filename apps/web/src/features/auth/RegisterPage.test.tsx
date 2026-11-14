import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';
import { resetTreeStore, useTreeStore } from '../tree/store';

const ID = '64b7f0c2a1b2c3d4e5f6a0f1';

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Tên hiển thị'), 'Nguyễn Thị Lan');
  await user.type(screen.getByLabelText('Email'), 'lan@example.test');
  await user.type(screen.getByLabelText('Mật khẩu'), 'long-enough-password');
  await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
}

describe('RegisterPage', () => {
  it('creates the account in the current language', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'POST /auth/register': ({ body }) => ({
        status: 201,
        body: {
          ...(body as object),
          id: '64b7f0c2a1b2c3d4e5f60718',
          hasPassword: true,
          hasGoogle: false,
        },
      }),
    });
    renderRoute('/register?returnTo=/design');
    await fillForm(user);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bộ thiết kế' }),
    ).toBeInTheDocument();
    expect(api.calls.find((call) => call.path === '/auth/register')?.body).toEqual({
      name: 'Nguyễn Thị Lan',
      email: 'lan@example.test',
      password: 'long-enough-password',
      locale: 'vi',
    });
  });

  it('warns that Google sign-in drops unsaved tree changes, only while there are any', async () => {
    mockApi({ 'GET /auth/providers': () => ({ body: { google: true } }) });
    renderRoute('/register');
    await screen.findByRole('link', { name: 'Tiếp tục với Google' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => useTreeStore.setState({ pending: [{ type: 'deletePerson', payload: { id: ID } }] }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Đăng nhập bằng Google sẽ rời khỏi trang này và bỏ 1 thay đổi chưa lưu.',
    );
    act(() => resetTreeStore());
  });

  it('puts a taken email next to the email field', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /auth/register': () => apiErrorReply('EMAIL_TAKEN', 409) });
    renderRoute('/register');
    await fillForm(user);
    expect(
      await screen.findByText('Email này đã có tài khoản. Hãy đăng nhập hoặc lấy lại mật khẩu.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });
});
