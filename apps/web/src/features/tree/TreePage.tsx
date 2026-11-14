import { hasRoleAtLeast, type Clan } from '@ancestors-tree/shared';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router';
import { errorMessageKey } from '../../shared/lib/apiError';
import { Button } from '../../shared/ui';
import { EmptyTree } from './EmptyTree';
import { LeaveGuard } from './LeaveGuard';
import { SaveStatus } from './SaveStatus';
import { useTreeStore } from './store';
import { TreeActionsContext } from './treeActions';
import { TreeBoard } from './TreeBoard';
import { TreeDialogs, type TreeDialog } from './TreeDialogs';
import { TreeNoticeBanner } from './TreeNoticeBanner';
import { TreeSkeleton } from './TreeSkeleton';
import { UnlinkedTray } from './UnlinkedTray';

export function TreePage() {
  const { t } = useTranslation();
  const clan = useOutletContext<Clan>();
  const load = useTreeStore((state) => state.load);
  const loadedClanId = useTreeStore((state) => state.clanId);
  const status = useTreeStore((state) => state.status);
  const loadError = useTreeStore((state) => state.loadError);
  const isEmpty = useTreeStore((state) => Object.keys(state.tree.persons).length === 0);
  const [dialog, setDialog] = useState<TreeDialog>(null);
  // Stable, so the cards (context consumers) do not re-render when the page does.
  const openActions = useCallback(
    (personId: string) => setDialog({ kind: 'actions', personId }),
    [],
  );
  const canEdit = hasRoleAtLeast(clan.role, 'editor');

  useEffect(() => {
    void load(clan.id);
  }, [clan.id, load]);

  if (loadedClanId === clan.id && status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3">
        <TreeNoticeBanner />
        <p role="alert" className="font-medium text-stamp">
          {t(errorMessageKey(loadError))}
        </p>
        <Button variant="secondary" onClick={() => void load(clan.id)}>
          {t('tree.retry')}
        </Button>
      </div>
    );
  }
  if (loadedClanId !== clan.id || status !== 'ready') {
    return <TreeSkeleton />;
  }
  return (
    <TreeActionsContext value={canEdit ? openActions : null}>
      <div className="flex flex-col gap-4">
        <SaveStatus />
        <TreeNoticeBanner />
        {isEmpty ? (
          <EmptyTree onAddFirst={canEdit ? () => setDialog({ kind: 'first' }) : undefined} />
        ) : (
          <>
            <TreeBoard label={t('tree.board.label', { name: clan.name })} />
            <UnlinkedTray />
          </>
        )}
      </div>
      {canEdit ? (
        <TreeDialogs dialog={dialog} isOwner={clan.role === 'owner'} onDialogChange={setDialog} />
      ) : null}
      <LeaveGuard />
    </TreeActionsContext>
  );
}
