import type { InviteRole } from '@ancestors-tree/shared';
import { Copy, Link as LinkIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessageKey } from '../../shared/lib/apiError';
import { Button } from '../../shared/ui';
import { useCreateInvite, useInvites, useRevokeInvite } from './api';
import { selectClassName } from './fieldStyles';
import { RoleLabel } from './RoleLabel';

export function InvitesPanel({ clanId }: { clanId: string }) {
  const { t, i18n } = useTranslation();
  const invites = useInvites(clanId, true);
  const createInvite = useCreateInvite(clanId);
  const revokeInvite = useRevokeInvite(clanId);
  const [role, setRole] = useState<InviteRole>('viewer');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const headingId = useId();
  const roleId = useId();
  const formatDate = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  const error = invites.error ?? createInvite.error ?? revokeInvite.error;

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), 4000);
    return () => clearTimeout(timer);
  }, [copyState]);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-lg font-bold text-ink">
        {t('clans.invites.title')}
      </h2>
      <p className="text-ink-muted">{t('clans.invites.intro')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={roleId} className="text-sm font-medium text-ink">
            {t('clans.invites.role')}
          </label>
          <select
            id={roleId}
            className={selectClassName}
            value={role}
            onChange={(event) => setRole(event.target.value as InviteRole)}
          >
            <option value="editor">{t('clans.roles.editor')}</option>
            <option value="viewer">{t('clans.roles.viewer')}</option>
          </select>
        </div>
        <Button onClick={() => createInvite.mutate(role)} disabled={createInvite.isPending}>
          <LinkIcon aria-hidden="true" size={16} strokeWidth={1.75} />
          {t('clans.invites.create')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-stamp">
          {t(errorMessageKey(error))}
        </p>
      ) : null}
      <p role="status" className="text-sm font-medium text-ink">
        {copyState === 'copied' ? t('clans.invites.copied') : ''}
        {copyState === 'failed' ? t('clans.invites.copyFailed') : ''}
      </p>
      {invites.data && invites.data.length === 0 ? (
        <p className="text-ink-muted">{t('clans.invites.empty')}</p>
      ) : null}
      {invites.data && invites.data.length > 0 ? (
        <ul className="divide-y divide-line rounded-photo border border-line bg-surface">
          {invites.data.map((invite) => {
            const url = `${window.location.origin}/join/${invite.token}`;
            const roleName = t(`clans.roles.${invite.role}`);
            const date = formatDate.format(new Date(invite.expiresAt));
            return (
              <li key={invite.id} className="flex flex-col gap-2 p-4">
                <p className="text-sm text-ink-muted">
                  <RoleLabel role={invite.role} /> · {t('clans.invites.expires', { date })}
                </p>
                <input
                  type="text"
                  readOnly
                  aria-label={t('clans.invites.link', { role: roleName })}
                  value={url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="h-10 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
                />
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    aria-label={t('clans.invites.copyNamed', { role: roleName, date })}
                    onClick={() => void copy(url)}
                  >
                    <Copy aria-hidden="true" size={16} strokeWidth={1.75} />
                    {t('clans.invites.copy')}
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={t('clans.invites.revokeNamed', { role: roleName, date })}
                    onClick={() => revokeInvite.mutate(invite.id)}
                    disabled={revokeInvite.isPending}
                  >
                    {t('clans.invites.revoke')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
