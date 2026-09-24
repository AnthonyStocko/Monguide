import { classifyIndoor } from '../../domain/classifyIndoor.js';
import { distanceKm } from '../../domain/geo.js';
import { cachedValue } from '../../services/cachedValue.js';
import { runSource } from '../../services/sourceRunner.js';
import { departmentsAround } from './admin.js';
import { capitalize, fetchTabularRows, parseLatLon, resolveCsvResource } from './dataGouv.js';

/**
 * Patrimoine certifié français, publié par le ministère de la Culture sur
 * data.gouv.fr (l'ancienne plateforme Opendatasoft data.culture.gouv.fr
 * redirige désormais vers culture.data.gouv.fr et n'offre plus l'API
 * explore v2.1 ni within_distance). L'API tabulaire ne filtre pas par
 * distance : on charge les lignes par département (Mérimée) ou en totalité
 * (Muséofile, ~1 200 musées), on les met en cache, puis on filtre par
 * distance au centre.
 */

/** Immeubles protégés au titre des Monuments historiques (base Mérimée). */
export const MERIMEE_DATASET = '5af120e5b595087cfabcde81';
/** Répertoire des Musées de France (base Muséofile). */
export const MUSEOFILE_DATASET = '5d12ee8206e3e762c0c89a4c';

const MERIMEE_COLUMNS = [
  'Reference',
  'Titre_editorial_de_la_notice',
  'Denomination_de_l_edifice',
  'coordonnees_au_format_WGS84',
  'Commune_forme_editoriale',
  'Siecle_de_la_campagne_principale_de_construction'
];
const MUSEOFILE_COLUMNS = ['Identifiant', 'Nom_officiel', 'Coordonnees', 'URL', 'Domaine_thematique'];

/**
 * Monument Mérimée -> Place ; null sans coordonnées. Les titres étant souvent
 * génériques ("Église", "Château (ancien)"), la commune est ajoutée au nom
 * quand il ne la contient pas déjà.
 * @param {Record<string, any>} row
 * @returns {import('../../domain/model.js').Place | null}
 */
export function merimeeToPlace(row) {
  const pos = parseLatLon(row.coordonnees_au_format_WGS84);
  const denomination = row.Denomination_de_l_edifice ?? '';
  const title = (row.Titre_editorial_de_la_notice ?? '').trim() || capitalize(denomination.split(';')[0].trim());
  if (!pos || !row.Reference || !title) return null;
  const commune = (row.Commune_forme_editoriale ?? '').trim();
  const name = commune && !title.includes(commune) ? `${title} (${commune})` : title;
  const place = {
    id: `merimee:${row.Reference}`,
    name,
    category: 'monument',
    lat: pos.lat,
    lon: pos.lon,
    source: 'monuments',
    certified: true,
    certification: 'monument_historique',
    indoor: classifyIndoor({ category: 'monument', name, type: denomination }),
    url: `https://pop.culture.gouv.fr/notice/merimee/${row.Reference}`
  };
  const century = row.Siecle_de_la_campagne_principale_de_construction;
  return century ? { ...place, description: century } : place;
}

/**
 * Musée de France (Muséofile) -> Place ; null sans coordonnées.
 * @param {Record<string, any>} row
 * @returns {import('../../domain/model.js').Place | null}
 */
export function museofileToPlace(row) {
  const pos = parseLatLon(row.Coordonnees);
  const name = capitalize((row.Nom_officiel ?? '').trim());
  if (!pos || !row.Identifiant || !name) return null;
  const place = {
    id: `musee:${row.Identifiant}`,
    name,
    category: 'museum',
    lat: pos.lat,
    lon: pos.lon,
    source: 'museums',
    certified: true,
    certification: 'musee_de_france',
    indoor: true
  };
  if (row.URL) place.url = /^https?:\/\//i.test(row.URL) ? row.URL : `https://${row.URL}`;
  if (row.Domaine_thematique) place.description = row.Domaine_thematique.split(';').join(', ');
  return place;
}

const within = (point, radiusKm) => (p) => p && distanceKm(point, p) <= radiusKm;

/**
 * @param {import('../types.js').Point} point
 * @param {number} radiusKm
 * @param {import('../types.js').ProviderContext} ctx
 */
export function heritage(point, radiusKm, ctx) {
  const ttlSec = ctx.rules.cacheTtlSec.heritage;
  const params = { lat: point.lat, lon: point.lon, radius: radiusKm };

  const monuments = runSource({
    name: 'monuments',
    cacheSource: 'monuments',
    params,
    ttlSec,
    cache: ctx.cache,
    fetcher: async () => {
      const [departments, resource] = await Promise.all([departmentsAround(point, radiusKm, ctx), resolveCsvResource(MERIMEE_DATASET, ctx)]);
      const rows = await Promise.all(
        departments.map((dep) =>
          cachedValue(ctx.cache, 'merimee', { dep }, ttlSec, () =>
            fetchTabularRows(resource.id, { Departement_format_numerique__exact: dep }, MERIMEE_COLUMNS)
          )
        )
      );
      return rows.flat().map(merimeeToPlace).filter(within(point, radiusKm));
    }
  });

  const museums = runSource({
    name: 'museums',
    cacheSource: 'museums',
    params,
    ttlSec,
    cache: ctx.cache,
    fetcher: async () => {
      const resource = await resolveCsvResource(MUSEOFILE_DATASET, ctx);
      const rows = await cachedValue(ctx.cache, 'museofile', {}, ttlSec, () => fetchTabularRows(resource.id, {}, MUSEOFILE_COLUMNS));
      return rows.map(museofileToPlace).filter(within(point, radiusKm));
    }
  });

  return Promise.all([monuments, museums]);
}
