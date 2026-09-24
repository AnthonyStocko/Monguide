import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';
import en from './locales/en.json';
import * as settings from '../services/settings.js';
import { SETTINGS_KEYS } from '../services/settings.js';
import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES, pickLanguage } from './language.js';

/** Initialise i18next avec la langue enregistrée ou celle du téléphone. */
export async function initI18n() {
  let saved = null;
  try {
    saved = await settings.get(SETTINGS_KEYS.language);
  } catch {
    // Réglage illisible : on retombe sur la langue du téléphone.
  }
  const lng = pickLanguage(saved, navigator.languages ?? [navigator.language]);

  await i18n.use(initReactI18next).init({
    resources: {
      fr: { translation: fr },
      en: { translation: en }
    },
    lng,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false },
    showSupportNotice: false
  });

  document.documentElement.lang = lng;
  i18n.on('languageChanged', (next) => {
    document.documentElement.lang = next;
  });
  return i18n;
}

/**
 * Change la langue de toute l'interface et l'enregistre.
 * @param {string} lng
 */
export async function setLanguage(lng) {
  await i18n.changeLanguage(lng);
  await settings.set(SETTINGS_KEYS.language, lng);
}
