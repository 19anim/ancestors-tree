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
import { RevertToPointButton } from './RevertToPoint';

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
  const { t, i18n } = useTranslation();
  const clan = useOutletContext<Clan>();
  const view = useClanTree(clan.id);
  const history = useHistory(clan.id);
  const tree = useTreeStore((state) => state.tree);
  const pending = useTreeStore((state) => state.pending);
  const revertChange = useTreeStore((state) => state.revertChange);
  const lookup = useMemo(() => lookupIn(tree), [tree]);
  const formatTime = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    return (date: Date) => format.format(date);
  }, [i18n.language]);
  // The changes a queued revert is about to undo: their Revert waits for the save.
  const reverting = useMemo(() => {
    const seqs = new Set<number>();
    for (const entry of pending) {
      if (entry.reverts !== undefined && 'seq' in entry.reverts) seqs.add(entry.reverts.seq);
    }
    return seqs;
  }, [pending]);
  // A revert that failed, for the history it was tried on: new data makes it stale.
  const [failure, setFailure] = useState<{ message: string; data: unknown } | null>(null);
  const titleId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  // How many entries the list had when Show more was pressed; focus follows the new ones.
  const focusFrom = useRef<number | null>(null);
  useRefreshOnSave(clan.id);

  const canEdit = hasRoleAtLeast(clan.role, 'editor');
  const isOwner = clan.role === 'owner';
  const entries = history.data?.pages.flatMap((page) => page.entries) ?? [];
  const entryCount = entries.length;
  const hasNextPage = history.hasNextPage;

  // When the last page arrives the button goes away and takes keyboard focus with it.
  useEffect(() => {
    const from = focusFrom.current;
    if (from === null || entryCount <= from) return;
    focusFrom.current = null;
    const target = listRef.current?.children[from];
    if (!hasNextPage && target instanceof HTMLElement) target.focus();
  }, [entryCount, hasNextPage]);

  const revert = (entry: HistoryEntry) => {
    if (reverting.has(entry.seq)) return;
    const result = revertChange(entry.inverse, entry.seq);
    setFailure(
      result.ok
        ? null
        : {
            message: t('history.revertFailed', {
              seq: entry.seq,
              reason: applyFailureMessage(t, result.reason),
            }),
            data: history.data,
          },
    );
  };

  const showMore = () => {
    if (history.isFetchingNextPage) return;
    focusFrom.current = entryCount;
    void history.fetchNextPage();
  };

  const historyFailed = history.isError && history.data === undefined;
  if (view.state === 'error' || historyFailed) {
    const error = view.state === 'error' ? view.error : history.error;
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="font-medium text-stamp">
          {t(errorMessageKey(error))}
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            if (view.state === 'error') view.retry();
            if (historyFailed) void history.refetch();
          }}
        >
          {t('tree.retry')}
        </Button>
      </div>
    );
  }
  if (view.state === 'loading' || history.isPending) {
    return (
      <p role="status" className="text-ink-muted">
        {t('common.loading')}
      </p>
    );
  }
  const shownFailure = failure !== null && failure.data === history.data ? failure.message : null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-xl font-semibold text-ink">
          {t('history.title')}
        </h2>
        <SaveStatus />
      </div>
      {shownFailure !== null ? (
        <p role="alert" className="text-sm font-medium text-stamp">
          {shownFailure}
        </p>
      ) : null}
      {history.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 text-sm font-medium text-stamp"
        >
          <span>{t(errorMessageKey(history.error))}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (history.isFetchNextPageError) showMore();
              else void history.refetch();
            }}
          >
            {t('tree.retry')}
          </Button>
        </div>
      ) : null}
      {entries.length === 0 ? (
        <p className="text-ink-muted">{t('history.empty')}</p>
      ) : (
        <ol ref={listRef} aria-labelledby={titleId} className="flex flex-col">
          {entries.map((entry, index) => (
            <HistoryEntryItem key={entry.seq} entry={entry} lookup={lookup} formatTime={formatTime}>
              {canEdit && (isOwner || !needsOwner(entry.inverse)) ? (
                reverting.has(entry.seq) ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-disabled="true"
                    className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                  >
                    {t('history.reverting')}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={t('history.revertLabel', { seq: entry.seq })}
                    onClick={() => revert(entry)}
                  >
                    {t('history.revert')}
                  </Button>
                )
              ) : null}
              {/* Going back to after the newest change would change nothing. */}
              {isOwner && index > 0 ? <RevertToPointButton clanId={clan.id} entry={entry} /> : null}
            </HistoryEntryItem>
          ))}
        </ol>
      )}
      {hasNextPage ? (
        <Button
          variant="ghost"
          className="self-start aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          aria-disabled={history.isFetchingNextPage}
          onClick={showMore}
        >
          {t('history.more')}
        </Button>
      ) : null}
    </section>
  );
}
