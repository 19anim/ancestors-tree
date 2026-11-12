export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'ancestors-tree:theme';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const PREFERENCES: readonly string[] = ['light', 'dark', 'system'];

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && PREFERENCES.includes(value);
}

/** localStorage, or undefined when the browser blocks it (private mode, disabled cookies). */
export function getLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readThemePreference(
  storage: Pick<Storage, 'getItem'> | undefined,
): ThemePreference {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePreference(
  storage: Pick<Storage, 'setItem'> | undefined,
  preference: ThemePreference,
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be full or blocked; the preference then lasts for this page only.
  }
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_SCHEME_QUERY).matches;
}

/** Selects the token block: tokens.css switches colors and color-scheme on data-theme. */
export function applyTheme(
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = theme;
}
