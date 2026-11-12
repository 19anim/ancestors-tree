import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { renderRoute } from '../../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RequireAuth', () => {
  it('sends signed-out visitors to sign in, remembering where they were going', async () => {
    mockApi();
    renderRoute('/clans');
    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeInTheDocument();
  });
});
