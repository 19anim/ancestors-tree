import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/** Keeps <html lang> and the meta description in the active language (SEO, screen readers). */
export function useDocumentLanguage(): void {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const description = t('app.description');

  useEffect(() => {
    document.documentElement.lang = language;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [language, description]);
}
