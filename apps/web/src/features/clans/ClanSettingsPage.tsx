import { UpdateClanRequestSchema, type Clan } from '@ancestors-tree/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router';
import { setServerError, useZodForm } from '../../shared/lib/formErrors';
import { Button, TextField } from '../../shared/ui';
import { useUpdateClan } from './api';
import { DeleteClanSection } from './DeleteClanSection';
import { textareaClassName } from './fieldStyles';

export function ClanSettingsPage() {
  const { t } = useTranslation();
  const clan = useOutletContext<Clan>();
  const updateClan = useUpdateClan(clan.id);
  const [saved, setSaved] = useState(false);
  const form = useZodForm(UpdateClanRequestSchema, {
    defaultValues: { name: clan.name, hometown: clan.hometown, description: clan.description },
  });
  const { errors } = form.formState;
  const descriptionId = useId();

  if (clan.role !== 'owner') {
    return (
      <p role="alert" className="font-medium text-stamp">
        {t('errors.FORBIDDEN')}
      </p>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setSaved(false);
    try {
      await updateClan.mutateAsync(values);
      setSaved(true);
    } catch (error) {
      setServerError(form, error, t);
    }
  });

  return (
    <div className="flex flex-col gap-10">
      <form noValidate onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
        <TextField
          label={t('clans.create.name')}
          error={errors.name?.message}
          {...form.register('name')}
        />
        <TextField
          label={t('clans.create.hometown')}
          error={errors.hometown?.message}
          {...form.register('hometown')}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={descriptionId} className="text-sm font-medium text-ink">
            {t('clans.create.description')}
          </label>
          <textarea
            id={descriptionId}
            aria-invalid={errors.description ? true : undefined}
            className={textareaClassName}
            {...form.register('description')}
          />
          {errors.description ? (
            <p className="text-sm font-medium text-stamp">{errors.description.message}</p>
          ) : null}
        </div>
        {errors.root?.server ? (
          <p role="alert" className="text-sm font-medium text-stamp">
            {errors.root.server.message}
          </p>
        ) : null}
        <Button type="submit" className="self-start" disabled={updateClan.isPending}>
          {t('clans.settings.save')}
        </Button>
        <p role="status" className="text-sm font-medium text-ink">
          {saved ? t('clans.settings.saved') : ''}
        </p>
      </form>
      <DeleteClanSection clan={clan} />
    </div>
  );
}
