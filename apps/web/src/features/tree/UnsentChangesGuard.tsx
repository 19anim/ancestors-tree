import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker, type Location } from 'react-router';
import { Button, Dialog, DialogContent } from '../../shared/ui';
import { discardProfileDraft, useProfileDraft } from './profileDraft';
import { personParam } from './profileParams';
import { resetTreeStore, selectUnsentCount, useTreeStore } from './store';
import { treeOpenedBy } from './treePaths';

/**
 * Mounted once by the app shell, so it works on every page while changes are unsent (the store
 * keeps sending them in the background, whatever page is open). They are lost only when another
 * family tree loads, the tab closes, or the user signs out (UserMenu asks for that one). A reload
 * of the same tab, or a full-page redirect such as Google sign-in, keeps them: the queue is saved
 * in sessionStorage and restored (persist.ts). So: opening another tree's page (its tree or its
 * history) asks first, and the tab asks the browser to confirm before it unloads. The browser
 * cannot tell a reload or a redirect from a close, so the prompt shows for those too. Other pages
 * (members, settings, the list, sign-in) never ask: nothing is lost there.
 *
 * An open profile form with unsaved changes also asks before the panel closes, another person
 * opens, or the page changes (profileDraft.ts). React Router allows one blocker, so both reasons
 * live here; when both apply, the tree question is asked and says the profile edits go too.
 */
export function UnsentChangesGuard() {
  const { t } = useTranslation();
  const unsent = useTreeStore(selectUnsentCount);
  const loadedClanId = useTreeStore((state) => state.clanId);
  const profileDirty = useProfileDraft((state) => state.dirty);
  const hasUnsent = unsent > 0;
  const switchesTree = (pathname: string) => {
    const next = treeOpenedBy(pathname);
    return hasUnsent && next !== null && next !== loadedClanId;
  };
  const leavesProfile = (from: Location, to: Location) =>
    profileDirty &&
    (from.pathname !== to.pathname || personParam(from.search) !== personParam(to.search));
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      switchesTree(nextLocation.pathname) || leavesProfile(currentLocation, nextLocation),
  );
  const blocked = blocker.state === 'blocked';
  const askTree = blocked && switchesTree(blocker.location.pathname);
  const askProfile = blocked && !askTree && profileDirty;
  const asking = askTree || askProfile;
  // What had focus (the link that was followed), so closing the question returns there: the
  // dialog has no Radix trigger to go back to. A layout effect runs before the dialog takes focus.
  const returnTo = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!asking) return;
    const active = document.activeElement;
    returnTo.current = active instanceof HTMLElement ? active : null;
  }, [asking]);

  useEffect(() => {
    if (!hasUnsent && !profileDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers still need a returnValue to show the prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsent, profileDirty]);

  // Nothing would be lost any more (everything got saved meanwhile): go on.
  useEffect(() => {
    if (blocked && !asking) blocker.proceed();
  }, [asking, blocked, blocker]);

  if (!asking) return null;
  const discard = () => {
    // The user chose to drop them: empty the queue now (so the redirect to the tree is not
    // asked about again, and the next load() has no `discarded` notice to show).
    if (askTree) resetTreeStore();
    discardProfileDraft();
    blocker.proceed();
  };
  const description = askTree
    ? [
        t('tree.switchTree.body', { count: unsent }),
        profileDirty ? t('tree.switchTree.discardProfile') : null,
      ]
        .filter(Boolean)
        .join(' ')
    : t('tree.profileDraft.body');
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : blocker.reset())}>
      <DialogContent
        title={askTree ? t('tree.switchTree.title') : t('tree.profileDraft.title')}
        description={description}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnTo.current?.isConnected) returnTo.current.focus();
        }}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => blocker.reset()}>
            {askTree ? t('tree.switchTree.stay') : t('tree.profileDraft.stay')}
          </Button>
          <Button variant="danger" onClick={discard}>
            {askTree ? t('tree.switchTree.discard') : t('tree.profileDraft.discard')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
