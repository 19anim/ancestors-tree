import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi, type MockRoutes } from '../../test/api';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, INVITE, ME, MEMBERS, TUAN_ID } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

function ownerRoutes(extra: MockRoutes = {}): MockRoutes {
  return {
    'GET /me': () => ({ body: ME }),
    [`GET /clans/${CLAN_ID}`]: () => ({ body: CLAN }),
    [`GET /clans/${CLAN_ID}/members`]: () => ({ body: MEMBERS }),
    [`GET /clans/${CLAN_ID}/invites`]: () => ({ body: [] }),
    ...extra,
  };
}

describe('ClanMembersPage', () => {
  it('the owner changes a role', async () => {
    const user = userEvent.setup();
    const api = mockApi(
      ownerRoutes({
        [`PATCH /clans/${CLAN_ID}/members/${TUAN_ID}`]: () => ({
          body: { ...MEMBERS[1], role: 'editor' },
        }),
      }),
    );
    renderRoute(`/clans/${CLAN_ID}/members`);
    const select = await screen.findByRole('combobox', { name: 'Vai trò của Tuấn' });
    await user.selectOptions(select, 'Biên tập');
    expect(
      api.calls.find((call) => call.method === 'PATCH' && call.path.endsWith(TUAN_ID))?.body,
    ).toEqual({ role: 'editor' });
    expect(screen.queryByRole('combobox', { name: 'Vai trò của Lan' })).not.toBeInTheDocument();
    expect(screen.getByText('(bạn)')).toBeInTheDocument();
  });

  it('the owner removes a member after confirming', async () => {
    const user = userEvent.setup();
    const api = mockApi(
      ownerRoutes({ [`DELETE /clans/${CLAN_ID}/members/${TUAN_ID}`]: () => ({ status: 204 }) }),
    );
    renderRoute(`/clans/${CLAN_ID}/members`);
    await user.click(await screen.findByRole('button', { name: 'Xoá Tuấn khỏi dòng họ' }));
    const dialog = await screen.findByRole('dialog', { name: 'Xoá Tuấn khỏi dòng họ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Xoá khỏi dòng họ' }));
    await vi.waitFor(() =>
      expect(
        api.calls.some((call) => call.method === 'DELETE' && call.path.endsWith(TUAN_ID)),
      ).toBe(true),
    );
  });

  it('a viewer can only leave', async () => {
    const user = userEvent.setup();
    let left = false;
    const api = mockApi({
      'GET /me': () => ({ body: { ...ME, id: TUAN_ID } }),
      [`GET /clans/${CLAN_ID}`]: () =>
        left ? apiErrorReply('NOT_FOUND', 404) : { body: { ...CLAN, role: 'viewer' } },
      [`GET /clans/${CLAN_ID}/members`]: () => ({
        body: [
          { ...MEMBERS[0], email: undefined, isYou: false },
          { ...MEMBERS[1], email: undefined, isYou: true },
        ],
      }),
      [`DELETE /clans/${CLAN_ID}/members/${TUAN_ID}`]: () => {
        left = true;
        return { status: 204 };
      },
      'GET /clans': () => ({ body: [] }),
    });
    renderRoute(`/clans/${CLAN_ID}/members`);
    await user.click(await screen.findByRole('button', { name: 'Rời dòng họ' }));
    let alertSeen = false;
    const observer = new MutationObserver(() => {
      if (document.querySelector('[role="alert"]')) alertSeen = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    expect(screen.queryByRole('combobox', { name: /Vai trò của/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cài đặt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Link mời' })).not.toBeInTheDocument();
    const dialog = await screen.findByRole('dialog', { name: 'Rời Họ Nguyễn?' });
    await user.click(within(dialog).getByRole('button', { name: 'Rời dòng họ' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Dòng họ của tôi' }),
    ).toBeInTheDocument();
    observer.disconnect();
    expect(api.calls.some((call) => call.method === 'DELETE')).toBe(true);
    expect(alertSeen).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const deleteIndex = api.calls.findIndex((call) => call.method === 'DELETE');
    expect(
      api.calls
        .slice(deleteIndex)
        .some((call) => call.method === 'GET' && call.path === `/clans/${CLAN_ID}`),
    ).toBe(false);
  });

  it('shows an error when the clipboard rejects', async () => {
    const user = userEvent.setup();
    mockApi(ownerRoutes({ [`GET /clans/${CLAN_ID}/invites`]: () => ({ body: [INVITE] }) }));
    renderRoute(`/clans/${CLAN_ID}/members`);
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    await user.click(await screen.findByRole('button', { name: /^Sao chép link mời/ }));
    expect(await screen.findByText(/Không sao chép được/)).toBeInTheDocument();
  });

  it('the owner creates, copies and revokes invite links', async () => {
    const user = userEvent.setup();
    const invites: (typeof INVITE)[] = [];
    const api = mockApi(
      ownerRoutes({
        [`GET /clans/${CLAN_ID}/invites`]: () => ({ body: invites }),
        [`POST /clans/${CLAN_ID}/invites`]: () => {
          invites.push({ ...INVITE, role: 'editor' });
          return { status: 201, body: invites[0] };
        },
        [`DELETE /clans/${CLAN_ID}/invites/${INVITE.id}`]: () => {
          invites.length = 0;
          return { status: 204 };
        },
      }),
    );
    renderRoute(`/clans/${CLAN_ID}/members`);
    await user.selectOptions(await screen.findByLabelText('Vai trò khi tham gia'), 'Biên tập');
    await user.click(screen.getByRole('button', { name: 'Tạo link mời' }));
    expect(
      api.calls.find((call) => call.method === 'POST' && call.path.endsWith('/invites'))?.body,
    ).toEqual({ role: 'editor' });
    const url = `${window.location.origin}/join/${INVITE.token}`;
    expect(await screen.findByDisplayValue(url)).toHaveAttribute('readonly');
    await user.click(screen.getByRole('button', { name: /^Sao chép link mời Biên tập/ }));
    expect(await navigator.clipboard.readText()).toBe(url);
    expect(await screen.findByText('Đã sao chép link')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Thu hồi link mời Biên tập/ }));
    await vi.waitFor(() =>
      expect(
        api.calls.some((call) => call.method === 'DELETE' && call.path.endsWith(INVITE.id)),
      ).toBe(true),
    );
  });
});
