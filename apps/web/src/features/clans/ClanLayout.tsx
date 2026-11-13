import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useParams } from 'react-router';
import { errorMessageKey } from '../../shared/lib/apiError';
import { cn } from '../../shared/lib/cn';
import { useClan } from './api';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-control px-3 py-2 text-sm font-medium text-ink hover:bg-paper-grid',
    isActive && 'bg-paper-grid underline',
  );

export function ClanLayout() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const clan = useClan(id);

  if (!clan.data) {
    if (clan.isPending) return <p className="text-ink-muted">{t('common.loading')}</p>;
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="font-medium text-stamp">
          {t(errorMessageKey(clan.error))}
        </p>
        <Link to="/clans" className="self-start underline">
          {t('clans.backToList')}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink">{clan.data.name}</h1>
      <nav aria-label={t('clans.tabs.label')} className="flex gap-2">
        <NavLink to="tree" className={tabClass}>
          {t('clans.tabs.tree')}
        </NavLink>
        <NavLink to="members" className={tabClass}>
          {t('clans.tabs.members')}
        </NavLink>
        {clan.data.role === 'owner' ? (
          <NavLink to="settings" className={tabClass}>
            {t('clans.tabs.settings')}
          </NavLink>
        ) : null}
      </nav>
      {/* The tree page is a lazy chunk: keep the heading and tabs while it loads. */}
      <Suspense fallback={<p className="text-ink-muted">{t('common.loading')}</p>}>
        <Outlet context={clan.data} />
      </Suspense>
    </div>
  );
}
