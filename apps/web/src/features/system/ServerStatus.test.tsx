import { screen, waitFor } from '@testing-library/react';
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
  it('announces checking, then the running version, in one polite live region', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => healthy()),
    );
    renderWithProviders(<ServerStatus />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Đang kết nối máy chủ…');

    await waitFor(() =>
      expect(status).toHaveTextContent('Máy chủ đang hoạt động (phiên bản 1.4.0)'),
    );
    expect(status).toHaveAttribute('data-state', 'ok');
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('shows a translated error, then progress while retrying, then the version', async () => {
    const user = userEvent.setup();
    let finishRetry: (response: Response) => void = () => undefined;
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishRetry = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<ServerStatus />);
    const status = screen.getByRole('status');

    await waitFor(() =>
      expect(status).toHaveTextContent(
        'Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.',
      ),
    );
    expect(status).toHaveAttribute('data-state', 'error');

    const retry = screen.getByRole('button', { name: 'Thử lại' });
    await user.click(retry);

    await waitFor(() => expect(status).toHaveTextContent('Đang kết nối máy chủ…'));
    // aria-disabled instead of disabled: a disabled button would drop keyboard focus.
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    expect(retry).toHaveFocus();

    await user.click(retry);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    finishRetry(healthy());

    await waitFor(() =>
      expect(status).toHaveTextContent('Máy chủ đang hoạt động (phiên bản 1.4.0)'),
    );
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
