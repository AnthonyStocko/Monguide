import { cacheKey } from '../cacheKey.js';
import { log } from '../log.js';
import { fetchFileImages, fetchMainFiles, findCityQid } from './commons.js';

/**
 * Cœur de la fonction images (docs/api.md) : cache partagé par identifiant et
 * par largeur, y compris les "pas d'image" (valeur { image: null } : la
 * colonne value d'api_cache n'accepte pas null), puis Wikidata et Commons
 * pour les identifiants manquants, en requêtes groupées. Une panne de
 * Wikimedia n'est jamais une erreur : les identifiants non vérifiés sont
 * omis (ou servis depuis une copie expirée du cache).
 *
 * @param {{ qids: string[], width: number, destination?: { name: string, countryCode: string, lat: number, lon: number } }} request
 * @param {{
 *   cache: { lookupMany: (keys: string[]) => Promise<Map<string, { value: any, fresh: boolean }>>, setMany: (entries: { key: string, value: unknown }[], source: string, ttlSec: number) => Promise<void> },
 *   rules: any,
 *   fetchJson?: Function
 * }} ctx
 * @returns {Promise<{ images: Record<string, import('../domain/model.js').PlaceImage | null>, destination?: { wikidata: string | null } }>}
 */
export async function lookupImages({ qids, width, destination }, { cache, rules, fetchJson }) {
  const ttlSec = rules.cacheTtlSec.images;
  const options = { timeoutMs: rules.images.timeoutMs, ...(fetchJson ? { fetchJson } : {}) };
  const result = { images: {} };

  const wanted = [...qids];
  if (destination) {
    const city = await resolveCity(destination, { cache, ttlSec, maxDistanceKm: rules.images.cityMaxDistanceKm, options });
    if (city !== undefined) {
      result.destination = { wikidata: city };
      if (city && !wanted.includes(city)) wanted.push(city);
    }
  }
  if (!wanted.length) return result;

  const keyOf = (qid) => cacheKey('images', { qid, width });
  const entries = await cache.lookupMany(wanted.map(keyOf));
  const missing = [];
  for (const qid of wanted) {
    const entry = entries.get(keyOf(qid));
    if (entry?.fresh) result.images[qid] = entry.value.image ?? null;
    else missing.push(qid);
  }
  if (!missing.length) return result;

  try {
    const files = await fetchMainFiles(missing, options);
    const names = Object.values(files).filter(Boolean);
    const byFile = names.length ? await fetchFileImages(names, width, options) : {};
    const fresh = missing.map((qid) => ({ qid, image: files[qid] ? (byFile[files[qid]] ?? null) : null }));
    for (const { qid, image } of fresh) result.images[qid] = image;
    await cache.setMany(fresh.map(({ qid, image }) => ({ key: keyOf(qid), value: { image } })), 'images', ttlSec).catch(() => {});
  } catch (err) {
    log('warn', 'images_unavailable', { message: String(err?.message ?? err), missing: missing.length });
    // Copie expirée plutôt que rien ; sinon identifiant omis (redemandé plus tard).
    for (const qid of missing) {
      const stale = entries.get(keyOf(qid));
      if (stale) result.images[qid] = stale.value.image ?? null;
    }
  }
  return result;
}

/**
 * Identifiant Wikidata de la ville (mis en cache, y compris "introuvable").
 * @returns {Promise<string | null | undefined>} undefined si Wikidata est indisponible
 */
async function resolveCity(destination, { cache, ttlSec, maxDistanceKm, options }) {
  const key = cacheKey('images-city', {
    name: destination.name,
    countryCode: destination.countryCode,
    lat: destination.lat,
    lon: destination.lon
  });
  const entry = (await cache.lookupMany([key])).get(key);
  if (entry?.fresh) return entry.value.qid ?? null;
  try {
    const qid = await findCityQid(destination, { maxDistanceKm, ...options });
    await cache.setMany([{ key, value: { qid } }], 'images-city', ttlSec).catch(() => {});
    return qid;
  } catch (err) {
    log('warn', 'images_city_unavailable', { message: String(err?.message ?? err) });
    return entry ? (entry.value.qid ?? null) : undefined;
  }
}
