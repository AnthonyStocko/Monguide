/**
 * Configuration des requêtes Wikidata (patrimoine hors de France).
 * Identifiants vérifiés sur wikidata.org le 2026-09-24 (wbgetentities).
 */

/** Point d'accès SPARQL public du Wikidata Query Service. */
export const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';

/** Propriétés utilisées. */
export const P = {
  /** coordonnées géographiques */
  coordinates: 'P625',
  /** désignation patrimoniale (monument classé, bien culturel…) */
  heritageDesignation: 'P1435',
  /** nature de l'élément */
  instanceOf: 'P31'
};

/**
 * Types de musées retenus : liste FERMÉE, sans remontée des sous-classes
 * (wdt:P279*), trop coûteuse. "art gallery" (Q1007870) est exclu : il couvre
 * aussi les galeries commerciales.
 */
export const MUSEUM_TYPES = Object.freeze({
  Q33506: 'museum',
  Q207694: 'art museum',
  Q588140: 'science museum',
  Q16735822: 'history museum',
  Q17431399: 'national museum',
  Q2772772: 'military museum',
  Q3329412: 'archaeological museum',
  Q1970365: 'natural history museum',
  Q2087181: 'historic house museum',
  Q10624527: 'biographical museum',
  Q756102: 'open-air museum'
});
