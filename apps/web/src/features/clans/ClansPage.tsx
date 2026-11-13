import { CreateClanRequestSchema } from '@ancestors-tree/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { errorMessageKey } from '../../shared/lib/apiError';
import { setServerError, useZodForm } from '../../shared/lib/formErrors';
import { Button, TextField } from '../../shared/ui';
import { useClans, useCreateClan } from './api';
import { textareaClassName } from './fieldStyles';
import { RoleLabel } from './RoleLabel';

export function ClansPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const clans = useClans();
  const createClan = useCreateClan();
  const form = useZodForm(CreateClanRequestSchema, {
    defaultValues: { name: '', hometown: '', description: '' },
  });
  const { errors } = form.formState;
  const headingId = useId();
  const descriptionId = useId();

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const clan = await createClan.mutateAsync(values);
      void navigate(`/clans/${clan.id}/tree`);
    } catch (error) {
      setServerError(form, error, t);
    }
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-ink">{t('clans.title')}</h1>

      {clans.isPending ? <p className="text-ink-muted">{t('common.loading')}</p> : null}
      {clans.isError ? (
        <p role="alert" className="text-sm font-medium text-stamp">
          {t(errorMessageKey(clans.error))}
        </p>
      ) : null}
      {clans.data && clans.data.length === 0 ? (
        <p className="text-ink-muted">{t('clans.empty')}</p>
      ) : null}
      {clans.data && clans.data.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {clans.data.map((clan) => (
            <li key={clan.id} className="rounded-photo border border-line bg-surface p-4">
              <Link to={`/clans/${clan.id}`} className="text-lg font-bold text-ink underline">
                {clan.name}
              </Link>
              {clan.hometown ? <p className="text-ink-muted">{clan.hometown}</p> : null}
              <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-ink-muted">
                <span>
                  <RoleLabel role={clan.role} />
                </span>
                <span>{t('clans.memberCount', { n: clan.memberCount })}</span>
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <section aria-labelledby={headingId} className="max-w-xl">
        <h2 id={headingId} className="mb-4 text-lg font-bold text-ink">
          {t('clans.create.title')}
        </h2>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <TextField
            label={t('clans.create.name')}
            placeholder={t('clans.create.namePlaceholder')}
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
          <Button type="submit" disabled={createClan.isPending}>
            {t('clans.create.submit')}
          </Button>
        </form>
      </section>
    </div>
  );
}
