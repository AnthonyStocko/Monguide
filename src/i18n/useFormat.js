import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCountry, formatDate, formatNumber, formatRelative } from './format.js';

/** Fonctions de formatage liées à la langue courante de l'interface. */
export function useFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  return useMemo(
    () => ({
      date: (value, options) => formatDate(value, locale, options),
      number: (value, options) => formatNumber(value, locale, options),
      country: (code) => formatCountry(code, locale),
      relative: (value) => formatRelative(value, locale)
    }),
    [locale]
  );
}
