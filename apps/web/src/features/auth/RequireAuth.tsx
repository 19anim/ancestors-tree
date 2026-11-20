import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useWakeStore } from '../../shared/lib/wake';
import { useCurrentUser } from './api';

/** Layout route: signed-out visitors go to sign-in and come back afterwards. */
export function RequireAuth() {
  const { t } = useTranslation();
  const location = useLocation();
  const me = useCurrentUser();
  // While the wake-up screen shows, a failed /me is the sleeping server, not a broken page: the
  // screen refetches it once the server answers (spec §13.1).
  const waking = useWakeStore((state) => state.phase !== 'awake');

  // Let the route error element show it.
  if (me.isError && !waking) throw me.error;
  if (me.isPending || me.isError) return <p className="text-ink-muted">{t('common.loading')}</p>;
  if (me.data === null) {
    const returnTo = location.pathname + location.search;
    return <Navigate to={`/login?${new URLSearchParams({ returnTo })}`} replace />;
  }
  return <Outlet />;
}
