import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../shared/ui';
import { SampleFamilyBoard } from './SampleFamilyBoard';

export function HomePage() {
  const { t } = useTranslation();
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="max-w-md">
        <h1 className="text-4xl font-bold sm:text-5xl">{t('home.title')}</h1>
        <p className="mt-4 text-lg text-ink-muted">{t('app.tagline')}</p>
        <Button asChild variant="secondary" className="mt-8">
          <Link to="/design">{t('home.galleryLink')}</Link>
        </Button>
      </div>
      <figure className="m-0 min-w-0">
        <div className="overflow-x-auto pb-2">
          <SampleFamilyBoard />
        </div>
        <figcaption className="mt-3 max-w-[560px] text-sm text-ink-muted">
          {t('home.legend')}
        </figcaption>
      </figure>
    </div>
  );
}
