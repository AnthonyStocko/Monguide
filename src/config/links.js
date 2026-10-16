import { useConfig } from '../hooks/useConfig.js';
import { getRules } from '../services/rules.js';

/**
 * Adresses publiques et contact (version web, Play Store, pages légales,
 * adresse e-mail) : rubrique "public" des règles, écrite dans rules.js et
 * surchargeable par app_config. Aucune adresse n'est écrite ailleurs dans
 * l'application.
 * @typedef {typeof import('@domain/config/rules.js').RULES.public} PublicLinks
 */

/**
 * Valeurs courantes, hors composant React (règles reçues du serveur au
 * lancement, sinon valeurs embarquées).
 * @returns {PublicLinks}
 */
export function publicLinks() {
  return getRules().public;
}

/**
 * Valeurs courantes dans un composant : l'écran se met à jour quand la
 * configuration du serveur arrive.
 * @returns {PublicLinks}
 */
export function usePublicLinks() {
  return useConfig().config.rules.public;
}
