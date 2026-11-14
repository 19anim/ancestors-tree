import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { matchPath, useBlocker } from 'react-router';
import { Button, Dialog, DialogContent } from '../../shared/ui';
import { resetTreeStore, selectUnsentCount, useTreeStore } from './store';

/** The family tree a path opens: `/clans/:id/tree`, or `/clans/:id`, which redirects there. */
function treeOpenedBy(pathname: string): string | null {
  const match = matchPath('/clans/:id/tree', pathname) ?? matchPath('/clans/:id', pathname);
  return match?.params.id ?? null;
}

/**
 * Mounted once by the app shell, so it works on every page while changes are unsent (the store
 * keeps sending them in the background, whatever page is open). They are lost only when another
 * family tree loads, the tab closes or reloads, or the user signs out (UserMenu asks for that
 * one). So: opening another tree's page asks first, and the tab asks the browser to confirm.
 * Other pages (members, settings, the list, sign-in) never ask: nothing is lost there.
 */
export function UnsentChangesGuard() {
  const { t } = useTranslation();
  const unsent = useTreeStore(selectUnsentCount);
  const loadedClanId = useTreeStore((state) => state.clanId);
  const blocker = useBlocker(({ nextLocation }) => {
    if (unsent === 0) return false;
    const next = treeOpenedBy(nextLocation.pathname);
    return next !== null && next !== loadedClanId;
  });
  const hasUnsent = unsent > 0;
  const asking = blocker.state === 'blocked' && hasUnsent;
  // What had focus (the link that was followed), so closing the question returns there: the
  // dialog has no Radix trigger to go back to. A layout effect runs before the dialog takes focus.
  const returnTo = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!asking) return;
    const active = document.activeElement;
    returnTo.current = active instanceof HTMLElement ? active : null;
  }, [asking]);

  useEffect(() => {
    if (!hasUnsent) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers still need a returnValue to show the prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsent]);

  // Everything got saved while the question was open: nothing is lost any more, so go on.
  useEffect(() => {
    if (blocker.state === 'blocked' && !hasUnsent) blocker.proceed();
  }, [blocker, hasUnsent]);

  if (!asking) return null;
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : blocker.reset())}>
      <DialogContent
        title={t('tree.switchTree.title')}
        description={t('tree.switchTree.body', { count: unsent })}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnTo.current?.isConnected) returnTo.current.focus();
        }}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => blocker.reset()}>
            {t('tree.switchTree.stay')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              // The user chose to drop them: empty the queue now (so the redirect to the tree
              // is not asked about again, and the next load() has no `discarded` notice to show).
              resetTreeStore();
              blocker.proceed();
            }}
          >
            {t('tree.switchTree.discard')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
