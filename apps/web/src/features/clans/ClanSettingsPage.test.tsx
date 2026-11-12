import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, ME } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClanSettingsPage', () => {
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
