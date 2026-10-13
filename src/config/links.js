/** Pages web publiques (GitHub Pages, dossier site/ du dépôt). */
export const SITE_URL = 'https://anthonystocko.github.io/Monguide';

/**
 * Adresse de la version web (https://app.…, sans barre finale), fournie au
 * build par VITE_WEB_APP_URL ; vide tant qu'elle n'est pas configurée.
 */
export const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL ?? '').replace(/\/+$/, '');

/** Fiche de l'application Android sur Google Play (identifiant de capacitor.config.json). */
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.monguide.app';

const PAGES = {
  fr: { privacy: 'fr/confidentialite.html', deleteAccount: 'fr/suppression-compte.html' },
  en: { privacy: 'en/privacy.html', deleteAccount: 'en/delete-account.html' }
};

/**
 * @param {'privacy' | 'deleteAccount'} page
 * @param {string} lang langue de l'interface
 */
export function sitePage(page, lang) {
  return `${SITE_URL}/${(PAGES[lang] ?? PAGES.en)[page]}`;
}
