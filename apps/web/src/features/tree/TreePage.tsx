import type { Clan } from '@ancestors-tree/shared';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router';
import { errorMessageKey } from '../../shared/lib/apiError';
import { Button } from '../../shared/ui';
import { EmptyTree } from './EmptyTree';
import { SaveStatus } from './SaveStatus';
import { useTreeStore } from './store';
import { TreeBoard } from './TreeBoard';
import { TreeNoticeBanner } from './TreeNoticeBanner';
import { UnlinkedTray } from './UnlinkedTray';

export function TreePage() {
  const { t } = useTranslation();
  const clan = useOutletContext<Clan>();
  const load = useTreeStore((state) => state.load);
  const loadedClanId = useTreeStore((state) => state.clanId);
  const status = useTreeStore((state) => state.status);
  const loadError = useTreeStore((state) => state.loadError);
  const isEmpty = useTreeStore((state) => Object.keys(state.tree.persons).length === 0);

  useEffect(() => {
    void load(clan.id);
  }, [clan.id, load]);

  if (loadedClanId === clan.id && status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3">
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
    return <p className="text-ink-muted">{t('common.loading')}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <SaveStatus />
      <TreeNoticeBanner />
      {isEmpty ? (
        <EmptyTree />
      ) : (
        <>
          <TreeBoard label={t('tree.board.label', { name: clan.name })} />
          <UnlinkedTray />
        </>
      )}
    </div>
  );
}
