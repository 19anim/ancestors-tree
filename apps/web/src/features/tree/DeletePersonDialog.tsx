import type { Person } from '@ancestors-tree/shared/tree';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogClose, DialogContent } from '../../shared/ui';
import { applyFailureMessage } from './format';
import type { ApplyFailure, ApplyResult } from './store';

interface DeletePersonDialogProps {
  person: Person;
  onConfirm: () => ApplyResult;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

/** Confirms a delete; when a rule forbids it (spec §6.1), says which and stays open. */
export function DeletePersonDialog({
  person,
  onConfirm,
  onClose,
  onCloseAutoFocus,
}: DeletePersonDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ApplyFailure | null>(null);
  const confirm = () => {
    const result = onConfirm();
    if (result.ok) onClose();
    else setReason(result.reason);
  };
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={t('tree.delete.title', { name: person.fullName })}
        description={t('tree.delete.body', { name: person.fullName })}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {reason ? (
          <p role="alert" className="mb-4 font-medium text-stamp">
            {applyFailureMessage(t, reason)}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">{t('tree.delete.cancel')}</Button>
          </DialogClose>
          <Button variant="danger" onClick={confirm}>
            {t('tree.delete.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
