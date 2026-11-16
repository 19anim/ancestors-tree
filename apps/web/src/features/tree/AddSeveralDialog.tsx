import type { Gender } from '@ancestors-tree/shared/tree';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogContent, TextField } from '../../shared/ui';
import { applyFailureMessage } from './format';
import { MAX_SEVERAL, type NewPersonInput } from './ops';
import type { ApplyResult } from './store';

export interface SeveralRow {
  key: number;
  fullName: string;
  gender: Gender;
  isDeceased: boolean;
}

/** Matches FullNameSchema's limit, so a row is never refused by the server for its length. */
const MAX_NAME = 120;

function emptyRow(key: number): SeveralRow {
  return { key, fullName: '', gender: 'male', isDeceased: false };
}

/** A new empty row follows a filled last row, up to MAX_SEVERAL rows. */
export function withSpare(rows: SeveralRow[], nextKey: () => number): SeveralRow[] {
  const last = rows.at(-1);
  if (last === undefined || (last.fullName.trim() !== '' && rows.length < MAX_SEVERAL)) {
    return [...rows, emptyRow(nextKey())];
  }
  return rows;
}

interface AddSeveralDialogProps {
  onSubmit: (inputs: NewPersonInput[]) => ApplyResult;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

/** "Add several people" (spec §7.6): names first, places on the tree later. */
export function AddSeveralDialog({ onSubmit, onClose, onCloseAutoFocus }: AddSeveralDialogProps) {
  const { t } = useTranslation();
  const counter = useRef(1);
  const nextKey = () => (counter.current += 1);
  const [rows, setRows] = useState<SeveralRow[]>([emptyRow(1)]);
  // "Enter at least one name" belongs to the first name field; a refused apply to the form.
  const [noName, setNoName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstName = useRef<HTMLInputElement>(null);
  const hasNames = rows.some((row) => row.fullName.trim() !== '');
  // Unsent edits are never lost silently: once a name is typed, only Cancel or the close button
  // (both deliberate) close the dialog, not Escape or a click outside it.
  const keepTyped = (event: Event) => {
    if (hasNames) event.preventDefault();
  };

  const change = (key: number, patch: Partial<SeveralRow>) => {
    if (patch.fullName !== undefined && patch.fullName.trim() !== '') setNoName(false);
    setRows((current) =>
      withSpare(
        current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
        nextKey,
      ),
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const inputs: NewPersonInput[] = rows
      .filter((row) => row.fullName.trim() !== '')
      .map((row) => ({ fullName: row.fullName, gender: row.gender, isDeceased: row.isDeceased }));
    if (inputs.length === 0) {
      setNoName(true);
      firstName.current?.focus();
      return;
    }
    const result = onSubmit(inputs);
    if (result.ok) onClose();
    else setError(applyFailureMessage(t, result.reason));
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={t('tree.several.title')}
        description={t('tree.several.hint')}
        // Wider than the default, so a row's name, gender and status fit on one line.
        className="w-[min(92vw,40rem)]"
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={keepTyped}
        onInteractOutside={keepTyped}
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-1">
            {rows.map((row, at) => (
              <fieldset
                key={row.key}
                className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
              >
                <legend className="sr-only">{t('tree.several.row', { n: at + 1 })}</legend>
                <TextField
                  ref={at === 0 ? firstName : undefined}
                  label={t('tree.form.fullName')}
                  error={at === 0 && noName ? t('tree.several.none') : undefined}
                  value={row.fullName}
                  maxLength={MAX_NAME}
                  autoComplete="off"
                  onChange={(event) => change(row.key, { fullName: event.target.value })}
                />
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                  {t('tree.form.gender')}
                  <select
                    value={row.gender}
                    onChange={(event) => change(row.key, { gender: event.target.value as Gender })}
                    className="h-10 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
                  >
                    <option value="male">{t('tree.form.male')}</option>
                    <option value="female">{t('tree.form.female')}</option>
                  </select>
                </label>
                <label className="flex h-10 items-center gap-2 text-base text-ink">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={row.isDeceased}
                    onChange={(event) => change(row.key, { isDeceased: event.target.checked })}
                  />
                  {t('tree.form.deceased')}
                </label>
              </fieldset>
            ))}
          </div>
          {rows.length >= MAX_SEVERAL ? (
            <p className="text-sm text-ink-muted">{t('tree.several.full')}</p>
          ) : null}
          {noName ? (
            // The field shows the message; this announces it once (the field's error has no role).
            <p role="alert" className="sr-only">
              {t('tree.several.none')}
            </p>
          ) : null}
          {error !== null ? (
            <p role="alert" className="text-sm font-medium text-stamp">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('tree.form.cancel')}
            </Button>
            <Button type="submit">{t('tree.form.submit')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
