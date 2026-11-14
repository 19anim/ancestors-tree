import { useTranslation } from 'react-i18next';
import { useUnsentChangeCount } from '../tree';

/** Google sign-in leaves the page and drops unsent tree changes: says so, only while there are any. */
export function GoogleSignInWarning() {
  const { t } = useTranslation();
  const unsentChanges = useUnsentChangeCount();
  if (unsentChanges === 0) return null;
  return (
    <p role="alert" className="text-sm font-medium text-stamp">
      {t('auth.login.googleDropsChanges', { count: unsentChanges })}
    </p>
  );
}
