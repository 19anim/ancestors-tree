import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { App } from './App';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the app name, the Vietnamese tagline and the server status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: 'ok', version: '2.0.0', uptimeSeconds: 1 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    renderWithProviders(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'AncestorsTree' })).toBeInTheDocument();
    expect(
      screen.getByText('Cùng con cháu dựng cây gia phả, không quên ngày giỗ.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Máy chủ đang hoạt động (phiên bản 2.0.0)')).toBeInTheDocument();
  });
});
