// Seconde exception au "tout passe par le serveur" (après les tuiles de la
// carte) : les miniatures Wikimedia Commons, chargées directement.
export const IMAGE_ORIGIN = 'https://upload.wikimedia.org/';

/**
 * Adresse d'image que l'application accepte d'afficher : miniature Wikimedia
 * Commons, ou image embarquée (data:image/…, sans réseau).
 * @param {unknown} url
 */
export function isAllowedImageUrl(url) {
  return typeof url === 'string' && (url.startsWith(IMAGE_ORIGIN) || url.startsWith('data:image/'));
}
