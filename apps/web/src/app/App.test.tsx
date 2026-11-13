import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/api';
import { renderWithProviders } from '../test/render';
import { App } from './App';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the home page inside the app shell with the server status', async () => {
    mockApi({
      'GET /health': () => ({
        body: { status: 'ok', version: '2.0.0', uptimeSeconds: 1, database: 'connected' },
      }),
    });
    renderWithProviders(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gia phả nhà mình, dán từng tấm ảnh.' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Máy chủ đang hoạt động (phiên bản 2.0.0)')).toBeInTheDocument();
  });
});
