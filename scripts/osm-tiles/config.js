/**
 * Configuration de la génération des tuiles de lieux (docs/osm-tiles.md).
 * Ajouter un pays = ajouter une ligne à COUNTRIES : chaque pays est traité
 * séparément, à partir de son propre extrait Geofabrik.
 */

/**
 * @typedef {object} CountryConfig
 * @property {string} code code ISO en majuscules, comme dans domain/config/countries.js
 * @property {string} geofabrik chemin de l'extrait sur download.geofabrik.de (sans "-latest.osm.pbf")
 * @property {boolean} heritageFallback inclure monuments (heritage=1|2) et musées :
 *   repli du patrimoine quand Wikidata échoue ; inutile en France (Mérimée, Muséofile)
 * @property {number} [minRestaurants] contrôle : nombre minimum absolu de restaurants
 */

/** @type {CountryConfig[]} */
export const COUNTRIES = [
  // ~89 000 restaurants nommés en France (taginfo, 2026-09-25) : en dessous de
  // 60 000, l'extrait est tronqué ou le filtre cassé.
  { code: 'FR', geofabrik: 'europe/france', heritageFallback: false, minRestaurants: 60000 }
];

export const GEOFABRIK_BASE = 'https://download.geofabrik.de';

/** User-Agent des téléchargements : identifie Mon guide auprès de Geofabrik. */
export const USER_AGENT = 'MonGuide-osm-tiles/1.0 (+https://github.com/AnthonyStocko/Monguide)';

/**
 * Filtre osmium tags-filter : les tags de l'étude des volumes (Bloc A), plus
 * musées et monuments protégés pour le repli du patrimoine (ignorés à la
 * génération des pays sans heritageFallback). Les membres des chemins et
 * relations retenus (nœuds, chemins des multipolygones) sont gardés : il en
 * faut la géométrie.
 */
export const OSMIUM_FILTERS = [
  'nwr/amenity=restaurant,marketplace,lavoir',
  'nwr/shop=farm',
  'nwr/leisure=park',
  'nwr/boundary=protected_area',
  'nwr/tourism=viewpoint,museum',
  'nwr/historic=wayside_cross,memorial,ruins',
  'nwr/man_made=lavoir',
  'nwr/heritage=1,2'
];

export const CHECKS = {
  /** Baisse maximale tolérée par rapport à la version en service (total et chaque catégorie). */
  maxDropRatio: 0.2,
  /**
   * La baisse d'une catégorie n'est contrôlée qu'au-delà de ce nombre de lieux
   * dans la version en service : une catégorie de 10 lieux qui passe à 7
   * (-30 %) n'est pas le signe d'un extrait tronqué.
   */
  minCountForDropCheck: 100,
  /** Taille maximale d'un fichier : limite par fichier du plan gratuit Supabase (vérifiée au Bloc A). */
  maxFileBytes: 50 * 1024 * 1024
};

/** Nombre de versions conservées dans le bucket (en service + précédente). */
export const KEEP_VERSIONS = 2;

/** @param {string} code */
export function countryConfig(code) {
  const country = COUNTRIES.find((c) => c.code === code);
  if (!country) throw new Error(`pays non configuré : ${code} (scripts/osm-tiles/config.js)`);
  return country;
}
