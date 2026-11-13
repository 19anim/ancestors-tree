import type { ClanRole } from '@ancestors-tree/shared';
import { useTranslation } from 'react-i18next';

export function RoleLabel({ role }: { role: ClanRole }) {
  const { t } = useTranslation();
  return <>{t(`clans.roles.${role}`)}</>;
}
