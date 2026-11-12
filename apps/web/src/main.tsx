import './styles/fonts';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AppProviders } from './app/providers';
import { i18nReady } from './shared/i18n';
import {
  applyTheme,
  getLocalStorage,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
} from './shared/ui';

applyTheme(resolveTheme(readThemePreference(getLocalStorage()), systemPrefersDark()));

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element in index.html');

void i18nReady.then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </StrictMode>,
  );
});
