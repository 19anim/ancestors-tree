import './styles/fonts';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AppErrorBoundary, BootFailure } from './app/AppErrorBoundary';
import { AppProviders } from './app/providers';
import { i18nReady } from './shared/i18n';
import {
  applyTheme,
  getLocalStorage,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
} from './shared/ui';

// Before the first render, so React never renders with the wrong theme (see docs/design-system.md §7).
applyTheme(resolveTheme(readThemePreference(getLocalStorage()), systemPrefersDark()));

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element in index.html');
const root = createRoot(rootElement);

void i18nReady.then(
  () => {
    root.render(
      <StrictMode>
        <AppErrorBoundary>
          <AppProviders>
            <App />
          </AppProviders>
        </AppErrorBoundary>
      </StrictMode>,
    );
  },
  (error: unknown) => {
    console.error(error);
    root.render(<BootFailure />);
  },
);
