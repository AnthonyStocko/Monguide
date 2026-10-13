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

/**
 * Service de cartes à ouvrir depuis un navigateur : "geo" sur Android,
 * "apple" (Plans) sur iPhone, iPad et Mac, "google" ailleurs.
 * @param {string} userAgent
 * @returns {'geo' | 'apple' | 'google'}
 */
export function mapsProvider(userAgent) {
  if (/Android/i.test(userAgent)) return 'geo';
  if (/iPhone|iPad|iPod|Macintosh/i.test(userAgent)) return 'apple';
  return 'google';
}

/**
 * Lien d'itinéraire vers un point, depuis la position actuelle.
 * @param {'geo' | 'apple' | 'google'} provider
 * @param {{ lat: number, lon: number }} point
 * @param {string} [label] utilisé par les liens geo: seulement
 */
export function directionsUrl(provider, point, label) {
  if (provider === 'apple') return `https://maps.apple.com/?daddr=${point.lat},${point.lon}`;
  if (provider === 'google') return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lon}`;
  return geoUrl(point, label);
}

/** Lien d'appel téléphonique (espaces et tirets retirés). */
export function telUrl(phone) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** Adresse web complète (https ajouté si absent). */
export function webUrl(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
