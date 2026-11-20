import './styles/fonts';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AppErrorBoundary, BootFailure } from './app/AppErrorBoundary';
import { AppProviders } from './app/providers';
import { i18nReady } from './shared/i18n';
import { loadMonitoringWhenIdle, reportError, startMonitoring } from './shared/lib/monitoring';
import {
  applyTheme,
  getLocalStorage,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
} from './shared/ui';

// Production builds with a DSN only (spec §13.1). From here on, unhandled errors are queued
// until the SDK loads after the first render.
const monitoring = startMonitoring({
  enabled: import.meta.env.PROD,
  dsn: import.meta.env.VITE_SENTRY_DSN,
  release: __SENTRY_RELEASE__,
  environment: __SENTRY_ENVIRONMENT__,
});

// Before the first render, so React never renders with the wrong theme (see docs/design-system.md §7).
applyTheme(resolveTheme(readThemePreference(getLocalStorage()), systemPrefersDark()));

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element in index.html');
const root = createRoot(rootElement);

void i18nReady
  .then(
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
      reportError(error, { boundary: 'boot' });
      root.render(<BootFailure />);
    },
  )
  .finally(() => {
    if (monitoring) loadMonitoringWhenIdle();
  });
