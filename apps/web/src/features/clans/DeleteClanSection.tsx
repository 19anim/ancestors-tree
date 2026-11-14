import type { Clan } from '@ancestors-tree/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { errorMessageKey } from '../../shared/lib/apiError';
import { Button, Dialog, DialogClose, DialogContent, TextField } from '../../shared/ui';
import { resetTreeStore, useTreeStore } from '../tree';
import { useDeleteClan } from './api';

/** The Owner deletes the whole family tree (spec §3); typing its name guards against a slip. */
export function DeleteClanSection({ clan }: { clan: Clan }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const deleteClan = useDeleteClan(clan.id);
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === clan.name;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTyped('');
      deleteClan.reset();
    }
  };

  const confirm = async () => {
    try {
      await deleteClan.mutateAsync();
    } catch {
      return; // Shown in the dialog through deleteClan.error.
    }
    // Edits queued for the deleted tree are meaningless now; do not ask about them later.
    if (useTreeStore.getState().clanId === clan.id) resetTreeStore();
    void navigate('/clans', { replace: true });
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex max-w-xl flex-col items-start gap-3 rounded-photo border border-stamp/40 p-4"
    >
      <h2 id={headingId} className="text-lg font-bold text-ink">
        {t('clans.delete.title')}
      </h2>
      <p className="text-ink-muted">{t('clans.delete.body')}</p>
      <Button variant="danger" onClick={() => onOpenChange(true)}>
        {t('clans.delete.open')}
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          title={t('clans.delete.confirmTitle', { name: clan.name })}
          description={t('clans.delete.body')}
        >
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (matches) void confirm();
            }}
          >
            <TextField
              label={t('clans.delete.confirmLabel', { name: clan.name })}
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
            {deleteClan.error ? (
              <p role="alert" className="text-sm font-medium text-stamp">
                {t(errorMessageKey(deleteClan.error))}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  {t('clans.delete.cancel')}
                </Button>
              </DialogClose>
              <Button type="submit" variant="danger" disabled={!matches || deleteClan.isPending}>
                {t('clans.delete.confirm')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
