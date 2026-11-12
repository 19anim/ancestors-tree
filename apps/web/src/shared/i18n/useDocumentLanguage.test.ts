import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../locales/en.json';
import vi from '../../locales/vi.json';
import i18n from './index';
import { useDocumentLanguage } from './useDocumentLanguage';

afterEach(async () => {
  await i18n.changeLanguage('vi');
  document.head.querySelector('meta[name="description"]')?.remove();
});

describe('useDocumentLanguage', () => {
  it('keeps <html lang> and the meta description in sync with the language', async () => {
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = 'placeholder';
    document.head.append(meta);

    renderHook(() => useDocumentLanguage());
    expect(document.documentElement.lang).toBe('vi');
    expect(meta.content).toBe(vi.app.description);

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(document.documentElement.lang).toBe('en');
    expect(meta.content).toBe(en.app.description);
  });
});
