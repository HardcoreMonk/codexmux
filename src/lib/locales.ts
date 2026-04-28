export type TSupportedLocale = 'en' | 'ko';

export const DEFAULT_LOCALE: TSupportedLocale = 'en';

export const LOCALE_OPTIONS: ReadonlyArray<{ id: TSupportedLocale; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'ko', label: '한국어' },
];

export const SUPPORTED_LOCALES = LOCALE_OPTIONS.map((locale) => locale.id);

export const isSupportedLocale = (locale: unknown): locale is TSupportedLocale =>
  typeof locale === 'string' && SUPPORTED_LOCALES.includes(locale as TSupportedLocale);

export const normalizeLocale = (locale: unknown): TSupportedLocale =>
  isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
