import { readFileSync } from 'node:fs';
import { BASE_NAME_LANGUAGES } from '../../supabase/functions/_shared/domain/config/countries.js';

/**
 * Configuration de la génération des tuiles de lieux (docs/osm-tiles.md).
 * Pays et plafond de stockage : countries.json. Ajouter un pays = ajouter
 * une entrée à countries.json : chaque pays est traité séparément, à partir
 * de son propre extrait Geofabrik.
 */

/**
 * @typedef {object} CountryConfig
 * @property {string} code code ISO en majuscules, comme dans domain/config/countries.js
 * @property {string} geofabrik chemin de l'extrait sur download.geofabrik.de (sans "-latest.osm.pbf")
 * @property {string[]} languages langues locales gardées dans names (en plus de BASE_NAME_LANGUAGES)
 * @property {boolean} heritageFallback inclure monuments (heritage=1|2) et musées :
 *   repli du patrimoine quand Wikidata échoue ; inutile en France (Mérimée, Muséofile)
 * @property {number} minRestaurants contrôle d'un premier import : nombre minimum de restaurants
 */

const CONFIG = JSON.parse(readFileSync(new URL('./countries.json', import.meta.url), 'utf8'));

/** @type {CountryConfig[]} */
export const COUNTRIES = CONFIG.countries;

/** Plafond de l'espace occupé par le bucket après publication (octets). */
export const MAX_STORAGE_BYTES = CONFIG.maxStorageMb * 1024 * 1024;

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
  /** Baisse maximale tolérée par rapport à la version précédente du pays (total et chaque catégorie). */
  maxDropRatio: 0.2,
  /**
   * La baisse d'une catégorie n'est contrôlée qu'au-delà de ce nombre de lieux
   * dans la version précédente : une catégorie de 10 lieux qui passe à 7
   * (-30 %) n'est pas le signe d'un extrait tronqué.
   */
  minCountForDropCheck: 100,
  /** Taille maximale d'un fichier : limite par fichier du plan gratuit Supabase (vérifiée au Bloc A). */
  maxFileBytes: 50 * 1024 * 1024
};

/**
 * Langues des variantes de noms gardées dans les tuiles : BASE_NAME_LANGUAGES
 * plus les langues de tous les pays configurés, triées, sans doublon.
 * @param {readonly CountryConfig[]} countries
 * @returns {string[]}
 */
export function configuredNameLanguages(countries) {
  return [...new Set([...BASE_NAME_LANGUAGES, ...countries.flatMap((c) => c.languages ?? [])])].sort();
}

/**
 * Pays à traiter : tous pour "all" ou une valeur vide, sinon les codes
 * demandés ("BE" ou "BE,LU"), dans l'ordre de la configuration.
 * @param {string | undefined} only
 * @param {readonly CountryConfig[]} [countries]
 * @returns {CountryConfig[]}
 */
export function selectCountries(only, countries = COUNTRIES) {
  const wanted = (only ?? '').split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (!wanted.length || wanted.includes('ALL')) return [...countries];
  for (const code of wanted) countryConfig(code, countries);
  return countries.filter((c) => wanted.includes(c.code));
}

/**
 * @param {string} code
 * @param {readonly CountryConfig[]} [countries]
 */
export function countryConfig(code, countries = COUNTRIES) {
  const country = countries.find((c) => c.code === code);
  if (!country) throw new Error(`pays non configuré : ${code} (scripts/osm-tiles/countries.json)`);
  return country;
}
