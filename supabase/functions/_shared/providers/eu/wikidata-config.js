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
  instanceOf: 'P31',
  /** partie de (ensemble : galerie d'un passage couvert, maison d'une place) */
  partOf: 'P361',
  /** architecte, style architectural, créateur : édifice ou œuvre (lieux connus) */
  architect: 'P84',
  architecturalStyle: 'P149',
  creator: 'P170',
  /** date de clôture ou fermeture ; date de dissolution, d'abolition ou de démolition ; état d'usage */
  closureDate: 'P3999',
  dissolvedDate: 'P576',
  stateOfUse: 'P5817',
  /** population (communes, quartiers : écartés des lieux connus) */
  population: 'P1082',
  /** référence Mérimée (monuments historiques, France) */
  merimeeId: 'P380',
  /** référence Muséofile (musées de France) */
  museofileId: 'P539'
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
