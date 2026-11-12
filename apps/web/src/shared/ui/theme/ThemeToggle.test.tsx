import { renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { THEME_STORAGE_KEY } from './theme';
import { useTheme } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ThemeToggle', () => {
  it('groups the three options under a labelled fieldset', () => {
    renderWithProviders(<ThemeToggle />);
    expect(screen.getByRole('group', { name: 'Giao diện' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('starts on "match device" and switches to dark', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'Theo máy' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Tối' }));

    expect(screen.getByRole('radio', { name: 'Tối' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('restores a stored preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderWithProviders(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'Sáng' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('follows the operating system in "match device" mode', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    renderWithProviders(<ThemeToggle />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('useTheme', () => {
  it('fails loudly outside ThemeProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useTheme())).toThrow(
      'useTheme must be used inside ThemeProvider',
    );
  });
});
