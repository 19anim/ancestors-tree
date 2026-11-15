import { hasRoleAtLeast, type Clan } from '@ancestors-tree/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router';
import { errorMessageKey } from '../../shared/lib/apiError';
import { Button } from '../../shared/ui';
import { EmptyTree } from './EmptyTree';
import { applyFailureMessage } from './format';
import { setProgenitorOp } from './ops';
import { ProfilePanel } from './ProfilePanel';
import { OpenPersonContext, personCardButton, useProfileParam } from './profileParams';
import { useTreeStore } from './store';
import { TreeBoard } from './TreeBoard';
import { TreeDialogs, useTreeDialog } from './TreeDialogs';
import { TreeSkeleton } from './TreeSkeleton';
import { TreeToolbar } from './TreeToolbar';
import { UnlinkedTray } from './UnlinkedTray';
import { availableActions, PersonActionsContext, type PersonActionsApi } from './usePersonActions';
import { useClanTree } from './useClanTree';

export function TreePage() {
  const { t } = useTranslation();
  const clan = useOutletContext<Clan>();
  const view = useClanTree(clan.id);
  const isEmpty = useTreeStore((state) => Object.keys(state.tree.persons).length === 0);
  const { dialog, changeDialog, firstPersonAdded, returnFocus } = useTreeDialog();
  // openPerson and closeProfile are stable, so the cards (context consumers) do not re-render
  // when the page does.
  const { personId, openPerson, closeProfile } = useProfileParam();
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  // A person this page deleted: their panel closes without a notice.
  const removedHere = useRef<string | null>(null);
  // The open person's last known name, kept here because the panel unmounts while the tree
  // reloads (the skeleton shows): the notice can still name someone deleted meanwhile.
  const openName = useTreeStore((state) =>
    personId === null ? undefined : state.tree.persons[personId]?.fullName,
  );
  const knownName = useRef<{ personId: string; name: string } | null>(null);
  useEffect(() => {
    if (personId !== null && openName !== undefined)
      knownName.current = { personId, name: openName };
  }, [personId, openName]);
  const canEdit = hasRoleAtLeast(clan.role, 'editor');
  const isOwner = clan.role === 'owner';

  const actions = useMemo<PersonActionsApi | null>(() => {
    if (!canEdit) return null;
    return {
      actionsFor: (id) => availableActions(useTreeStore.getState().tree, id, isOwner),
      run: (id, action) => {
        setActionError(null);
        switch (action) {
          case 'addChild':
            changeDialog({ kind: 'child', personId: id });
            return;
          case 'addSpouse':
            changeDialog({ kind: 'spouse', personId: id });
            return;
          case 'delete':
            changeDialog({ kind: 'delete', personId: id });
            return;
          case 'setProgenitor': {
            const result = useTreeStore.getState().apply(setProgenitorOp(id));
            if (!result.ok) setActionError(applyFailureMessage(t, result.reason));
            return;
          }
          case 'addParent':
            // availableActions does not offer it yet: nothing to open.
            return;
          default: {
            const unknown: never = action;
            throw new Error(`Unknown person action: ${String(unknown)}`);
          }
        }
      },
    };
  }, [canEdit, changeDialog, isOwner, t]);

  // An open profile form went away with unsaved changes (ProfileForm's onDraftLost). Its
  // unmount comes before the panel reports a missing person, and before the tree is back from a
  // reload: whichever comes next says the changes were dropped.
  const draftLost = useRef(false);
  const onDraftLost = useCallback(() => {
    draftLost.current = true;
  }, []);

  const onMissing = useCallback(() => {
    const silent = removedHere.current !== null && removedHere.current === personId;
    removedHere.current = null;
    const known = knownName.current;
    const name = known !== null && known.personId === personId ? known.name : undefined;
    const hadDraft = draftLost.current;
    // No draft to drop here: the form unmounted first and its cleanup cleared it, so the guard
    // does not ask about someone who is gone.
    draftLost.current = false;
    if (!silent) {
      setNotice(
        name === undefined
          ? t('tree.profile.missingUnnamed')
          : t(hadDraft ? 'tree.profile.missingWithDraft' : 'tree.profile.missing', { name }),
      );
    }
    closeProfile();
  }, [closeProfile, personId, t]);

  // The tree reloaded (the skeleton replaced the page, and the open form with it): once it is
  // back, say the unsaved profile changes were dropped. The panel's effects run first, so a
  // person who left the tree meanwhile gets onMissing's notice instead.
  const ready = view.state === 'ready';
  useEffect(() => {
    if (!ready || !draftLost.current) return;
    draftLost.current = false;
    setNotice(t('tree.profile.reloadedWithDraft'));
  }, [ready, t]);

  // The panel closed with focus inside it (Esc, the close button, Back): back to the card.
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const was = previous.current;
    previous.current = personId;
    // An action's error belongs to the profile it came from.
    setActionError(null);
    if (personId !== null) setNotice('');
    if (was === null || personId !== null) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    (personCardButton(was) ?? document.querySelector<HTMLElement>('main'))?.focus();
  }, [personId]);

  if (view.state === 'error') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="font-medium text-stamp">
          {t(errorMessageKey(view.error))}
        </p>
        <Button variant="secondary" onClick={view.retry}>
          {t('tree.retry')}
        </Button>
      </div>
    );
  }
  if (view.state === 'loading') return <TreeSkeleton />;
  return (
    <OpenPersonContext value={openPerson}>
      <PersonActionsContext value={actions}>
        {/* From md up the profile is a column beside the content, so nothing hides under it. */}
        <div className="md:flex md:items-start md:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <TreeToolbar canEdit={canEdit} />
            {/* Always in the accessibility tree, so a later message is announced; while empty,
              sr-only takes it out of the layout without hiding it from screen readers. */}
            <p role="status" className="font-medium text-ink empty:sr-only">
              {notice}
            </p>
            {actionError ? (
              <p role="alert" className="font-medium text-stamp">
                {actionError}
              </p>
            ) : null}
            {isEmpty ? (
              <EmptyTree onAddFirst={canEdit ? () => changeDialog({ kind: 'first' }) : undefined} />
            ) : (
              <>
                <TreeBoard label={t('tree.board.label', { name: clan.name })} />
                <UnlinkedTray />
              </>
            )}
          </div>
          {personId !== null ? (
            <ProfilePanel
              key={personId}
              personId={personId}
              isOwner={isOwner}
              actions={actions}
              onClose={closeProfile}
              onMissing={onMissing}
              onDraftLost={onDraftLost}
            />
          ) : null}
        </div>
        {canEdit ? (
          <TreeDialogs
            dialog={dialog}
            onDialogChange={changeDialog}
            onFirstPersonAdded={firstPersonAdded}
            onPersonDeleted={(id) => {
              removedHere.current = id;
            }}
            onCloseAutoFocus={returnFocus}
          />
        ) : null}
      </PersonActionsContext>
    </OpenPersonContext>
  );
}
