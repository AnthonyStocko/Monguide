export const SUPPORTED_LANGUAGES = ['fr', 'en'];
export const FALLBACK_LANGUAGE = 'en';

/**
 * Langue de l'interface : le choix enregistré s'il est pris en charge, sinon
 * le français si c'est la langue du téléphone, sinon l'anglais.
 * @param {string | null | undefined} saved
 * @param {readonly string[]} [deviceLanguages] ex. navigator.languages
 * @returns {string}
 */
export function pickLanguage(saved, deviceLanguages = []) {
  if (SUPPORTED_LANGUAGES.includes(saved)) return saved;
  const device = deviceLanguages[0];
  if (typeof device === 'string' && device.toLowerCase().split('-')[0] === 'fr') {
    return 'fr';
  }
  return FALLBACK_LANGUAGE;
}
