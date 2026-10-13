/**
 * Aide à l'installation de la version web : règles pures (aucun accès au
 * navigateur), utilisées par platform/install.web.js et InstallCoach.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** iPhone, iPod, iPad (un iPad récent se présente comme un Mac à écran tactile). */
function isIos(userAgent, maxTouchPoints) {
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

/** Autres navigateurs d'iOS : pas de bouton Partager dans la barre du bas, l'aide illustrée ne s'applique pas. */
const isOtherIosBrowser = (userAgent) => /CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);

/**
 * Aide à proposer :
 * - "installed" : application déjà installée, aucune aide ;
 * - "playStore" : Android, lien vers le Play Store ;
 * - "ios" : Safari sur iPhone ou iPad, écran d'aide en trois étapes ;
 * - "prompt" : Chrome ou Edge sur ordinateur, bouton « Installer l'application » ;
 * - "none" : rien à proposer (Firefox, Safari sur Mac…).
 * @param {{ userAgent: string, maxTouchPoints?: number, standalone: boolean, promptAvailable: boolean }} context
 * @returns {'installed' | 'playStore' | 'ios' | 'prompt' | 'none'}
 */
export function installMode({ userAgent, maxTouchPoints = 0, standalone, promptAvailable }) {
  if (standalone) return 'installed';
  if (/Android/i.test(userAgent)) return 'playStore';
  if (isIos(userAgent, maxTouchPoints)) return isOtherIosBrowser(userAgent) ? 'none' : 'ios';
  return promptAvailable ? 'prompt' : 'none';
}

/**
 * L'écran d'aide de l'iPhone peut-il être proposé ? Jamais après un refus
 * définitif, et jamais plus d'une fois par semaine.
 * @param {{ lastShownAt?: number | null, declined?: boolean } | null} state
 * @param {number} now horodatage en millisecondes
 */
export function iosHelpDue(state, now) {
  if (state?.declined) return false;
  return state?.lastShownAt == null || now - state.lastShownAt >= WEEK_MS;
}

/**
 * Faut-il afficher (une seule fois) le message « Pour garder vos séjours sur
 * cet appareil… » ? Oui si le navigateur a refusé le stockage durable, ou sur
 * iPhone tant que l'application n'est pas installée ; jamais avec un compte
 * (les séjours y sont sauvegardés), ni dans l'application installée.
 * @param {{ mode: string, persisted: boolean, signedIn: boolean, alreadyShown: boolean }} context
 */
export function storageNoticeNeeded({ mode, persisted, signedIn, alreadyShown }) {
  if (alreadyShown || signedIn || mode === 'installed') return false;
  return !persisted || mode === 'ios';
}
