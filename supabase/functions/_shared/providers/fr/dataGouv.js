import { ExternalError } from '../../errors.js';
import { fetchExternalJson } from '../../http.js';
import { cachedValue } from '../../services/cachedValue.js';

/**
 * Accès aux jeux de données publiés sur data.gouv.fr.
 * Les ressources sont retrouvées à partir de l'identifiant du JEU de données
 * (stable), car l'identifiant d'une ressource peut changer quand le
 * producteur remplace son fichier.
 */
const DATASETS_API = 'https://www.data.gouv.fr/api/1/datasets';
const TABULAR_API = 'https://tabular-api.data.gouv.fr/api/resources';

/** Taille de page de l'API tabulaire (maximum accepté vérifié : 200). */
const PAGE_SIZE = 200;
/** Garde-fou : nombre maximal de pages lues pour une requête. */
const MAX_PAGES = 25;
/** Durée de cache de la résolution jeu de données -> ressource. */
const RESOURCE_TTL_SEC = 86400;

/**
 * Ressource CSV principale d'un jeu de données.
 * @param {string} datasetId
 * @param {import('../types.js').ProviderContext} ctx
 * @returns {Promise<{ id: string, url: string, tabular: boolean }>}
 */
export function resolveCsvResource(datasetId, ctx) {
  return cachedValue(ctx.cache, 'datagouv-resource', { dataset: datasetId }, RESOURCE_TTL_SEC, async () => {
    const dataset = await fetchExternalJson(`${DATASETS_API}/${datasetId}/`, { source: 'data.gouv.fr' });
    const csv = (dataset.resources ?? []).find((r) => r.format === 'csv');
    if (!csv) throw new ExternalError('data.gouv.fr', null, false);
    return { id: csv.id, url: csv.url, tabular: Boolean(csv.extras?.['analysis:parsing:parsing_table']) };
  });
}

/**
 * Toutes les lignes d'une ressource tabulaire répondant aux filtres
 * (syntaxe de l'API tabulaire : colonne__exact, colonne__in, colonne__greater…).
 * La première page donne le total ; les suivantes sont lues en parallèle.
 * @param {string} resourceId
 * @param {Record<string, string>} filters
 * @param {string[]} columns colonnes à renvoyer
 * @returns {Promise<Record<string, any>[]>}
 */
export async function fetchTabularRows(resourceId, filters, columns) {
  const page = (n) => {
    const params = new URLSearchParams({ ...filters, columns: columns.join(','), page_size: String(PAGE_SIZE), page: String(n) });
    return fetchExternalJson(`${TABULAR_API}/${resourceId}/data/?${params}`, { source: 'data.gouv.fr' });
  };
  const first = await page(1);
  const total = Number(first.meta?.total ?? 0);
  const pages = Math.min(MAX_PAGES, Math.ceil(total / PAGE_SIZE));
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => page(i + 2)));
  return [first, ...rest].flatMap((p) => p.data ?? []);
}

/**
 * Lit "lat, lon" (format des jeux du ministère de la Culture).
 * @param {unknown} value
 * @returns {{ lat: number, lon: number } | null}
 */
export function parseLatLon(value) {
  if (typeof value !== 'string') return null;
  const [lat, lon] = value.split(',').map((s) => Number(s.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Met la première lettre en capitale ("musée Paul-Dini" -> "Musée Paul-Dini"). */
export function capitalize(s) {
  return s ? s.charAt(0).toLocaleUpperCase('fr') + s.slice(1) : s;
}
