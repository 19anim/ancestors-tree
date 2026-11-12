import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../shared/ui';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <section className="flex max-w-md flex-col gap-4">
      <h1 className="text-3xl font-bold">{t('notFound.title')}</h1>
      <p className="text-ink-muted">{t('notFound.body')}</p>
      <Button asChild variant="secondary" className="self-start">
        <Link to="/">{t('notFound.home')}</Link>
      </Button>
    </section>
  );
}
