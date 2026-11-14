import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';
import { useTreeStore } from '../tree/store';
import { CLAN, CLAN_ID, ME } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClanSettingsPage', () => {
  it('shows the server error when saving is forbidden', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /me': () => ({ body: ME }),
      [`GET /clans/${CLAN_ID}`]: () => ({ body: CLAN }),
      [`PATCH /clans/${CLAN_ID}`]: () => apiErrorReply('FORBIDDEN', 403),
    });
    renderRoute(`/clans/${CLAN_ID}/settings`);
    await user.click(await screen.findByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bạn không có quyền thực hiện thao tác này.',
    );
    expect(screen.queryByText('Đã lưu thay đổi')).not.toBeInTheDocument();
  });

  it('the owner saves changes', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /me': () => ({ body: ME }),
      [`GET /clans/${CLAN_ID}`]: () => ({ body: CLAN }),
      [`PATCH /clans/${CLAN_ID}`]: () => ({ body: { ...CLAN, description: 'Gia phả' } }),
      'GET /clans': () => ({ body: [CLAN] }),
    });
    renderRoute(`/clans/${CLAN_ID}/settings`);
    expect(await screen.findByLabelText('Tên cây gia phả')).toHaveValue('Họ Nguyễn');
    expect(screen.getByLabelText('Quê quán')).toHaveValue('Nam Định');
    const description = screen.getByLabelText('Giới thiệu');
    await user.clear(description);
    await user.type(description, 'Gia phả');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Đã lưu thay đổi')).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === 'PATCH')?.body).toMatchObject({
      description: 'Gia phả',
    });
  });

  it('the owner deletes the family tree after typing its name', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /me': () => ({ body: ME }),
      [`GET /clans/${CLAN_ID}`]: () => ({ body: CLAN }),
      [`DELETE /clans/${CLAN_ID}`]: () => ({ status: 204 }),
      'GET /clans': () => ({ body: [] }),
    });
    renderRoute(`/clans/${CLAN_ID}/settings`);
    await user.click(await screen.findByRole('button', { name: 'Xoá cây gia phả này' }));
    const dialog = screen.getByRole('dialog', { name: 'Xoá Họ Nguyễn?' });
    const confirm = within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Nhập "Họ Nguyễn" để xác nhận'), 'Họ Nguyễn');
    await user.click(confirm);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cây gia phả của tôi' }),
    ).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === 'DELETE')).toBe(true);
    // The list page asked the server again, after the delete.
    const order = api.calls.map((c) => `${c.method} ${c.path}`);
    expect(order.lastIndexOf('GET /clans')).toBeGreaterThan(
      order.indexOf(`DELETE /clans/${CLAN_ID}`),
    );
  });

  it('drops the queued edits when the deleted tree is the one loaded in the tree store', async () => {
    const user = userEvent.setup();
    useTreeStore.setState({ clanId: CLAN_ID, status: 'ready' });
    mockApi({
      'GET /me': () => ({ body: ME }),
      [`GET /clans/${CLAN_ID}`]: () => ({ body: CLAN }),
      [`DELETE /clans/${CLAN_ID}`]: () => ({ status: 204 }),
      'GET /clans': () => ({ body: [] }),
    });
    renderRoute(`/clans/${CLAN_ID}/settings`);
    await user.click(await screen.findByRole('button', { name: 'Xoá cây gia phả này' }));
    const dialog = screen.getByRole('dialog', { name: 'Xoá Họ Nguyễn?' });
    await user.type(within(dialog).getByLabelText('Nhập "Họ Nguyễn" để xác nhận'), 'Họ Nguyễn');
    await user.click(within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' }));
    await screen.findByRole('heading', { level: 1, name: 'Cây gia phả của tôi' });
    expect(useTreeStore.getState().clanId).toBeNull();
  });

  it('keeps the dialog open and explains when deleting fails', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /me': () => ({ body: ME }),
      [`GET /clans/${CLAN_ID}`]: () => ({ body: CLAN }),
      [`DELETE /clans/${CLAN_ID}`]: () => apiErrorReply('FORBIDDEN', 403),
    });
    renderRoute(`/clans/${CLAN_ID}/settings`);
    await user.click(await screen.findByRole('button', { name: 'Xoá cây gia phả này' }));
    const dialog = screen.getByRole('dialog', { name: 'Xoá Họ Nguyễn?' });
    await user.type(within(dialog).getByLabelText('Nhập "Họ Nguyễn" để xác nhận'), 'Họ Nguyễn');
    await user.click(within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Bạn không có quyền thực hiện thao tác này.',
    );
  });

  it('matches the typed name to a stored name in another Unicode form', async () => {
    const user = userEvent.setup();
    const stored = 'Họ Nguyễn'.normalize('NFD');
    mockApi({
      'GET /me': () => ({ body: ME }),
      [`GET /clans/${CLAN_ID}`]: () => ({ body: { ...CLAN, name: stored } }),
    });
    renderRoute(`/clans/${CLAN_ID}/settings`);
    await user.click(await screen.findByRole('button', { name: 'Xoá cây gia phả này' }));
    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/Nhập .* để xác nhận/),
      ' ' + 'Họ Nguyễn'.normalize('NFC'),
    );
    expect(within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' })).toBeEnabled();
  });

  it('returns focus to the delete button after Cancel and after Escape', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /me': () => ({ body: ME }),
      [`GET /clans/${CLAN_ID}`]: () => ({ body: CLAN }),
    });
    renderRoute(`/clans/${CLAN_ID}/settings`);
    const open = await screen.findByRole('button', { name: 'Xoá cây gia phả này' });
    await user.click(open);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(open).toHaveFocus());
    await user.click(open);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(open).toHaveFocus());
  });

  it('shows a pending label and cannot be closed while the request runs', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockApi({
      'GET /me': () => ({ body: ME }),
      [`GET /clans/${CLAN_ID}`]: () => ({ body: CLAN }),
      [`DELETE /clans/${CLAN_ID}`]: async () => {
        await gate;
        return { status: 204 };
      },
      'GET /clans': () => ({ body: [] }),
    });
    renderRoute(`/clans/${CLAN_ID}/settings`);
    await user.click(await screen.findByRole('button', { name: 'Xoá cây gia phả này' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nhập .* để xác nhận/), 'Họ Nguyễn');
    await user.click(within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' }));
    expect(await within(dialog).findByRole('button', { name: 'Đang xoá…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Huỷ' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    release();
    await screen.findByRole('heading', { level: 1, name: 'Cây gia phả của tôi' });
  });

  it('explains when the tree is already gone (404)', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /me': () => ({ body: ME }),
      [`GET /clans/${CLAN_ID}`]: () => ({ body: CLAN }),
      [`DELETE /clans/${CLAN_ID}`]: () => apiErrorReply('CLAN_NOT_FOUND', 404),
    });
    renderRoute(`/clans/${CLAN_ID}/settings`);
    await user.click(await screen.findByRole('button', { name: 'Xoá cây gia phả này' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nhập .* để xác nhận/), 'Họ Nguyễn');
    await user.click(within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows no delete button to an editor', async () => {
    mockApi({
      'GET /me': () => ({ body: ME }),
      [`GET /clans/${CLAN_ID}`]: () => ({ body: { ...CLAN, role: 'editor' } }),
    });
    renderRoute(`/clans/${CLAN_ID}/settings`);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá cây gia phả này' })).not.toBeInTheDocument();
  });
});
