import { countryInfo } from '../domain/config/countries.js';
import { log } from '../log.js';
import { cachedValue } from './cachedValue.js';
import { runSource } from './sourceRunner.js';
import { articleLanguages, bindingsToPlaces, buildNotableQuery, buildSignalsQuery, labelLanguages, nameLanguages, runSparql, signalsFromBinding } from './wikidata.js';

/**
 * Notoriété des lieux, tous pays : source "notable" (lieux les plus connus
 * de Wikidata autour de la destination, toutes natures : buildNotableQuery)
 * et signaux de notoriété des lieux qui n'en ont pas encore (Mérimée,
 * Muséofile et OpenStreetMap portant un identifiant Wikidata).
 */

const localLanguages = (ctx) => countryInfo(ctx.countryCode)?.languages ?? [];

/**
 * Lieux connus autour du point (Wikidata), mis en cache 7 jours.
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {import('../providers/types.js').ProviderContext} ctx
 */
export function notablePlacesSource(point, radiusKm, ctx) {
  const { rules, lang, cache } = ctx;
  const local = localLanguages(ctx);
  const options = rules.notoriety.notableQuery;
  const query = buildNotableQuery(point, radiusKm, labelLanguages(lang, local), options, articleLanguages(lang, local), nameLanguages(lang, local));
  return runSource({
    name: 'notable',
    cacheSource: 'wikidata-notable',
    // format 2 : libellés de toutes les langues utiles, fermetures, redirections.
    params: { lat: point.lat, lon: point.lon, radius: radiusKm, lang, min: options.minSitelinks, limit: options.limit, format: 2 },
    ttlSec: rules.cacheTtlSec.wikidata,
    cache,
    query,
    fetcher: async () => bindingsToPlaces(await runSparql(query, rules.wikidata.timeoutSec), 'notable', { lang, localLanguages: local })
  });
}

/** Empreinte courte (FNV-1a 32 bits) d'une liste d'identifiants, pour la clé de cache. */
export function digest(ids) {
  let h = 0x811c9dc5;
  for (const ch of ids.join(',')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Ajoute les signaux de notoriété Wikidata (place.signals) aux lieux qui ont
 * un identifiant Wikidata mais pas encore d'articles connus ; les signaux
 * OpenStreetMap déjà présents sont gardés. Une requête groupée (POST,
 * rules.wikidata.linkBatch identifiants, délai linkTimeoutSec), mise en
 * cache 7 jours par zone et liste d'identifiants. Un échec laisse les lieux
 * sans signaux Wikidata, sans erreur.
 * @template {{ wikidata?: string, signals?: object }} P
 * @param {P[]} places
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {import('../providers/types.js').ProviderContext} ctx
 * @returns {Promise<P[]>}
 */
export async function addSignals(places, point, radiusKm, ctx) {
  const lacks = (p) => p.wikidata && p.signals?.sitelinks === undefined;
  const missing = [...new Set(places.filter(lacks).map((p) => p.wikidata))].sort();
  if (!missing.length) return places;
  const { rules, lang, cache } = ctx;
  const local = localLanguages(ctx);
  const { linkBatch, linkTimeoutSec } = rules.wikidata;
  try {
    const params = { lat: point.lat, lon: point.lon, radius: radiusKm, lang, ids: digest(missing), count: missing.length, format: 2 };
    const found = await cachedValue(cache, 'wikidata-signals', params, rules.cacheTtlSec.wikidata, async () => {
      const out = {};
      for (let i = 0; i < missing.length; i += linkBatch) {
        const rows = await runSparql(buildSignalsQuery(missing.slice(i, i + linkBatch), articleLanguages(lang, local)), linkTimeoutSec, { post: true });
        for (const b of rows) {
          const qid = b.item?.value?.split('/').pop();
          const signals = signalsFromBinding(b, { lang, localLanguages: local });
          if (qid && signals) out[qid] = signals;
        }
      }
      return out;
    });
    return places.map((p) => (lacks(p) && found[p.wikidata] ? { ...p, signals: { ...found[p.wikidata], ...p.signals } } : p));
  } catch (err) {
    log('warn', 'wikidata_signals_failed', { message: String(err?.message ?? err), count: missing.length });
    return places;
  }
}
