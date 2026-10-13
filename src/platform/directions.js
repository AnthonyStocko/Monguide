import { directionsUrl, mapsProvider } from '../utils/navigation.js';
import { isAndroid } from './target.js';

/**
 * Lien "Itinéraire" : application de navigation du téléphone (geo:) sur
 * Android, Plans (maps.apple.com) sur iPhone, iPad et Mac, Google Maps (lien
 * web) ailleurs.
 */
const provider = isAndroid ? 'geo' : mapsProvider(globalThis.navigator?.userAgent ?? '');

/**
 * Attributs du lien <a> ; les liens web s'ouvrent hors de l'application.
 * @param {{ lat: number, lon: number }} point
 * @param {string} [label]
 * @returns {{ href: string, target?: string, rel?: string }}
 */
export function directionsLink(point, label) {
  const href = directionsUrl(provider, point, label);
  return provider === 'geo' ? { href } : { href, target: '_blank', rel: 'noreferrer' };
}
