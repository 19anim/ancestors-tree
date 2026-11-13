import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useCurrentUser } from './api';

/** Layout route: signed-out visitors go to sign-in and come back afterwards. */
export function RequireAuth() {
  const { t } = useTranslation();
  const location = useLocation();
  const me = useCurrentUser();

  // Let the route error element show it.
  if (me.isError) throw me.error;
  if (me.isPending) return <p className="text-ink-muted">{t('common.loading')}</p>;
  if (me.data === null) {
    const returnTo = location.pathname + location.search;
    return <Navigate to={`/login?${new URLSearchParams({ returnTo })}`} replace />;
  }
  return <Outlet />;
}
