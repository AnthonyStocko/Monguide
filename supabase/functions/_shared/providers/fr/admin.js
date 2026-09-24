import { distanceKm, samplePointsAround } from '../../domain/geo.js';
import { ExternalError } from '../../errors.js';
import { fetchExternalJson } from '../../http.js';
import { cachedValue } from '../../services/cachedValue.js';

/** Découpage administratif français : API Géo (geo.api.gouv.fr, sans clé). */
const GEO_API = 'https://geo.api.gouv.fr';

/**
 * Commune contenant un point, ou null (en mer, hors de France).
 * @param {{ lat: number, lon: number }} point
 * @returns {Promise<{ code: string, name: string, department: string } | null>}
 */
export async function communeAt(point) {
  const params = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon), fields: 'code,nom,codeDepartement' });
  const [commune] = await fetchExternalJson(`${GEO_API}/communes?${params}`, { source: 'geo.api.gouv.fr' });
  return commune ? { code: commune.code, name: commune.nom, department: commune.codeDepartement } : null;
}

/**
 * Départements touchés par le cercle : on cherche la commune du centre et de
 * 8 points du cercle. Le centre doit répondre ; les autres points (en mer,
 * hors de France) sont ignorés.
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {import('../types.js').ProviderContext} ctx
 * @returns {Promise<string[]>} codes de département triés
 */
export function departmentsAround(point, radiusKm, ctx) {
  return cachedValue(ctx.cache, 'fr-departments', { lat: point.lat, lon: point.lon, radius: radiusKm }, ctx.rules.cacheTtlSec.admin, async () => {
    const [center, ...ring] = await Promise.allSettled(samplePointsAround(point, radiusKm).map(communeAt));
    if (center.status === 'rejected') throw center.reason;
    const codes = new Set();
    for (const r of [center, ...ring]) if (r.status === 'fulfilled' && r.value) codes.add(r.value.department);
    if (!codes.size) throw new ExternalError('geo.api.gouv.fr', null, false);
    return [...codes].sort();
  });
}

/**
 * Communes d'un département avec leur centre.
 * @param {string} department
 * @param {import('../types.js').ProviderContext} ctx
 * @returns {Promise<{ code: string, name: string, lat: number, lon: number }[]>}
 */
export function communesOfDepartment(department, ctx) {
  return cachedValue(ctx.cache, 'fr-communes', { dep: department }, ctx.rules.cacheTtlSec.admin, async () => {
    const list = await fetchExternalJson(`${GEO_API}/departements/${encodeURIComponent(department)}/communes?fields=code,nom,centre`, {
      source: 'geo.api.gouv.fr'
    });
    return list
      .filter((c) => Array.isArray(c.centre?.coordinates))
      .map((c) => ({ code: c.code, name: c.nom, lat: c.centre.coordinates[1], lon: c.centre.coordinates[0] }));
  });
}

/**
 * Commune de destination et communes voisines (centre à moins de radiusKm).
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {import('../types.js').ProviderContext} ctx
 * @returns {Promise<{ local: string | null, codes: string[] }>} codes INSEE
 */
export async function communesAround(point, radiusKm, ctx) {
  const [local, departments] = await Promise.all([
    cachedValue(ctx.cache, 'fr-commune', { lat: point.lat, lon: point.lon }, ctx.rules.cacheTtlSec.admin, () => communeAt(point)),
    departmentsAround(point, radiusKm, ctx)
  ]);
  const all = (await Promise.all(departments.map((d) => communesOfDepartment(d, ctx)))).flat();
  const codes = new Set(all.filter((c) => distanceKm(point, c) <= radiusKm).map((c) => c.code));
  if (local) codes.add(local.code);
  return { local: local?.code ?? null, codes: [...codes] };
}
