import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

function Boom(): never {
  throw new Error('boom');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it('renders its children when nothing fails', () => {
    render(
      <AppErrorBoundary>
        <p>bình thường</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('bình thường')).toBeInTheDocument();
  });

  it('shows a bilingual recovery message when rendering fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Ứng dụng gặp lỗi khi khởi động. Hãy tải lại trang.');
    expect(alert).toHaveTextContent('The app failed to start. Please reload the page.');
    expect(screen.getByRole('button', { name: 'Tải lại trang · Reload' })).toBeInTheDocument();
  });
});
