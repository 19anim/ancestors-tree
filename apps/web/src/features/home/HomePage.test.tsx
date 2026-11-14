import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi } from '../../test/api';
import { renderRoute, renderWithProviders } from '../../test/render';
import { HomePage } from './HomePage';

const ME = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  email: 'lan@example.test',
  name: 'Lan',
  locale: 'vi',
  hasPassword: true,
  hasGoogle: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderHome() {
  renderWithProviders(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe('HomePage', () => {
  it('shows the headline, the sample tree with its legend and a link to the gallery', async () => {
    mockApi();
    renderHome();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gia phả nhà mình, dán từng tấm ảnh.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cùng con cháu dựng cây gia phả, không quên ngày giỗ.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Cây gia phả mẫu' })).toBeInTheDocument();
    expect(screen.getByText(/Sợi chỉ có ghim đỏ nối cha mẹ với con/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem bộ thiết kế' })).toHaveAttribute(
      'href',
      '/design',
    );
  });

  it('keeps the sample board for visitors once the session check says signed out', async () => {
    const api = mockApi({ 'GET /me': () => apiErrorReply('UNAUTHENTICATED', 401) });
    renderHome();
    await waitFor(() => expect(api.calls.some((call) => call.path === '/me')).toBe(true));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gia phả nhà mình, dán từng tấm ảnh.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Cây gia phả mẫu' })).toBeInTheDocument();
  });

  it('shows no sample board while the session is still being checked', async () => {
    mockApi({ 'GET /me': () => ({ body: ME }), 'GET /clans': () => ({ body: [] }) });
    renderRoute('/');
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Cây gia phả mẫu' })).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cây gia phả của tôi' }),
    ).toBeInTheDocument();
  });

  it('lets keyboard users focus the scrollable board', async () => {
    mockApi();
    renderHome();
    const scroller = await screen.findByRole('region', {
      name: 'Khung cuộn ngang của cây gia phả mẫu',
    });
    expect(scroller).toHaveAttribute('tabindex', '0');
    expect(scroller).toContainElement(screen.getByRole('group', { name: 'Cây gia phả mẫu' }));
  });

  it('sends signed-in users to their family trees', async () => {
    mockApi({ 'GET /me': () => ({ body: ME }), 'GET /clans': () => ({ body: [] }) });
    renderRoute('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cây gia phả của tôi' }),
    ).toBeInTheDocument();
  });
});
