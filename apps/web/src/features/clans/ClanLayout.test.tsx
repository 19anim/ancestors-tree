import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, ME, MEMBERS } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClanLayout', () => {
  it('shows not-found with a way back for a clan the user is not in', async () => {
    mockApi({
      'GET /me': () => ({ body: ME }),
      [`GET /clans/${CLAN_ID}`]: () => apiErrorReply('NOT_FOUND', 404),
    });
    renderRoute(`/clans/${CLAN_ID}/members`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy nội dung bạn cần.');
    expect(screen.getByRole('link', { name: 'Về danh sách dòng họ' })).toHaveAttribute(
      'href',
      '/clans',
    );
  });

  it('redirects /clans/:id to the members tab', async () => {
    mockApi({
      'GET /me': () => ({ body: ME }),
      [`GET /clans/${CLAN_ID}`]: () => ({ body: CLAN }),
      [`GET /clans/${CLAN_ID}/members`]: () => ({ body: MEMBERS }),
      [`GET /clans/${CLAN_ID}/invites`]: () => ({ body: [] }),
    });
    renderRoute(`/clans/${CLAN_ID}`);
    expect(await screen.findByText('Tuấn')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Thành viên' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
