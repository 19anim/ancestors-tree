import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker } from 'react-router';
import { Button, Dialog, DialogContent } from '../../shared/ui';
import { selectHasUnsentChanges, useTreeStore } from './store';

/**
 * While changes are unsent, asks before the user leaves: in-app navigation gets a dialog, and
 * closing or reloading the tab gets the browser's own confirmation.
 */
export function LeaveGuard() {
  const { t } = useTranslation();
  const hasUnsent = useTreeStore(selectHasUnsentChanges);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsent &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );

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

  if (blocker.state !== 'blocked') return null;
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : blocker.reset())}>
      <DialogContent title={t('tree.leave.title')} description={t('tree.leave.body')}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => blocker.reset()}>
            {t('tree.leave.stay')}
          </Button>
          <Button variant="danger" onClick={() => blocker.proceed()}>
            {t('tree.leave.leave')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
