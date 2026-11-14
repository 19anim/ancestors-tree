import { Suspense, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router';
import { UserMenu, useCurrentUser } from '../features/auth';
import { ServerStatus } from '../features/system';
import {
  discardTreeStateForAccountChange,
  resetTreeStore,
  TreeNoticeBanner,
  UnsentChangesGuard,
  useTreeStore,
  useUnsentChangeCount,
} from '../features/tree';
import { useDocumentLanguage } from '../shared/i18n/useDocumentLanguage';
import { cn } from '../shared/lib/cn';
import { ThemeToggle } from '../shared/ui';

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'rounded-control px-3 py-2 text-sm transition-colors duration-(--duration-fast) ease-settle',
    isActive ? 'bg-paper-grid font-medium text-ink' : 'text-ink-muted hover:text-ink',
  );
}

/**
 * Unsent tree changes belong to the account that made them. When another account signs in (over
 * the previous one, or after a sign-out), they are dropped so they are never sent under it, and a
 * notice says how many. The same account signing in again after its session ended keeps them:
 * they are sent then.
 */
function useResetTreeOnAccountChange(userId: string | undefined): void {
  const lastUserId = useRef<string | undefined>(undefined);
  // A layout effect runs before every passive effect of the same commit, so the queue is empty
  // before a page (such as the tree page loading its tree) can resume sending.
  useLayoutEffect(() => {
    if (userId === undefined) return;
    if (lastUserId.current !== undefined && lastUserId.current !== userId) {
      discardTreeStateForAccountChange();
    } else if (lastUserId.current === userId) {
      // The same account is back after its session ended: send what was kept.
      useTreeStore.getState().resumeAfterSignIn();
    }
    lastUserId.current = userId;
  }, [userId]);
}

export function AppShell() {
  const { t } = useTranslation();
  useDocumentLanguage();
  const me = useCurrentUser();
  const unsentChanges = useUnsentChangeCount();
  useResetTreeOnAccountChange(me.data?.id);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only rounded-control bg-surface px-4 py-2 text-ink focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
      >
        {t('nav.skipToContent')}
      </a>

      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <Link to="/" className="relative text-lg font-bold tracking-tight text-ink">
            {t('app.name')}
            <span
              aria-hidden="true"
              className="absolute -bottom-1 left-0 h-1.5 w-10 -rotate-2 bg-(--tape-progenitor) opacity-85"
            />
          </Link>
          <nav
            aria-label={t('nav.primary')}
            className="order-last basis-full sm:order-none sm:basis-auto sm:flex-1"
          >
            <ul className="flex gap-1">
              <li>
                <NavLink to="/" end className={navLinkClass}>
                  {t('nav.home')}
                </NavLink>
              </li>
              <li>
                <NavLink to="/design" className={navLinkClass}>
                  {t('nav.designGallery')}
                </NavLink>
              </li>
              {me.data ? (
                <li>
                  <NavLink to="/clans" className={navLinkClass}>
                    {t('nav.clans')}
                  </NavLink>
                </li>
              ) : null}
            </ul>
          </nav>
          <div className="flex items-center gap-2">
            <UserMenu unsentChanges={unsentChanges} onSignedOut={resetTreeStore} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 focus:outline-none"
      >
        <TreeNoticeBanner />
        <Suspense fallback={<p className="text-ink-muted">{t('common.loading')}</p>}>
          <Outlet />
        </Suspense>
      </main>

      {/* App-wide: changes keep being sent, and can be lost, from any page. */}
      <UnsentChangesGuard />

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-4">
          <ServerStatus />
        </div>
      </footer>
    </div>
  );
}
