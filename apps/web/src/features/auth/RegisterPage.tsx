import { RegisterRequestSchema } from '@ancestors-tree/shared';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { setServerError, useZodForm } from '../../shared/lib/formErrors';
import { Button, TextField } from '../../shared/ui';
import { useAuthProviders, useRegister } from './api';
import { AuthCard } from './AuthCard';
import { GoogleButton } from './GoogleButton';
import { safeReturnTo } from './returnTo';

export function RegisterPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawReturnTo = searchParams.get('returnTo');
  const returnTo = safeReturnTo(rawReturnTo);
  const providers = useAuthProviders();
  const register = useRegister();
  const form = useZodForm(RegisterRequestSchema);
  const { errors } = form.formState;
  const loginLink = rawReturnTo ? `/login?${new URLSearchParams({ returnTo })}` : '/login';

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await register.mutateAsync({
        ...values,
        locale: i18n.resolvedLanguage === 'en' ? 'en' : 'vi',
      });
      void navigate(returnTo, { replace: true });
    } catch (error) {
      setServerError(form, error, t, { EMAIL_TAKEN: 'email' });
    }
  });

  return (
    <AuthCard title={t('auth.register.title')}>
      {providers.data?.google ? (
        <>
          <GoogleButton returnTo={returnTo} />
          <p className="text-center text-sm text-ink-muted">{t('auth.or')}</p>
        </>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label={t('auth.fields.name')}
          autoComplete="name"
          error={errors.name?.message}
          {...form.register('name')}
        />
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
        <Button type="submit" variant="primary" className="w-full" disabled={register.isPending}>
          {t('auth.register.submit')}
        </Button>
      </form>
      <p className="text-sm text-ink-muted">
        {t('auth.register.haveAccount')}{' '}
        <Link to={loginLink} className="underline">
          {t('auth.register.login')}
        </Link>
      </p>
    </AuthCard>
  );
}
