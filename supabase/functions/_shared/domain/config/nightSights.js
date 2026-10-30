/**
 * Lieux à voir de nuit (Place.nightSight) : proposés après la tombée de la
 * nuit (generateTrip.js), avec les lieux couverts (musées, passages
 * couverts). Listes à compléter librement. Identifiants vérifiés sur
 * wikidata.org le 2026-10-30.
 */

/** Lieux illuminés ou couverts connus, par identifiant Wikidata. */
export const NIGHT_SIGHT_QIDS = Object.freeze({
  Q215429: 'Grand-Place (Bruxelles) : façades illuminées',
  Q1491935: 'Galeries royales Saint-Hubert (Bruxelles) : passage couvert'
});

/** Natures Wikidata de lieux à voir de nuit. */
export const NIGHT_SIGHT_CLASSES = Object.freeze({
  Q57607: 'marché de Noël'
});

/** Noms de marchés de Noël (sans accents, minuscules) : seulement pendant la saison des fêtes. */
export const CHRISTMAS_NAMES =
  /(marche de noel|marche de l'avent|marches de noel|kerstmarkt|christmas market|weihnachtsmarkt|christkindlmarkt|mercat de nadal|mercadillo de navidad|mercatino di natale|plaisirs d'hiver|winterpret)/;

/** Noms de lieux illuminés (sans accents, minuscules), toute l'année. */
export const ILLUMINATION_NAMES = /(illumination|fete des lumieres|son et lumiere)/;

/** Saison des marchés de Noël ("MM-DD", bornes comprises, à cheval sur deux années). */
export const CHRISTMAS_SEASON = Object.freeze({ from: '11-15', to: '01-06' });
