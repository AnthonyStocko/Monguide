/**
 * Déploiement progressif de la relecture par l'assistant IA
 * (rules.ai.rolloutPercent, docs/ai-review.md « Bloc G ») : chaque
 * installation de l'application tire un identifiant anonyme au hasard (jamais
 * envoyé au serveur) ; son rang stable 0-99 décide si la relecture lui est
 * proposée. Passer de 10 à 50 % garde les 10 % déjà concernés.
 */

/**
 * Rang stable (0 à 99) d'un identifiant : hachage FNV-1a 32 bits.
 * @param {string} id
 * @returns {number}
 */
export function rolloutBucket(id) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

/**
 * L'installation fait-elle partie du déploiement ?
 * @param {string | null | undefined} id identifiant anonyme de l'installation
 * @param {number} percent rules.ai.rolloutPercent (0 à 100)
 */
export function inRollout(id, percent) {
  if (!(percent > 0) || typeof id !== 'string' || !id) return false;
  return percent >= 100 || rolloutBucket(id) < percent;
}
