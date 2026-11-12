import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router';
import { Button } from '../shared/ui';

export function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4 px-6 py-16">
      <h1 className="text-3xl font-bold">{t('routeError.title')}</h1>
      <p className="text-ink-muted">{t('routeError.body')}</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => window.location.reload()}>{t('routeError.reload')}</Button>
        <Button asChild variant="secondary">
          {/* A full page load: after an error the router state may be broken. */}
          <a href="/">{t('notFound.home')}</a>
        </Button>
      </div>
    </section>
  );
}
