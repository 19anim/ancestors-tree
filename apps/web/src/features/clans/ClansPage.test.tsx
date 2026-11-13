import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, ME, MEMBERS } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClansPage', () => {
  it('shows an empty state and creates the first clan', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /me': () => ({ body: ME }),
      'GET /clans': () => ({ body: [] }),
      'POST /clans': () => ({ status: 201, body: CLAN }),
      [`GET /clans/${CLAN_ID}`]: () => ({ body: CLAN }),
      [`GET /clans/${CLAN_ID}/members`]: () => ({ body: MEMBERS }),
      [`GET /clans/${CLAN_ID}/invites`]: () => ({ body: [] }),
    });
    renderRoute('/clans');
    expect(await screen.findByText(/Bạn chưa ở trong cây gia phả nào/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tên cây gia phả'), 'Họ Nguyễn');
    await user.click(screen.getByRole('button', { name: 'Tạo cây gia phả' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Họ Nguyễn' })).toBeInTheDocument();
    expect(
      api.calls.find((call) => call.method === 'POST' && call.path === '/clans')?.body,
    ).toEqual({ name: 'Họ Nguyễn', hometown: '', description: '' });
  });

  it('lists my clans with my role', async () => {
    const otherId = '64b7f0c2a1b2c3d4e5f60009';
    mockApi({
      'GET /me': () => ({ body: ME }),
      'GET /clans': () => ({
        body: [CLAN, { ...CLAN, id: otherId, name: 'Họ Trần', role: 'viewer' }],
      }),
    });
    renderRoute('/clans');
    expect(await screen.findByRole('link', { name: 'Họ Nguyễn' })).toHaveAttribute(
      'href',
      `/clans/${CLAN_ID}/members`,
    );
    expect(screen.getByRole('link', { name: 'Họ Trần' })).toHaveAttribute(
      'href',
      `/clans/${otherId}/members`,
    );
    expect(screen.getByText('Quản lý')).toBeInTheDocument();
    expect(screen.getByText('Xem')).toBeInTheDocument();
    expect(screen.getAllByText('2 thành viên')).toHaveLength(2);
  });

  it('validates the clan name', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /me': () => ({ body: ME }),
      'GET /clans': () => ({ body: [] }),
    });
    renderRoute('/clans');
    await user.click(await screen.findByRole('button', { name: 'Tạo cây gia phả' }));
    expect(await screen.findByText('Hãy điền mục này')).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === 'POST')).toBe(false);
  });
});
