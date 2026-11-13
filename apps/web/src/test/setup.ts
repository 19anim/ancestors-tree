import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { i18nReady } from '../shared/i18n';

await i18nReady;

// The tree page is a lazy chunk (React Flow); the first findBy after a lazy route can take
// longer than Testing Library's 1 s default in jsdom.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
