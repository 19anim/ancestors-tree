import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button, buttonVariants } from '../../shared/ui';
import { rejectionMessage } from './format';
import { useTreeStore, type TreeNotice } from './store';

function noticeText(t: TFunction, notice: TreeNotice): string {
  switch (notice.kind) {
    case 'reloaded':
      return t('tree.notice.reloaded');
    case 'rejected':
      return notice.dropped > 0
        ? `${t('tree.notice.rejected', { reason: rejectionMessage(t, notice.error) })} ${t('tree.notice.rejectedDependents', { count: notice.dropped })}`
        : t('tree.notice.rejected', { reason: rejectionMessage(t, notice.error) });
    case 'signedOut':
      return t('tree.notice.signedOut');
    case 'discarded':
      return t('tree.notice.discarded', { count: notice.count });
    default: {
      // A new notice kind must be handled above: this stops compiling until it is.
      const unhandled: never = notice;
      return unhandled;
    }
  }
}

/**
 * After a reload, a refused change, a lost session or dropped changes, says what happened. Shown
 * app-wide (by the app shell): the changes may have been lost while another page was open.
 */
export function TreeNoticeBanner() {
  const { t } = useTranslation();
  const notice = useTreeStore((state) => state.notice);
  const dismiss = useTreeStore((state) => state.dismissNotice);
  if (!notice) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-control border border-stamp bg-surface p-3"
    >
      <p className="font-medium text-stamp">{noticeText(t, notice)}</p>
      <div className="flex items-center gap-2">
        {notice.kind === 'signedOut' ? (
          <Link
            to={`/login?${new URLSearchParams({ returnTo: `/clans/${notice.clanId}/tree` })}`}
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            {t('tree.notice.signIn')}
          </Link>
        ) : null}
        <Button variant="ghost" size="sm" onClick={dismiss}>
          {t('tree.notice.dismiss')}
        </Button>
      </div>
    </div>
  );
}
