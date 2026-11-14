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
  const canEdit = hasRoleAtLeast(clan.role, 'editor');
  const isOwner = clan.role === 'owner';

  const actions = useMemo<PersonActionsApi | null>(() => {
    if (!canEdit) return null;
    return {
      actionsFor: (id) => availableActions(useTreeStore.getState().tree, id, isOwner),
      run: (id, action) => {
        setActionError(null);
        if (action === 'setProgenitor') {
          const result = useTreeStore.getState().apply(setProgenitorOp(id));
          if (!result.ok) setActionError(applyFailureMessage(t, result.reason));
        } else if (action === 'addChild') changeDialog({ kind: 'child', personId: id });
        else if (action === 'addSpouse') changeDialog({ kind: 'spouse', personId: id });
        else if (action === 'delete') changeDialog({ kind: 'delete', personId: id });
      },
    };
  }, [canEdit, changeDialog, isOwner, t]);

  const onMissing = useCallback(
    (name: string | undefined) => {
      const silent = removedHere.current !== null && removedHere.current === personId;
      removedHere.current = null;
      if (!silent) {
        setNotice(
          name === undefined
            ? t('tree.profile.missingUnnamed')
            : t('tree.profile.missing', { name }),
        );
      }
      closeProfile();
    },
    [closeProfile, personId, t],
  );

  // The panel closed with focus inside it (Esc, the close button, Back): back to the card.
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const was = previous.current;
    previous.current = personId;
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
        <div
          className={
            personId === null ? 'flex flex-col gap-4' : 'flex flex-col gap-4 md:pr-[416px]'
          }
        >
          <TreeToolbar canEdit={canEdit} />
          {/* empty:hidden keeps the region in the DOM, so a later message is announced. */}
          <p role="status" className="font-medium text-ink empty:hidden">
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
          />
        ) : null}
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
