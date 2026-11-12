import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/api';
import { renderRoute } from '../test/render';

beforeEach(() => {
  mockApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('wraps the page with a skip link, navigation, theme switch and server status', async () => {
    renderRoute('/');
    expect(screen.getByRole('link', { name: 'Bỏ qua, tới nội dung chính' })).toHaveAttribute(
      'href',
      '#main',
    );
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trang chủ' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('group', { name: 'Giao diện' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(await screen.findByText('Máy chủ đang hoạt động (phiên bản 0.1.0)')).toBeInTheDocument();
  });

  it('shows the not-found page for unknown paths', async () => {
    renderRoute('/khong-co-trang-nay');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Không tìm thấy trang này' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
  });

  it('opens the design gallery from the navigation', async () => {
    renderRoute('/design');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bộ thiết kế' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bộ thiết kế' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
