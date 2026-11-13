import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button, buttonVariants } from '../../shared/ui';
import { useCurrentUser, useLogout } from './api';

export function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useCurrentUser();
  const logout = useLogout();

  if (!me.data) {
    return (
      <Link to="/login" className={buttonVariants({ variant: 'ghost' })}>
        {t('auth.menu.signIn')}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink" title={t('auth.menu.signedInAs', { name: me.data.name })}>
        {me.data.name}
      </span>
      <Button
        variant="ghost"
        disabled={logout.isPending}
        onClick={() => logout.mutate(undefined, { onSettled: () => void navigate('/') })}
      >
        {t('auth.menu.signOut')}
      </Button>
    </div>
  );
}
