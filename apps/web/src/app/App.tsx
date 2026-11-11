import { useTranslation } from 'react-i18next';
import { ServerStatus } from '../features/system';

export function App() {
  const { t } = useTranslation();
  return (
    <>
      <header>
        <h1>{t('app.name')}</h1>
        <p>{t('app.tagline')}</p>
      </header>
      <main>
        <ServerStatus />
      </main>
    </>
  );
}
