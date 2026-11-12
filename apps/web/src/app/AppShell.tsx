import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router';
import { ServerStatus } from '../features/system';
import { useDocumentLanguage } from '../shared/i18n/useDocumentLanguage';
import { cn } from '../shared/lib/cn';
import { ThemeToggle } from '../shared/ui';

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'rounded-control px-3 py-2 text-sm transition-colors duration-(--duration-fast) ease-settle',
    isActive ? 'bg-paper-grid font-medium text-ink' : 'text-ink-muted hover:text-ink',
  );
}

export function AppShell() {
  const { t } = useTranslation();
  useDocumentLanguage();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only rounded-control bg-surface px-4 py-2 text-ink focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
      >
        {t('nav.skipToContent')}
      </a>

      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link to="/" className="relative text-lg font-bold tracking-tight text-ink">
            {t('app.name')}
            <span
              aria-hidden="true"
              className="absolute -bottom-1 left-0 h-1.5 w-10 -rotate-2 bg-(--tape-progenitor) opacity-85"
            />
          </Link>
          <nav aria-label={t('nav.primary')} className="flex-1">
            <ul className="flex flex-wrap gap-1">
              <li>
                <NavLink to="/" end className={navLinkClass}>
                  {t('nav.home')}
                </NavLink>
              </li>
            </ul>
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 focus:outline-none"
      >
        <Suspense fallback={<p className="text-ink-muted">{t('common.loading')}</p>}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-4">
          <ServerStatus />
        </div>
      </footer>
    </div>
  );
}
