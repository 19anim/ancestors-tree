import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui';

interface ThemeBannerProps {
  onBack: () => void;
  /** Null for viewers, and when the family's theme already looks like mine. */
  onUseForClan: (() => void) | null;
}

/** "You are viewing your own theme" (spec §13.4), above the board while my choices are on. */
export function ThemeBanner({ onBack, onUseForClan }: ThemeBannerProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-paper-grid p-3">
      <p className="mr-auto text-ink">{t('tree.decor.banner.text')}</p>
      <Button variant="secondary" size="sm" onClick={onBack}>
        {t('tree.decor.banner.back')}
      </Button>
      {onUseForClan ? (
        <Button variant="secondary" size="sm" onClick={onUseForClan}>
          {t('tree.decor.banner.useForClan')}
        </Button>
      ) : null}
    </div>
  );
}

/** My choices could not be saved: they stay on screen, and one button sends them again. */
export function DecorSaveError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2">
      <p className="font-medium text-stamp">{t('tree.decor.save.failed')}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {t('tree.decor.save.retry')}
      </Button>
    </div>
  );
}
