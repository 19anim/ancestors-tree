import { UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui';

/** No one in the family tree yet; editors get the button that starts it. */
export function EmptyTree({ onAddFirst }: { onAddFirst?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="board-grid flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-control border border-line p-8 text-center">
      <p className="text-lg text-ink">{t('tree.empty')}</p>
      {onAddFirst ? (
        <Button onClick={onAddFirst}>
          <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.75} />
          {t('tree.actions.addFirst')}
        </Button>
      ) : null}
    </div>
  );
}
