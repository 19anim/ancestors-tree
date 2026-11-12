import { useTranslation } from 'react-i18next';
import { buttonVariants } from '../../shared/ui';

/** A plain link: Google sign-in is a full-page redirect handled by the API. */
export function GoogleButton({ returnTo }: { returnTo: string }) {
  const { t } = useTranslation();
  return (
    <a
      href={`/api/auth/google/start?${new URLSearchParams({ returnTo })}`}
      className={buttonVariants({ variant: 'secondary' })}
    >
      {t('auth.google')}
    </a>
  );
}
