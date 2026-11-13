import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, ME } from './fixtures';

// The tree page is a lazy chunk (React Flow); loading it can take a while in jsdom.
const LAZY_PAGE = { timeout: 5000 };

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
    expect(screen.getByRole('link', { name: 'Về danh sách cây gia phả' })).toHaveAttribute(
      'href',
      '/clans',
    );
  });

  it('redirects /clans/:id to the tree tab, which comes first', async () => {
    mockApi({
      'GET /me': () => ({ body: ME }),
      [`GET /clans/${CLAN_ID}`]: () => ({ body: CLAN }),
      [`GET /clans/${CLAN_ID}/tree`]: () => ({
        body: { version: 0, progenitorId: null, persons: [], unions: [] },
      }),
    });
    renderRoute(`/clans/${CLAN_ID}`);
    expect(
      await screen.findByText('Chưa có ai trong cây gia phả này.', {}, LAZY_PAGE),
    ).toBeInTheDocument();
    const tabs = within(screen.getByRole('navigation', { name: 'Mục của cây gia phả' }));
    expect(tabs.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Cây',
      'Thành viên',
      'Cài đặt',
    ]);
    expect(tabs.getByRole('link', { name: 'Cây' })).toHaveAttribute('aria-current', 'page');
  });
});
