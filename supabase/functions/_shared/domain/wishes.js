/**
 * « Vos envies pour ce séjour » : texte libre facultatif (formulaire, étape 5),
 * transmis à l'IA de relecture comme une DONNÉE (jamais comme une
 * instruction : voir les consignes ai/prompts). Enregistré dans
 * trip.params.wishes pour une éventuelle régénération. Même nettoyage et
 * même contrôle de longueur dans l'application et sur le serveur.
 */

/** Suggestions en puces (clés traduites par l'application : tripForm.profile.wishSuggestions.<clé>). */
export const WISH_SUGGESTIONS = Object.freeze(['wine', 'lessWalking', 'kids', 'nature', 'fewMuseums']);

/** Séparateur des suggestions ajoutées au texte. */
const JOIN = ', ';

/**
 * Texte brut : sans balise HTML ni caractère de contrôle, espaces
 * normalisés (une ligne), sans espace au début ni à la fin.
 * @param {unknown} text
 * @returns {string}
 */
export function cleanWishes(text) {
  if (typeof text !== 'string') return '';
  const separators = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, 'g');
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(separators, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Erreur de validation du texte (après nettoyage), ou null.
 * @returns {'wishesTooLong' | null}
 */
export function validateWishes(text, rules) {
  return cleanWishes(text).length > rules.ai.wishesMaxLength ? 'wishesTooLong' : null;
}

/**
 * Ajoute une suggestion au texte, ou la retire si elle y est déjà ; jamais
 * au-delà de la longueur maximale (la suggestion n'est alors pas ajoutée).
 * @param {string} text
 * @param {string} suggestion libellé traduit
 * @returns {string}
 */
export function toggleWish(text, suggestion, rules) {
  const parts = cleanWishes(text)
    .split(/\s*,\s*/)
    .filter(Boolean);
  if (parts.includes(suggestion)) return parts.filter((p) => p !== suggestion).join(JOIN);
  const next = [...parts, suggestion].join(JOIN);
  return next.length <= rules.ai.wishesMaxLength ? next : parts.join(JOIN);
}

/** La suggestion figure-t-elle dans le texte ? (puce cochée) */
export function hasWish(text, suggestion) {
  return cleanWishes(text)
    .split(/\s*,\s*/)
    .includes(suggestion);
}

/**
 * Relecture par une IA possible (rules.ai.enabled, fournisseur autre que
 * "off") : sinon le champ « Vos envies » est masqué.
 */
export function aiReviewAvailable(rules) {
  return Boolean(rules.ai?.enabled) && rules.ai?.provider !== 'off';
}
