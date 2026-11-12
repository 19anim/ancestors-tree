import { ResetPasswordRequestSchema } from '@ancestors-tree/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { setServerError, useZodForm } from '../../shared/lib/formErrors';
import { Button, TextField } from '../../shared/ui';
import { useResetPassword } from './api';
import { AuthCard } from './AuthCard';

const PasswordOnlySchema = ResetPasswordRequestSchema.pick({ password: true });

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // The token travels in the fragment so it never reaches server logs; read it once.
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token'));
  const reset = useResetPassword();
  const form = useZodForm(PasswordOnlySchema);
  const { errors } = form.formState;

  useEffect(() => {
    // Keep the token out of the address bar and the browser history.
    window.history.replaceState(null, '', location.pathname);
  }, [location.pathname]);

  const onSubmit = form.handleSubmit(async ({ password }) => {
    if (!token) return;
    try {
      await reset.mutateAsync({ token, password });
      void navigate('/clans', { replace: true });
    } catch (error) {
      setServerError(form, error, t);
    }
  });

  const requestNew = (
    <Link to="/forgot-password" className="text-sm text-ink-muted underline">
      {t('auth.reset.requestNew')}
    </Link>
  );

  if (!token) {
    return (
      <AuthCard title={t('auth.reset.title')}>
        <p className="text-sm text-ink">{t('auth.reset.missing')}</p>
        {requestNew}
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('auth.reset.title')}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label={t('auth.fields.newPassword')}
          type="password"
          autoComplete="new-password"
          hint={t('auth.fields.passwordHint')}
          error={errors.password?.message}
          {...form.register('password')}
        />
        {errors.root?.server ? (
          <p role="alert" className="text-sm font-medium text-stamp">
            {errors.root.server.message}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" disabled={reset.isPending}>
          {t('auth.reset.submit')}
        </Button>
      </form>
      {errors.root?.server ? requestNew : null}
    </AuthCard>
  );
}
