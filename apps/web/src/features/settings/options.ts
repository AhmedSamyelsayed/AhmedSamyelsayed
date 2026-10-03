export const COUNTRY_CODES = [
  'EG',
  'SA',
  'AE',
  'KW',
  'QA',
  'BH',
  'OM',
  'JO',
  'LB',
  'IQ',
  'SY',
  'PS',
  'YE',
  'LY',
  'TN',
  'DZ',
  'MA',
  'SD',
  'TR',
  'GB',
  'US',
  'DE',
  'FR',
] as const;

const FALLBACK_ZONES = [
  'Africa/Cairo',
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Kuwait',
  'Asia/Qatar',
  'Asia/Bahrain',
  'Asia/Muscat',
  'Asia/Amman',
  'Asia/Beirut',
  'Asia/Baghdad',
  'Africa/Tripoli',
  'Africa/Tunis',
  'Africa/Algiers',
  'Africa/Casablanca',
  'Africa/Khartoum',
  'Europe/Istanbul',
  'Europe/London',
  'UTC',
];

export function timeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  try {
    return intl.supportedValuesOf?.('timeZone') ?? FALLBACK_ZONES;
  } catch {
    return FALLBACK_ZONES;
  }
}

export function countryName(code: string, lng: string): string {
  try {
    return new Intl.DisplayNames([lng], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Weekday names in the UI language, index = JS getDay() (0 = Sunday). */
export function weekdayNames(lng: string): string[] {
  const fmt = new Intl.DateTimeFormat(lng, { weekday: 'long', timeZone: 'UTC' });
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2023, 0, 1 + i))));
}
