import { useTranslation } from 'react-i18next';
import { displayName, stepDisplayName } from '@domain/displayName.js';

/**
 * Noms de lieux dans la langue de l'interface (domain/displayName.js). Le
 * composant est réaffiché quand la langue change : les noms suivent. Le nom
 * enregistré dans le séjour, lui, ne change pas.
 * @returns {{ placeName: (place: object) => string, stepName: (step: object) => string | null }}
 */
export function usePlaceName() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  return {
    placeName: (place) => displayName(place, lang),
    stepName: (step) => stepDisplayName(step, lang)
  };
}
