import type { HistoryEntry } from '@ancestors-tree/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessageKey } from '../../shared/lib/apiError';
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger } from '../../shared/ui';
import { applyFailureMessage, useTreeStore } from '../tree';
import { historyKeys } from './api';
import { fetchRevertPlan, type RevertPlan } from './revertPlan';

interface RevertToPointProps {
  clanId: string;
  entry: HistoryEntry;
}

function RevertToPointDialog({
  clanId,
  entry,
  onDone,
}: RevertToPointProps & { onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const load = useTreeStore((state) => state.load);
  const revertTo = useTreeStore((state) => state.revertTo);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Under the history key, so a refresh of the history plans again.
  const plan = useQuery({
    queryKey: [...historyKeys.list(clanId), 'revertTo', entry.seq],
    queryFn: ({ signal }) => fetchRevertPlan(clanId, entry.seq, signal),
    staleTime: 0,
    gcTime: 0,
  });

  const confirm = async (ready: Extract<RevertPlan, { kind: 'ready' }>) => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    // Takes a version someone else saved meanwhile, so the check below sees it. Unsent edits
    // are kept by load, and make the revert refuse.
    await load(clanId);
    const unsent = useTreeStore.getState().pending.length > 0;
    const result = revertTo(ready.op, entry.seq, ready.atVersion);
    setBusy(false);
    if (result.ok) {
      onDone();
      return;
    }
    setFailure(
      result.reason === 'OUT_OF_DATE' && unsent
        ? t('history.revertTo.unsent')
        : applyFailureMessage(t, result.reason),
    );
    if (result.reason === 'OUT_OF_DATE') {
      void queryClient.invalidateQueries({ queryKey: historyKeys.list(clanId) });
    }
  };

  let body: string;
  if (plan.isPending) body = t('common.loading');
  else if (plan.isError) body = t(errorMessageKey(plan.error));
  else if (plan.data.kind === 'tooMany') body = t('history.revertTo.tooMany');
  else if (plan.data.kind === 'nothing') body = t('history.revertTo.nothing');
  else body = t('history.revertTo.count', { count: plan.data.changes });
  const ready = plan.data?.kind === 'ready' ? plan.data : null;

  return (
    <DialogContent title={t('history.revertTo.title', { seq: entry.seq })}>
      <p className="text-ink">{body}</p>
      {ready !== null ? (
        <p className="mt-2 text-sm text-ink-muted">{t('history.revertTo.oneStep')}</p>
      ) : null}
      {failure !== null ? (
        <p role="alert" className="mt-3 text-sm font-medium text-stamp">
          {failure}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="ghost">{t('history.revertTo.cancel')}</Button>
        </DialogClose>
        {ready !== null ? (
          <Button
            variant="danger"
            aria-disabled={busy}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            onClick={() => void confirm(ready)}
          >
            {t('history.revertTo.confirm')}
          </Button>
        ) : null}
      </div>
    </DialogContent>
  );
}

/** "Revert to this point" (Owner). Radix returns focus to this button when the dialog closes. */
export function RevertToPointButton({ clanId, entry }: RevertToPointProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('history.revertTo.label', { seq: entry.seq })}
        >
          {t('history.revertTo.button')}
        </Button>
      </DialogTrigger>
      {open ? (
        <RevertToPointDialog clanId={clanId} entry={entry} onDone={() => setOpen(false)} />
      ) : null}
    </Dialog>
  );
}
