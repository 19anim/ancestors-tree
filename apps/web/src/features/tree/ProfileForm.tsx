import type { Person } from '@ancestors-tree/shared/tree';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useZodForm } from '../../shared/lib/formErrors';
import { Button, DualDateInput, TextField } from '../../shared/ui';
import { applyFailureMessage } from './format';
import { useProfileDraft } from './profileDraft';
import { formValuesFromPerson, personChanges, ProfileFormSchema } from './profileValues';
import { useTreeStore } from './store';

const AREA =
  'min-h-20 rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink aria-invalid:border-stamp';

interface TextAreaFieldProps extends ComponentProps<'textarea'> {
  label: string;
  hint?: string;
  error?: string;
}

/** TextField's layout for a multi-line value. */
function TextAreaField({ label, hint, error, ...props }: TextAreaFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={id}
        className={AREA}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-stamp">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface ProfileFormProps {
  person: Person;
  inLaw: boolean;
  /** Saved, cancelled or nothing to save: the panel goes back to read mode. */
  onDone: () => void;
  /**
   * The form went away with unsaved changes (the person left the tree, or the tree reloaded and
   * the skeleton replaced the page): the page tells the user they were dropped.
   */
  onDraftLost: () => void;
}

/** Edit mode (spec §7.6): one updatePerson with the fields changed since the form opened. */
export function ProfileForm({ person, inLaw, onDone, onDraftLost }: ProfileFormProps) {
  const { t } = useTranslation();
  const apply = useTreeStore((state) => state.apply);
  const setDirty = useProfileDraft((state) => state.setDirty);
  // What the form opened with: the base of the changes, fixed for the form's life.
  const [opened] = useState(() => {
    const values = formValuesFromPerson(person);
    const parsed = ProfileFormSchema.safeParse(values);
    return { json: JSON.stringify(person), values, base: parsed.success ? parsed.data : null };
  });
  const form = useZodForm(ProfileFormSchema, { defaultValues: opened.values });
  const { errors, isDirty } = form.formState;
  const status = form.watch('status');
  // Compared by content: a reload or a refresh gives every person a new object.
  const changedElsewhere = JSON.stringify(person) !== opened.json;

  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty, setDirty]);
  // The latest callback, so the unmount effect below runs only on unmount.
  const draftLost = useRef(onDraftLost);
  useLayoutEffect(() => {
    draftLost.current = onDraftLost;
  });
  useEffect(
    () => () => {
      // Save, Cancel and the guard's "drop the changes" clear the flag first: still set here,
      // the changes went without the user choosing it.
      if (useProfileDraft.getState().dirty) draftLost.current();
      setDirty(false);
    },
    [setDirty],
  );
  // The Edit button that opened the form is gone: focus moves to the first field.
  const { setFocus } = form;
  useEffect(() => {
    setFocus('fullName');
  }, [setFocus]);

  const close = () => {
    setDirty(false);
    onDone();
  };
  const submit = form.handleSubmit((values) => {
    const changes = personChanges(opened.base, values);
    if (changes === null) {
      close();
      return;
    }
    const result = apply({ type: 'updatePerson', payload: { id: person.id, changes } });
    if (!result.ok) {
      form.setError('root.server', {
        type: 'rule',
        message: applyFailureMessage(t, result.reason),
      });
      return;
    }
    close();
  });

  const dateField = (name: 'birth' | 'death', legend: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <DualDateInput
          legend={legend}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
        />
      )}
    />
  );
  const radio = (name: 'gender' | 'status', value: string, label: string) => (
    <label className="flex items-center gap-2">
      <input type="radio" value={value} className="size-4" {...form.register(name)} />
      {label}
    </label>
  );

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {changedElsewhere ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('tree.profile.changedElsewhere')}
        </p>
      ) : null}
      <TextField
        label={t('tree.form.fullName')}
        autoComplete="off"
        error={errors.fullName?.message}
        {...form.register('fullName')}
      />
      <TextAreaField
        label={t('tree.profile.aliases')}
        hint={t('tree.profile.aliasesHint')}
        error={errors.aliases?.message}
        rows={2}
        {...form.register('aliases')}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">{t('tree.form.gender')}</legend>
        <div className="flex gap-6">
          {radio('gender', 'male', t('tree.form.male'))}
          {radio('gender', 'female', t('tree.form.female'))}
        </div>
      </fieldset>
      {dateField('birth', t('tree.profile.birth'))}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">{t('tree.profile.status')}</legend>
        <div className="flex gap-6">
          {radio('status', 'living', t('tree.form.living'))}
          {radio('status', 'deceased', t('tree.form.deceased'))}
        </div>
      </fieldset>
      {status === 'deceased' ? (
        <>
          {dateField('death', t('tree.profile.death'))}
          <TextField
            label={t('tree.profile.burialPlace')}
            autoComplete="off"
            error={errors.burialPlace?.message}
            {...form.register('burialPlace')}
          />
        </>
      ) : null}
      <TextField
        label={t('tree.profile.siblingOrder')}
        hint={t('tree.profile.siblingOrderHint')}
        inputMode="numeric"
        autoComplete="off"
        error={errors.siblingOrder?.message}
        {...form.register('siblingOrder')}
      />
      <TextField
        label={t('tree.profile.branch')}
        autoComplete="off"
        error={errors.branch?.message}
        {...form.register('branch')}
      />
      <label className="flex items-center gap-2">
        <input type="checkbox" className="size-4" {...form.register('isAdopted')} />
        {t('tree.profile.adopted')}
      </label>
      {inLaw ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium text-ink">
            {t('tree.profile.birthFamily')}
          </legend>
          {(['surname', 'fatherName', 'motherName', 'hometown'] as const).map((key) => (
            <TextField
              key={key}
              label={t(`tree.profile.${key}`)}
              autoComplete="off"
              error={errors.birthFamily?.[key]?.message}
              {...form.register(`birthFamily.${key}`)}
            />
          ))}
          <TextAreaField
            label={t('tree.profile.note')}
            rows={2}
            error={errors.birthFamily?.note?.message}
            {...form.register('birthFamily.note')}
          />
        </fieldset>
      ) : null}
      <TextAreaField
        label={t('tree.profile.bio')}
        rows={5}
        error={errors.bio?.message}
        {...form.register('bio')}
      />
      {errors.root?.server ? (
        <p role="alert" className="text-sm font-medium text-stamp">
          {errors.root.server.message}
        </p>
      ) : null}
      <div className="sticky bottom-0 flex justify-end gap-2 bg-paper py-2">
        <Button type="button" variant="ghost" onClick={close}>
          {t('tree.profile.cancel')}
        </Button>
        <Button type="submit">{t('tree.profile.save')}</Button>
      </div>
    </form>
  );
}
