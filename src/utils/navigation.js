/**
 * Lien "geo:" (RFC 5870) : ouvre l'application de navigation du téléphone
 * sur un point, l'itinéraire partant de la position actuelle.
 * @param {{ lat: number, lon: number }} point
 * @param {string} [label]
 */
export function geoUrl({ lat, lon }, label) {
  const q = `${lat},${lon}${label ? `(${encodeURIComponent(label)})` : ''}`;
  return `geo:${lat},${lon}?q=${q}`;
}

/** Lien d'appel téléphonique (espaces et tirets retirés). */
export function telUrl(phone) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** Adresse web complète (https ajouté si absent). */
export function webUrl(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
