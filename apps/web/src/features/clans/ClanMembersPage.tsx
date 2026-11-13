import type { Clan, InviteRole, Member } from '@ancestors-tree/shared';
import { UserMinus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useOutletContext } from 'react-router';
import { errorMessageKey } from '../../shared/lib/apiError';
import { Button, Dialog, DialogClose, DialogContent } from '../../shared/ui';
import { useChangeRole, useMembers, useRemoveMember } from './api';
import { selectClassName } from './fieldStyles';
import { InvitesPanel } from './InvitesPanel';
import { RoleLabel } from './RoleLabel';

export function ClanMembersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const clan = useOutletContext<Clan>();
  const members = useMembers(clan.id);
  const changeRole = useChangeRole(clan.id);
  const removeMember = useRemoveMember(clan.id);
  const [target, setTarget] = useState<Member | null>(null);
  const isOwner = clan.role === 'owner';

  const confirm = async () => {
    if (!target) return;
    const leaving = target.isYou;
    try {
      await removeMember.mutateAsync({ userId: target.userId, isYou: target.isYou });
    } catch {
      // Shown below through removeMember.error; keep the dialog closed so the list is readable.
      setTarget(null);
      return;
    }
    setTarget(null);
    if (leaving) void navigate('/clans');
  };

  const mutationError = changeRole.error ?? removeMember.error;

  return (
    <div className="flex flex-col gap-8">
      {members.isPending ? <p className="text-ink-muted">{t('common.loading')}</p> : null}
      {members.isError ? (
        <p role="alert" className="text-sm font-medium text-stamp">
          {t(errorMessageKey(members.error))}
        </p>
      ) : null}
      {mutationError ? (
        <p role="alert" className="text-sm font-medium text-stamp">
          {t(errorMessageKey(mutationError))}
        </p>
      ) : null}
      {members.data ? (
        <ul className="divide-y divide-line rounded-photo border border-line bg-surface">
          {members.data.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {member.name}
                  {member.isYou ? (
                    <span className="ml-2 text-ink-muted">{t('clans.members.you')}</span>
                  ) : null}
                </p>
                {member.email ? (
                  <p className="text-sm break-all text-ink-muted">{member.email}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isOwner && !member.isYou && member.role !== 'owner' ? (
                  <>
                    <select
                      aria-label={t('clans.members.role', { name: member.name })}
                      className={selectClassName}
                      value={member.role}
                      disabled={changeRole.isPending}
                      onChange={(event) =>
                        changeRole.mutate({
                          userId: member.userId,
                          role: event.target.value as InviteRole,
                        })
                      }
                    >
                      <option value="editor">{t('clans.roles.editor')}</option>
                      <option value="viewer">{t('clans.roles.viewer')}</option>
                    </select>
                    <Button
                      variant="secondary"
                      aria-label={t('clans.members.removeNamed', { name: member.name })}
                      onClick={() => setTarget(member)}
                    >
                      <UserMinus aria-hidden="true" size={16} strokeWidth={1.75} />
                      {t('clans.members.remove')}
                    </Button>
                  </>
                ) : (
                  <span className="text-sm text-ink-muted">
                    <RoleLabel role={member.role} />
                  </span>
                )}
                {!isOwner && member.isYou ? (
                  <Button variant="secondary" onClick={() => setTarget(member)}>
                    {t('clans.members.leave')}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {isOwner ? <InvitesPanel clanId={clan.id} /> : null}

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        {target ? (
          <DialogContent
            title={
              target.isYou
                ? t('clans.members.leaveTitle', { clan: clan.name })
                : t('clans.members.removeTitle', { name: target.name })
            }
            description={
              target.isYou
                ? t('clans.members.leaveBody')
                : t('clans.members.removeBody', { name: target.name })
            }
          >
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="secondary">{t('clans.members.cancel')}</Button>
              </DialogClose>
              <Button
                variant="danger"
                disabled={removeMember.isPending}
                onClick={() => void confirm()}
              >
                {target.isYou ? t('clans.members.leave') : t('clans.members.remove')}
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
