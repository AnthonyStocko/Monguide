/**
 * Noms des lieux : variantes par langue (Place.names) et nom affiché dans la
 * langue de l'interface. Le nom enregistré dans le séjour ne change jamais :
 * seul l'affichage suit la langue choisie.
 */

/** Noms génériques des lieux OSM sans nom (rules.osm.unnamedTypes), par sous-catégorie. */
export const GENERIC_PLACE_NAMES = Object.freeze({
  fr: Object.freeze({ viewpoint: 'Point de vue', lavoir: 'Lavoir', ruins: 'Ruines', wayside_cross: 'Calvaire', memorial: 'Monument commémoratif' }),
  en: Object.freeze({ viewpoint: 'Viewpoint', lavoir: 'Wash house', ruins: 'Ruins', wayside_cross: 'Wayside cross', memorial: 'Memorial' })
});

/**
 * Nom générique d'une sous-catégorie, dans la langue demandée (français à défaut).
 * @param {string} type sous-catégorie ("viewpoint", "lavoir"…)
 * @param {string} lang
 * @returns {string | null}
 */
export function genericPlaceName(type, lang) {
  return GENERIC_PLACE_NAMES[lang]?.[type] ?? GENERIC_PLACE_NAMES.fr[type] ?? null;
}

/** Sous-catégorie d'un nom générique, quelle que soit sa langue. */
function genericType(name) {
  for (const names of Object.values(GENERIC_PLACE_NAMES)) {
    const type = Object.keys(names).find((key) => names[key] === name);
    if (type) return type;
  }
  return null;
}

/**
 * Variantes name:<langue> des tags OSM, pour les langues demandées et
 * seulement si elles diffèrent de name. Clés triées (sortie déterministe).
 * @param {Record<string, string>} tags
 * @param {readonly string[]} languages
 * @returns {Record<string, string> | undefined} undefined si aucune
 */
export function nameVariants(tags, languages) {
  const name = tags.name?.trim();
  const out = {};
  for (const lang of [...languages].sort()) {
    const value = tags[`name:${lang}`]?.trim();
    if (value && value !== name) out[lang] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Nom à afficher, dans cet ordre :
 *  - petit patrimoine sans nom (unnamed) : le nom générique traduit ;
 *  - names[uiLanguage] s'il existe ;
 *  - sinon name tel quel (un nom bilingue « Grand-Place - Grote Markt »
 *    reste compréhensible).
 * Fonctionne aussi pour les séjours enregistrés avant Place.names.
 * @param {Pick<import('./model.js').Place, 'name'> & Partial<Pick<import('./model.js').Place, 'names' | 'unnamed'>>} place
 * @param {string} uiLanguage
 * @returns {string}
 */
export function displayName(place, uiLanguage) {
  if (place.unnamed) {
    const type = genericType(place.name);
    return (type && genericPlaceName(type, uiLanguage)) ?? place.name;
  }
  return place.names?.[uiLanguage] ?? place.name;
}

/**
 * Nom affiché d'une étape : celui de son lieu, sinon son titre (étape
 * personnelle), sinon null (temps libre). Même règle que stepName
 * (stepTiming.js), dans la langue de l'interface.
 * @param {{ place?: import('./model.js').Place, title?: string }} step
 * @param {string} uiLanguage
 * @returns {string | null}
 */
export function stepDisplayName(step, uiLanguage) {
  return step.place ? displayName(step.place, uiLanguage) : (step.title ?? null);
}
