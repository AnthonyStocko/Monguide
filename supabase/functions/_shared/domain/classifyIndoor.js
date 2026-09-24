/**
 * Classification intérieur / extérieur d'un lieu.
 * Listes de mots extensibles (français, anglais et principales langues des
 * pays pris en charge, pour les noms Wikidata en langue locale) : comparées
 * sans accents ni casse, sur le nom et le type du lieu.
 */

/** Catégories toujours en intérieur (sauf musée de plein air). */
export const INDOOR_CATEGORIES = ['museum', 'restaurant'];

/** Catégories toujours en extérieur (parc, point de vue, marché de plein air, petit patrimoine…). */
export const OUTDOOR_CATEGORIES = ['park', 'nature', 'viewpoint', 'small_heritage', 'market'];

/** Musées en plein air (écomusées de village, parcs archéologiques…). */
export const OPEN_AIR_WORDS = ['plein air', 'open-air', 'open air', 'freilichtmuseum', 'skansen', 'aire libre'];

/** Mots désignant un lieu en ruine : extérieur même s'il s'agit d'un château. */
export const RUIN_WORDS = [
  'ruine', 'ruines', 'vestige', 'vestiges', 'ruin', 'ruins', 'remains',
  'ruina', 'ruinas', 'rovine', 'rudere', 'ruderi', 'ruiny', 'ruinen', 'ruinas'
];

/** Mots désignant un monument visitable à l'intérieur. */
export const INDOOR_MONUMENT_WORDS = [
  // français, anglais
  'chateau', 'castle', 'palais', 'palace',
  'eglise', 'church', 'chapelle', 'chapel', 'cathedrale', 'cathedral', 'basilique', 'basilica',
  'abbaye', 'abbey', 'prieure', 'priory', 'couvent', 'convent', 'monastere', 'monastery',
  'temple', 'synagogue', 'mosquee', 'mosque',
  'hotel de ville', 'town hall', 'theatre', 'theater', 'opera',
  'halle', 'halles', 'covered market',
  // espagnol, catalan, portugais
  'iglesia', 'esglesia', 'igreja', 'catedral', 'basilica', 'capilla', 'capella', 'capela',
  'castillo', 'castell', 'castelo', 'palacio', 'palau', 'monasterio', 'monestir', 'mosteiro', 'convento',
  // italien
  'chiesa', 'cattedrale', 'duomo', 'cappella', 'castello', 'palazzo', 'monastero', 'abbazia',
  // allemand, néerlandais
  'kirche', 'dom', 'munster', 'kapelle', 'schloss', 'burg', 'kloster', 'rathaus',
  'kerk', 'kasteel', 'paleis', 'klooster', 'stadhuis',
  // polonais, tchèque
  'kosciol', 'katedra', 'kaplica', 'zamek', 'palac', 'klasztor', 'kostel', 'hrad'
];

const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .toLowerCase();

function containsWord(text, words) {
  return words.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(text));
}

/**
 * @param {{ category: string, name?: string, type?: string }} place type = dénomination, valeur OSM ou type Wikidata
 * @returns {boolean | null} true intérieur, false extérieur, null inconnu (traité comme extérieur)
 */
export function classifyIndoor({ category, name, type }) {
  const text = `${normalize(name)} ${normalize(type)}`;
  if (category === 'museum') return !containsWord(text, OPEN_AIR_WORDS);
  if (INDOOR_CATEGORIES.includes(category)) return true;
  if (category === 'market') return containsWord(text, ['halle', 'halles', 'covered market']);
  if (OUTDOOR_CATEGORIES.includes(category)) return false;
  if (containsWord(text, RUIN_WORDS)) return false;
  if (category === 'monument' && containsWord(text, INDOOR_MONUMENT_WORDS)) return true;
  return null;
}
