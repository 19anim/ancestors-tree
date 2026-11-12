import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi, type MockRoutes } from '../../test/api';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, ME, MEMBERS } from './fixtures';

const TOKEN = 'B'.repeat(32);
const PREVIEW = {
  clanName: 'Họ Nguyễn',
  role: 'editor',
  invitedByName: 'Ông Thịnh',
  expiresAt: '2026-11-20T08:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function previewRoutes(extra: MockRoutes = {}): MockRoutes {
  return { [`GET /invites/${TOKEN}`]: () => ({ body: PREVIEW }), ...extra };
}

describe('JoinPage', () => {
  it('shows the offer and sends signed-out visitors to sign in first', async () => {
    mockApi(previewRoutes());
    renderRoute(`/join/${TOKEN}`);
    expect(
      await screen.findByText('Ông Thịnh mời bạn vào Họ Nguyễn với vai trò Biên tập.'),
    ).toBeInTheDocument();
    const returnTo = encodeURIComponent(`/join/${TOKEN}`);
    expect(await screen.findByRole('link', { name: 'Đăng nhập để tham gia' })).toHaveAttribute(
      'href',
      `/login?returnTo=${returnTo}`,
    );
    expect(screen.getByRole('link', { name: 'Tạo tài khoản' })).toHaveAttribute(
      'href',
      `/register?returnTo=${returnTo}`,
    );
  });

  it('joins when signed in', async () => {
    const user = userEvent.setup();
    mockApi(
      previewRoutes({
        'GET /me': () => ({ body: ME }),
        [`POST /invites/${TOKEN}/accept`]: () => ({
          body: { clanId: CLAN_ID, role: 'editor', alreadyMember: false },
        }),
        [`GET /clans/${CLAN_ID}`]: () => ({ body: { ...CLAN, role: 'editor' } }),
        [`GET /clans/${CLAN_ID}/members`]: () => ({ body: MEMBERS }),
        'GET /clans': () => ({ body: [CLAN] }),
      }),
    );
    renderRoute(`/join/${TOKEN}`);
    await user.click(await screen.findByRole('button', { name: 'Tham gia' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Họ Nguyễn' })).toBeInTheDocument();
  });

  it('goes to the clan when already a member', async () => {
    const user = userEvent.setup();
    mockApi(
      previewRoutes({
        'GET /me': () => ({ body: ME }),
        [`POST /invites/${TOKEN}/accept`]: () => ({
          body: { clanId: CLAN_ID, role: 'owner', alreadyMember: true },
        }),
        [`GET /clans/${CLAN_ID}`]: () => ({ body: CLAN }),
        [`GET /clans/${CLAN_ID}/members`]: () => ({ body: MEMBERS }),
        [`GET /clans/${CLAN_ID}/invites`]: () => ({ body: [] }),
        'GET /clans': () => ({ body: [CLAN] }),
      }),
    );
    renderRoute(`/join/${TOKEN}`);
    await user.click(await screen.findByRole('button', { name: 'Tham gia' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Họ Nguyễn' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Thành viên' })).toBeInTheDocument();
  });

  it('shows the error when accepting fails', async () => {
    const user = userEvent.setup();
    mockApi(
      previewRoutes({
        'GET /me': () => ({ body: ME }),
        [`POST /invites/${TOKEN}/accept`]: () => apiErrorReply('INVALID_TOKEN', 400),
      }),
    );
    renderRoute(`/join/${TOKEN}`);
    await user.click(await screen.findByRole('button', { name: 'Tham gia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Đường link này không dùng được nữa/,
    );
  });

  it('explains a link that no longer works', async () => {
    mockApi({ [`GET /invites/${TOKEN}`]: () => apiErrorReply('INVALID_TOKEN', 400) });
    renderRoute(`/join/${TOKEN}`);
    expect(await screen.findByText(/Đường link này không dùng được nữa/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
  });
});
