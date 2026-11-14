import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';
import { useTreeStore } from '../tree';
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
