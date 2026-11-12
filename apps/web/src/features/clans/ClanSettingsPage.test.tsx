import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';
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
    expect(await screen.findByLabelText('Tên dòng họ')).toHaveValue('Họ Nguyễn');
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
});
