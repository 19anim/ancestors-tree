import type { HistoryEntry } from '@ancestors-tree/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
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

interface DialogState {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onDone: () => void;
}

/** A refusal, shown while the plan it was about is the one on screen. */
interface Failure {
  message: string;
  planAt: number;
}

function RevertToPointDialog({
  clanId,
  entry,
  busy,
  setBusy,
  onDone,
}: RevertToPointProps & DialogState) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const load = useTreeStore((state) => state.load);
  const revertTo = useTreeStore((state) => state.revertTo);
  const bodyId = useId();
  const [failure, setFailure] = useState<Failure | null>(null);
  // False once the dialog is gone: a revert it started must not go out after that.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Under the history key, so a refresh of the history plans again.
  const planKey = [...historyKeys.list(clanId), 'revertTo', entry.seq];
  const plan = useQuery({
    queryKey: planKey,
    queryFn: ({ signal }) => fetchRevertPlan(clanId, entry.seq, signal),
    staleTime: 0,
    gcTime: 0,
  });

  const fail = (message: string) => {
    setFailure({ message, planAt: queryClient.getQueryState(planKey)?.dataUpdatedAt ?? 0 });
  };

  const confirm = async (ready: Extract<RevertPlan, { kind: 'ready' }>) => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    // Takes a version someone else saved meanwhile, so the check below sees it. Unsent edits
    // are kept by load, and make the revert refuse.
    await load(clanId);
    // Closed meanwhile (closing is blocked while busy, but the page may go away): the user
    // never confirmed what is left on screen, so nothing is sent.
    if (!mounted.current) {
      setBusy(false);
      return;
    }
    const unsent = useTreeStore.getState().pending.length > 0;
    const result = revertTo(ready.op, entry.seq, ready.atVersion);
    if (result.ok) {
      setBusy(false);
      onDone();
      return;
    }
    const message =
      result.reason === 'OUT_OF_DATE' && unsent
        ? t('history.revertTo.unsent')
        : applyFailureMessage(t, result.reason);
    if (result.reason === 'OUT_OF_DATE') {
      // Plan again first, so the refusal stays with the new plan it asks the user to review.
      await queryClient.invalidateQueries({ queryKey: historyKeys.list(clanId) });
      if (!mounted.current) {
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    fail(message);
  };

  let body: string;
  if (plan.isPending) body = t('common.loading');
  else if (plan.isError) body = t(errorMessageKey(plan.error));
  else if (plan.data.kind === 'tooMany') body = t('history.revertTo.tooMany');
  else if (plan.data.kind === 'nothing') body = t('history.revertTo.nothing');
  else body = t('history.revertTo.count', { count: plan.data.changes });
  const ready = plan.data?.kind === 'ready' ? plan.data : null;
  // A plan read again after the refusal (a save, someone else's change) makes it stale.
  const shownFailure = failure?.planAt === plan.dataUpdatedAt ? failure.message : null;

  return (
    <DialogContent
      title={t('history.revertTo.title', { seq: entry.seq })}
      aria-describedby={bodyId}
      closeDisabled={busy}
    >
      {/* Read with the dialog, and again when the count arrives. */}
      <p id={bodyId} aria-live="polite" className="text-ink">
        {body}
      </p>
      {ready !== null ? (
        <p className="mt-2 text-sm text-ink-muted">{t('history.revertTo.oneStep')}</p>
      ) : null}
      {shownFailure !== null ? (
        <p role="alert" className="mt-3 text-sm font-medium text-stamp">
          {shownFailure}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <DialogClose asChild>
          <Button
            variant="ghost"
            aria-disabled={busy}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            onClick={(event) => {
              // Radix skips the close when the click was prevented.
              if (busy) event.preventDefault();
            }}
          >
            {t('history.revertTo.cancel')}
          </Button>
        </DialogClose>
        {ready !== null ? (
          <Button
            variant="danger"
            aria-disabled={busy}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            onClick={() => void confirm(ready)}
          >
            {busy ? t('history.revertTo.busy') : t('history.revertTo.confirm')}
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
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape, the corner button and a click outside wait until the check is done.
        if (!next && busy) return;
        setOpen(next);
      }}
    >
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
        <RevertToPointDialog
          clanId={clanId}
          entry={entry}
          busy={busy}
          setBusy={setBusy}
          onDone={() => setOpen(false)}
        />
      ) : null}
    </Dialog>
  );
}
