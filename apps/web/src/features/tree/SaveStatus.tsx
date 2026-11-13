import { useTranslation } from 'react-i18next';
import { useTreeStore } from './store';

/** Whether every change has reached the server (announced politely by screen readers). */
export function SaveStatus() {
  const { t } = useTranslation();
  const pending = useTreeStore((state) => state.pending.length);
  const retrying = useTreeStore((state) => state.retrying);
  const text = retrying
    ? t('tree.save.retrying')
    : pending > 0
      ? t('tree.save.saving')
      : t('tree.save.saved');
  return (
    <p role="status" className="text-sm text-ink-muted">
      {text}
    </p>
  );
}
