import { LoginRequestSchema } from '@ancestors-tree/shared';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useUnsentChangeCount } from '../tree';
import { setServerError, useZodForm } from '../../shared/lib/formErrors';
import { Button, TextField } from '../../shared/ui';
import { useAuthProviders, useLogin } from './api';
import { AuthCard } from './AuthCard';
import { GoogleButton } from './GoogleButton';
import { safeReturnTo } from './returnTo';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const rawReturnTo = searchParams.get('returnTo');
  const providers = useAuthProviders();
  const login = useLogin();
  const unsentChanges = useUnsentChangeCount();
  const form = useZodForm(LoginRequestSchema);
  const { errors } = form.formState;
  const registerLink = rawReturnTo ? `/register?${new URLSearchParams({ returnTo })}` : '/register';

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      void navigate(returnTo, { replace: true });
    } catch (error) {
      setServerError(form, error, t);
    }
  });

  return (
    <AuthCard title={t('auth.login.title')}>
      {searchParams.get('error') === 'google' ? (
        <p role="alert" className="text-sm font-medium text-stamp">
          {t('auth.login.googleFailed')}
        </p>
      ) : null}
      {providers.data?.google ? (
        <>
          <GoogleButton returnTo={returnTo} />
          {unsentChanges > 0 ? (
            <p role="alert" className="text-sm font-medium text-stamp">
              {t('auth.login.googleDropsChanges', { count: unsentChanges })}
            </p>
          ) : null}
          <p className="text-center text-sm text-ink-muted">{t('auth.or')}</p>
        </>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label={t('auth.fields.email')}
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...form.register('email')}
        />
        <TextField
          label={t('auth.fields.password')}
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
        {errors.root?.server ? (
          <p role="alert" className="text-sm font-medium text-stamp">
            {errors.root.server.message}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" disabled={login.isPending}>
          {t('auth.login.submit')}
        </Button>
      </form>
      <div className="flex flex-col gap-1 text-sm text-ink-muted">
        <Link to="/forgot-password" className="underline">
          {t('auth.login.forgot')}
        </Link>
        <p>
          {t('auth.login.noAccount')}{' '}
          <Link to={registerLink} className="underline">
            {t('auth.login.register')}
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
