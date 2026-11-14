import { hasRoleAtLeast, type Clan } from '@ancestors-tree/shared';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router';
import { errorMessageKey } from '../../shared/lib/apiError';
import { Button } from '../../shared/ui';
import { EmptyTree } from './EmptyTree';
import { useTreeStore } from './store';
import { TreeActionsContext } from './treeActions';
import { TreeBoard } from './TreeBoard';
import { TreeDialogs, useTreeDialog } from './TreeDialogs';
import { TreeSkeleton } from './TreeSkeleton';
import { TreeToolbar } from './TreeToolbar';
import { UnlinkedTray } from './UnlinkedTray';
import { useClanTree } from './useClanTree';

export function TreePage() {
  const { t } = useTranslation();
  const clan = useOutletContext<Clan>();
  const view = useClanTree(clan.id);
  const isEmpty = useTreeStore((state) => Object.keys(state.tree.persons).length === 0);
  const { dialog, changeDialog, firstPersonAdded, returnFocus } = useTreeDialog();
  // Stable, so the cards (context consumers) do not re-render when the page does.
  const openActions = useCallback(
    (personId: string) => changeDialog({ kind: 'actions', personId }),
    [changeDialog],
  );
  const canEdit = hasRoleAtLeast(clan.role, 'editor');

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
    <TreeActionsContext value={canEdit ? openActions : null}>
      <div className="flex flex-col gap-4">
        <TreeToolbar canEdit={canEdit} />
        {isEmpty ? (
          <EmptyTree onAddFirst={canEdit ? () => changeDialog({ kind: 'first' }) : undefined} />
        ) : (
          <>
            <TreeBoard label={t('tree.board.label', { name: clan.name })} />
            <UnlinkedTray />
          </>
        )}
      </div>
      {canEdit ? (
        <TreeDialogs
          dialog={dialog}
          isOwner={clan.role === 'owner'}
          onDialogChange={changeDialog}
          onFirstPersonAdded={firstPersonAdded}
          onCloseAutoFocus={returnFocus}
        />
      ) : null}
    </TreeActionsContext>
  );
}
