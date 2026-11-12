import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
  THEME_STORAGE_KEY,
  writeThemePreference,
} from './theme';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readThemePreference', () => {
  it('returns a stored preference', () => {
    expect(readThemePreference({ getItem: () => 'dark' })).toBe('dark');
  });

  it('falls back to system for missing or unknown values', () => {
    expect(readThemePreference({ getItem: () => null })).toBe('system');
    expect(readThemePreference({ getItem: () => 'purple' })).toBe('system');
    expect(readThemePreference(undefined)).toBe('system');
  });

  it('falls back to system when storage throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('denied');
      },
    };
    expect(readThemePreference(storage)).toBe('system');
  });
});

describe('writeThemePreference', () => {
  it('stores the preference under the theme key', () => {
    const setItem = vi.fn();
    writeThemePreference({ setItem }, 'light');
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');
  });

  it('ignores storage errors', () => {
    const storage = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => writeThemePreference(storage, 'dark')).not.toThrow();
  });
});

describe('resolveTheme', () => {
  it('follows the operating system only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('applyTheme', () => {
  it('writes data-theme on the given root', () => {
    const root = document.createElement('html');
    applyTheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
  });
});

describe('systemPrefersDark', () => {
  it('is false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(systemPrefersDark()).toBe(false);
  });

  it('reads the prefers-color-scheme media query', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', matchMedia);
    expect(systemPrefersDark()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
  });
});
