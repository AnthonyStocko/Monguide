/** Pages web publiques (GitHub Pages, dossier site/ du dépôt). */
export const SITE_URL = 'https://anthonystocko.github.io/Monguide';

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
