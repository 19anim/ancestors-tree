import { FullNameSchema, GenderSchema } from '@ancestors-tree/shared/tree';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useZodForm } from '../../shared/lib/formErrors';
import { Button, Dialog, DialogClose, DialogContent, TextField } from '../../shared/ui';
import { applyFailureMessage } from './format';
import type { NewPersonInput } from './ops';
import type { ApplyResult } from './store';

const PersonFormSchema = z.object({
  fullName: FullNameSchema,
  gender: GenderSchema,
  status: z.enum(['living', 'deceased']),
  unionId: z.string().optional(),
});

const SELECT_CLASS =
  'h-10 rounded-control border border-line-strong bg-surface px-3 text-base text-ink';

export interface UnionChoice {
  id: string;
  label: string;
}

interface PersonFormDialogProps {
  title: string;
  /** Shown as a choice only when there are two or more. */
  unionChoices?: UnionChoice[];
  onSubmit: (input: NewPersonInput, unionId: string | undefined) => ApplyResult;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

/** The P5 person form: full name, gender, living or deceased (dates arrive in P6). */
export function PersonFormDialog({
  title,
  unionChoices = [],
  onSubmit,
  onClose,
  onCloseAutoFocus,
}: PersonFormDialogProps) {
  const { t } = useTranslation();
  const unionFieldId = useId();
  const form = useZodForm(PersonFormSchema, {
    defaultValues: { fullName: '', gender: 'male', status: 'living', unionId: unionChoices[0]?.id },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    const result = onSubmit(
      {
        fullName: values.fullName,
        gender: values.gender,
        isDeceased: values.status === 'deceased',
      },
      values.unionId,
    );
    if (result.ok) onClose();
    else
      form.setError('root.server', {
        type: 'rule',
        message: applyFailureMessage(t, result.reason),
      });
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={title} onCloseAutoFocus={onCloseAutoFocus}>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <TextField
            label={t('tree.form.fullName')}
            autoComplete="off"
            error={errors.fullName?.message}
            {...form.register('fullName')}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">{t('tree.form.gender')}</legend>
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input type="radio" value="male" className="size-4" {...form.register('gender')} />
                {t('tree.form.male')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="female"
                  className="size-4"
                  {...form.register('gender')}
                />
                {t('tree.form.female')}
              </label>
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">{t('tree.form.status')}</legend>
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="living"
                  className="size-4"
                  {...form.register('status')}
                />
                {t('tree.form.living')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="deceased"
                  className="size-4"
                  {...form.register('status')}
                />
                {t('tree.form.deceased')}
              </label>
            </div>
          </fieldset>
          {unionChoices.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={unionFieldId} className="text-sm font-medium text-ink">
                {t('tree.form.union')}
              </label>
              <select id={unionFieldId} className={SELECT_CLASS} {...form.register('unionId')}>
                {unionChoices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {errors.root?.server ? (
            <p role="alert" className="text-sm font-medium text-stamp">
              {errors.root.server.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('tree.form.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit">{t('tree.form.submit')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
