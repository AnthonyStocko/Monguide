import { useTranslation } from 'react-i18next';

/**
 * Message des lieux OSM partiels : pays pris en charge que la zone de
 * recherche touche mais pas encore importés (sources[].missingCountries,
 * alerte places_partial), ex. « Les lieux situés en Allemagne et au
 * Luxembourg ne sont pas encore disponibles. »
 * @returns {(countries: string[]) => string}
 */
export function usePartialCoverage() {
  const { t, i18n } = useTranslation();
  return (countries) => {
    const parts = countries.map((code) => t(`countriesIn.${code}`, { defaultValue: code }));
    const places = new Intl.ListFormat(i18n.resolvedLanguage, { type: 'conjunction' }).format(parts);
    return t('sources.partial', { places });
  };
}
