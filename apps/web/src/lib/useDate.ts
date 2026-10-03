import { useTranslation } from 'react-i18next';

/** Formats ISO dates for display in the active language (Gregorian calendar). */
export function useFormatDate() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'ar' ? 'ar-EG-u-ca-gregory-nu-latn' : 'en-GB';
  return (iso: string | null | undefined) =>
    iso
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
          new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso),
        )
      : '—';
}

/** Picks the Arabic or English name depending on the UI language. */
export function useLocalizedName() {
  const { i18n } = useTranslation();
  const ar = i18n.resolvedLanguage === 'ar';
  return (en: string, arName: string | null | undefined) => (ar && arName ? arName : en);
}
