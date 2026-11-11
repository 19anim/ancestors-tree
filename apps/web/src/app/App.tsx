import { useTranslation } from 'react-i18next';

export function App() {
  const { t } = useTranslation();
  return (
    <>
      <header>
        <h1>{t('app.name')}</h1>
        <p>{t('app.tagline')}</p>
      </header>
      <main />
    </>
  );
}
