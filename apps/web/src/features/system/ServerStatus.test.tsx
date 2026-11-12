import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { ServerStatus } from './ServerStatus';

const healthy = () =>
  new Response(JSON.stringify({ status: 'ok', version: '1.4.0', uptimeSeconds: 12 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ServerStatus', () => {
  it('shows a checking message, then the running version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => healthy()),
    );
    renderWithProviders(<ServerStatus />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang kết nối máy chủ…');
    expect(await screen.findByText('Máy chủ đang hoạt động (phiên bản 1.4.0)')).toBeInTheDocument();
  });

  it('shows a translated error and retries on demand', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(healthy());
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<ServerStatus />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.');

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Máy chủ đang hoạt động (phiên bản 1.4.0)')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
