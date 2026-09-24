/**
 * Classification intérieur / extérieur d'un lieu.
 * Listes de mots (français et anglais) extensibles : comparées sans accents
 * ni casse, sur le nom et le type du lieu.
 */

/** Catégories toujours en intérieur. */
export const INDOOR_CATEGORIES = ['museum', 'restaurant'];

/** Catégories toujours en extérieur (parc, point de vue, marché de plein air, petit patrimoine…). */
export const OUTDOOR_CATEGORIES = ['park', 'nature', 'viewpoint', 'small_heritage', 'market'];

/** Mots désignant un lieu en ruine : extérieur même s'il s'agit d'un château. */
export const RUIN_WORDS = ['ruine', 'ruines', 'vestige', 'vestiges', 'ruin', 'ruins', 'remains'];

/** Mots désignant un monument visitable à l'intérieur. */
export const INDOOR_MONUMENT_WORDS = [
  'chateau', 'castle', 'palais', 'palace',
  'eglise', 'church', 'chapelle', 'chapel', 'cathedrale', 'cathedral', 'basilique', 'basilica',
  'abbaye', 'abbey', 'prieure', 'priory', 'couvent', 'convent', 'monastere', 'monastery',
  'temple', 'synagogue', 'mosquee', 'mosque',
  'hotel de ville', 'town hall', 'theatre', 'theater', 'opera',
  'halle', 'halles', 'covered market'
];

const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function containsWord(text, words) {
  return words.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(text));
}

/**
 * @param {{ category: string, name?: string, type?: string }} place type = dénomination ou valeur OSM
 * @returns {boolean | null} true intérieur, false extérieur, null inconnu (traité comme extérieur)
 */
export function classifyIndoor({ category, name, type }) {
  const text = `${normalize(name)} ${normalize(type)}`;
  if (INDOOR_CATEGORIES.includes(category)) return true;
  if (category === 'market') return containsWord(text, ['halle', 'halles', 'covered market']) ? true : false;
  if (OUTDOOR_CATEGORIES.includes(category)) return false;
  if (containsWord(text, RUIN_WORDS)) return false;
  if (category === 'monument' && containsWord(text, INDOOR_MONUMENT_WORDS)) return true;
  return null;
}
