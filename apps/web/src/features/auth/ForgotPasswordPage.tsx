import { ForgotPasswordRequestSchema } from '@ancestors-tree/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { setServerError, useZodForm } from '../../shared/lib/formErrors';
import { Button, TextField } from '../../shared/ui';
import { useForgotPassword } from './api';
import { AuthCard } from './AuthCard';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const forgot = useForgotPassword();
  const form = useZodForm(ForgotPasswordRequestSchema);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await forgot.mutateAsync(values);
    } catch (error) {
      setServerError(form, error, t);
    }
  });

  return (
    <AuthCard title={t('auth.forgot.title')}>
      {forgot.isSuccess ? (
        <p role="status" className="text-sm text-ink">
          {t('auth.forgot.sent')}
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">{t('auth.forgot.intro')}</p>
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
            <TextField
              label={t('auth.fields.email')}
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...form.register('email')}
            />
            {errors.root?.server ? (
              <p role="alert" className="text-sm font-medium text-stamp">
                {errors.root.server.message}
              </p>
            ) : null}
            <Button type="submit" variant="primary" className="w-full" disabled={forgot.isPending}>
              {t('auth.forgot.submit')}
            </Button>
          </form>
        </>
      )}
      <Link to="/login" className="text-sm text-ink-muted underline">
        {t('auth.forgot.back')}
      </Link>
    </AuthCard>
  );
}
