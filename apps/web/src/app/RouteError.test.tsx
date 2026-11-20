import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { RouteError } from './RouteError';

const reportError = vi.hoisted(() => vi.fn());
vi.mock('../shared/lib/monitoring', () => ({ reportError, identifyUser: vi.fn() }));

function Boom(): never {
  throw new Error('route failed');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('RouteError', () => {
  it('shows a translated recovery page when a route throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter([
      { path: '/', element: <Boom />, errorElement: <RouteError /> },
    ]);
    renderWithProviders(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Trang này gặp lỗi' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại trang' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'route failed' }), {
      boundary: 'route',
    });
  });

  it('does not report a page that does not exist', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter(
      [{ path: '/', element: <p>trang chủ</p>, errorElement: <RouteError /> }],
      { initialEntries: ['/missing'] },
    );
    renderWithProviders(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1, name: 'Trang này gặp lỗi' });
    expect(reportError).not.toHaveBeenCalled();
  });
});
