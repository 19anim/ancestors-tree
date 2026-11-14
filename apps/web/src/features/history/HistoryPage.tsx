import { hasRoleAtLeast, type Clan, type HistoryEntry } from '@ancestors-tree/shared';
import { needsOwner } from '@ancestors-tree/shared/tree';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router';
import { errorMessageKey } from '../../shared/lib/apiError';
import { Button } from '../../shared/ui';
import { applyFailureMessage, lookupIn, SaveStatus, useClanTree, useTreeStore } from '../tree';
import { historyKeys, useHistory } from './api';
import { HistoryEntryItem } from './HistoryEntryItem';

/** Refetches the history when a change to this tree is saved (by this tab). */
function useRefreshOnSave(clanId: string) {
  const queryClient = useQueryClient();
  // Null until this tree is ready, so loading it does not count as a save.
  const version = useTreeStore((state) =>
    state.clanId === clanId && state.status === 'ready' ? state.confirmedVersion : null,
  );
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const previous = seen.current;
    seen.current = version;
    if (previous !== null && version !== null && version > previous) {
      void queryClient.invalidateQueries({ queryKey: historyKeys.list(clanId) });
    }
  }, [clanId, queryClient, version]);
}

export function HistoryPage() {
  const { t } = useTranslation();
  const clan = useOutletContext<Clan>();
  const view = useClanTree(clan.id);
  const history = useHistory(clan.id);
  const tree = useTreeStore((state) => state.tree);
  const revertChange = useTreeStore((state) => state.revertChange);
  const lookup = useMemo(() => lookupIn(tree), [tree]);
  const [failure, setFailure] = useState<string | null>(null);
  const titleId = useId();
  useRefreshOnSave(clan.id);

  const canEdit = hasRoleAtLeast(clan.role, 'editor');
  const isOwner = clan.role === 'owner';
  const entries = history.data?.pages.flatMap((page) => page.entries) ?? [];

  const revert = (entry: HistoryEntry) => {
    const result = revertChange(entry.inverse, entry.seq);
    setFailure(
      result.ok
        ? null
        : t('history.revertFailed', {
            seq: entry.seq,
            reason: applyFailureMessage(t, result.reason),
          }),
    );
  };

  if (view.state === 'error' || history.isError) {
    const error = view.state === 'error' ? view.error : history.error;
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="font-medium text-stamp">
          {t(errorMessageKey(error))}
        </p>
        <Button
          variant="secondary"
          onClick={() => (view.state === 'error' ? view.retry() : void history.refetch())}
        >
          {t('tree.retry')}
        </Button>
      </div>
    );
  }
  if (view.state === 'loading' || history.isPending) {
    return <p className="text-ink-muted">{t('common.loading')}</p>;
  }
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-xl font-semibold text-ink">
          {t('history.title')}
        </h2>
        <SaveStatus />
      </div>
      {failure !== null ? (
        <p role="alert" className="text-sm font-medium text-stamp">
          {failure}
        </p>
      ) : null}
      {entries.length === 0 ? (
        <p className="text-ink-muted">{t('history.empty')}</p>
      ) : (
        <ol aria-labelledby={titleId} className="flex flex-col">
          {entries.map((entry) => (
            <HistoryEntryItem key={entry.seq} entry={entry} lookup={lookup}>
              {canEdit && (isOwner || !needsOwner(entry.inverse)) ? (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={t('history.revertLabel', { seq: entry.seq })}
                  onClick={() => revert(entry)}
                >
                  {t('history.revert')}
                </Button>
              ) : null}
            </HistoryEntryItem>
          ))}
        </ol>
      )}
      {history.hasNextPage ? (
        <Button
          variant="ghost"
          className="self-start"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          {t('history.more')}
        </Button>
      ) : null}
    </section>
  );
}
