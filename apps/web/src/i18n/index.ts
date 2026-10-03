import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';

export type AppLocale = 'en' | 'ar';

export function directionFor(lng: string): 'rtl' | 'ltr' {
  return lng.startsWith('ar') ? 'rtl' : 'ltr';
}

/** Keeps <html lang dir> in sync so Tailwind logical utilities flip for RTL. */
export function applyDocumentDirection(lng: string): void {
  document.documentElement.lang = lng;
  document.documentElement.dir = directionFor(lng);
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar'],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'figure.locale',
      caches: ['localStorage'],
    },
  });

applyDocumentDirection(i18n.resolvedLanguage ?? 'en');
i18n.on('languageChanged', applyDocumentDirection);

export default i18n;
