import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError, errorMessageKey } from '../../shared/lib/apiError';
import { buttonVariants, Button } from '../../shared/ui';
import { useCurrentUser } from '../auth';
import { useAcceptInvite, useInvitePreview } from './api';

export function JoinPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token = '' } = useParams();
  const preview = useInvitePreview(token);
  const me = useCurrentUser();
  const accept = useAcceptInvite(token);
  const returnTo = new URLSearchParams({ returnTo: `/join/${token}` }).toString();

  const join = async () => {
    try {
      const result = await accept.mutateAsync();
      void navigate(`/clans/${result.clanId}/tree`);
    } catch {
      // Shown below through accept.error.
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-bold text-ink">{t('clans.join.title')}</h1>
      {preview.isPending ? <p className="text-ink-muted">{t('common.loading')}</p> : null}
      {preview.isError ? (
        <>
          <p role="alert" className="font-medium text-stamp">
            {t(errorMessageKey(preview.error))}
          </p>
          <Link to="/" className="underline">
            {t('clans.join.home')}
          </Link>
        </>
      ) : null}
      {preview.data ? (
        <>
          <p className="text-ink">
            {t('clans.join.offer', {
              inviter: preview.data.invitedByName,
              clan: preview.data.clanName,
              role: t(`clans.roles.${preview.data.role}`),
            })}
          </p>
          {accept.isError ? (
            <p role="alert" className="text-sm font-medium text-stamp">
              {accept.error instanceof ApiError && accept.error.code === 'FORBIDDEN'
                ? t('clans.join.forbidden')
                : t(errorMessageKey(accept.error))}
            </p>
          ) : null}
          {me.isError ? (
            <p role="alert" className="text-sm font-medium text-stamp">
              {t(errorMessageKey(me.error))}
            </p>
          ) : null}
          {me.data ? (
            <Button className="self-start" onClick={() => void join()} disabled={accept.isPending}>
              {t('clans.join.accept')}
            </Button>
          ) : null}
          {me.data === null ? (
            <div className="flex flex-wrap gap-2">
              <Link to={`/login?${returnTo}`} className={buttonVariants({ variant: 'primary' })}>
                {t('clans.join.signIn')}
              </Link>
              <Link
                to={`/register?${returnTo}`}
                className={buttonVariants({ variant: 'secondary' })}
              >
                {t('clans.join.register')}
              </Link>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
