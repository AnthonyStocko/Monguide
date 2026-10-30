import { CLOSED_STATES, GENERIC_CLASSES, GLANCE_CLASSES, NON_VISITABLE_CLASSES, NOT_A_PLACE_CLASSES, OPEN_STATES } from '../config/placeClasses.js';
import { articleCount, notorietyScore } from './notoriety.js';

/**
 * Lieux à écarter et « coups d'œil » (fonctions pures). Règles, appliquées
 * aux lieux de visite (monuments, musées, petit patrimoine, parcs, nature,
 * points de vue) :
 *  0. lieu fermé ou disparu (isClosed), tous types de lieux : écarté ;
 *     élément dont tous les articles Wikipédia sont des redirections (lieu
 *     fusionné, renommé ou disparu) : écarté ; nature qui n'est jamais un
 *     lieu de visite (NOT_A_PLACE_CLASSES : commune, quartier, gare,
 *     organisation, événement) : écarté ;
 *  1. libellé générique (isGenericLabel : « Maison traditionnelle »,
 *     « Ensemble de maisons », « Arrière maison », « Immeuble », « Jardin
 *     d'enfants n°4 », « Rue du Lombard 30-32 »…) avec moins de
 *     rules.notoriety.exclusion.minSitelinks articles Wikipédia : écarté ;
 *  2. hors musées, nature non visitable (NON_VISITABLE_CLASSES : école,
 *     crèche, bureaux, logement, commerce, gare…) : écarté, sauf notoriété
 *     d'au moins exclusion.glanceScore, où il devient un coup d'œil (façade
 *     célèbre vue en passant) ;
 *  3. hors musées, nature trop générique (GENERIC_CLASSES : bâtiment,
 *     maison, immeuble…) avec moins de minSitelinks articles : écarté ;
 *  4. hors musées, nature vue en passant (GLANCE_CLASSES : statue,
 *     fontaine, façade…) : coup d'œil (place.glance) ;
 *  5. ensembles (collapseEnsembles) : un élément et ses parties (P361)
 *     présents ensemble -> un seul, le mieux noté.
 * Les doublons à moins de rules.places.dedupDistanceM au libellé proche sont
 * fusionnés par dedupePlaces, qui garde le mieux noté.
 */

/** Catégories soumises aux règles d'exclusion. */
const HERITAGE_CATEGORIES = ['monument', 'museum', 'small_heritage', 'park', 'nature', 'viewpoint'];

const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Mots d'un libellé générique d'inventaire (français, néerlandais, anglais,
 * espagnol, catalan, allemand, italien), sans accents.
 */
const GENERIC_WORDS = new Set([
  // français
  'maison', 'maisons', 'immeuble', 'immeubles', 'batiment', 'batiments', 'edifice', 'edifices', 'ensemble', 'ensembles',
  'arriere', 'habitation', 'habitations', 'logement', 'logements', 'ecole', 'ecoles', 'creche', 'jardindenfants',
  'traditionnel', 'traditionnelle', 'traditionnels', 'traditionnelles', 'neoclassique', 'neoclassiques', 'eclectique',
  'eclectiques', 'bourgeoise', 'bourgeoises', 'mitoyenne', 'mitoyennes', 'deux', 'trois', 'quatre', 'cinq', 'six',
  // néerlandais
  'huis', 'huizen', 'woning', 'woningen', 'gebouw', 'gebouwen', 'achterhuis', 'kleuterschool', 'school', 'traditioneel',
  'traditionele', 'neoklassiek', 'neoklassieke', 'rijhuis', 'burgerhuis', 'herenhuis', 'twee', 'drie',
  // anglais
  'house', 'houses', 'building', 'buildings', 'residential', 'kindergarten', 'traditional', 'terraced',
  // espagnol, catalan, italien
  'casa', 'casas', 'case', 'edificio', 'edificios', 'edifici', 'edificis', 'habitatge', 'habitatges', 'vivienda',
  'viviendas', 'escuela', 'escola', 'immoble', 'conjunt', 'conjunto', 'palazzina',
  // allemand
  'haus', 'hauser', 'gebaude', 'wohnhaus', 'schule'
]);

/** Mots vides ignorés (articles, prépositions, abréviations de numéro). */
const FILLER_WORDS = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'et', 'a', 'au', 'aux', 'n', 'no', 'nr', 'num', 'numero', 'van', 'het', 'een', 'the', 'of', 'del', 'el', 'els', 'dels', 'y', 'i', 'der', 'die', 'das', 'di']);

/** Mots d'une adresse : avec un numéro, le libellé n'est qu'une adresse. */
const STREET_WORDS = new Set(['rue', 'avenue', 'boulevard', 'chaussee', 'straat', 'laan', 'steenweg', 'carrer', 'calle', 'via', 'strasse', 'street', 'road', 'passeig', 'paseo', 'placa', 'plaza']);

/**
 * Libellé générique d'un élément d'inventaire : uniquement des mots
 * génériques (GENERIC_WORDS), avec ou sans numéro (« Ensemble de trois
 * maisons traditionnelles », « Jardin d'enfants n°4 ») ; ou un numéro avec
 * un mot de rue ou un premier mot générique (« Rue du Lombard 30 - 32 »,
 * « Casa del Carrer Ciutat, 7 »). La commune entre parenthèses des titres
 * Mérimée est ignorée (« Immeuble (Lyon) »).
 * @param {string} name
 */
export function isGenericLabel(name) {
  const text = normalize(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/jardins? d['’ ]?enfants/g, 'jardindenfants')
    .replace(/n[°º]/g, ' n ');
  const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);
  const words = tokens.filter((t) => !/\d/.test(t) && !FILLER_WORDS.has(t));
  const hasNumber = tokens.some((t) => /\d/.test(t));
  if (!words.length) return hasNumber;
  if (words.every((w) => GENERIC_WORDS.has(w))) return true;
  return hasNumber && (GENERIC_WORDS.has(words[0]) || words.some((w) => STREET_WORDS.has(w)));
}

/**
 * Lieu fermé ou disparu : tags OSM (disused:*, abandoned:*,
 * opening_hours=closed : signals.osmClosed) ; état d'usage Wikidata fermé
 * (CLOSED_STATES) ; date de fermeture ou de dissolution (P3999, P576) passée,
 * ou inconnue, sauf si un état d'usage ouvert (OPEN_STATES) dit que le lieu
 * a rouvert. Les dates ne comptent que pour un musée (le musée a fermé), ou
 * pour un lieu sans désignation patrimoniale : la date d'un monument protégé
 * concerne son usage d'origine, l'édifice ou ses ruines se visitent encore
 * (chartreuse fermée en 1750 devenue église, prison devenue mémorial,
 * château détruit en 1637 dont les ruines sont classées, pavillon reconstruit).
 * @param {import('./notoriety.js').PlaceSignals | undefined} signals
 * @param {string} today "YYYY-MM-DD"
 * @param {{ category?: string }} [place]
 */
export function isClosed(signals, today, { category } = {}) {
  if (!signals) return false;
  if (signals.osmClosed) return true;
  const states = signals.states ?? [];
  if (states.some((s) => s in CLOSED_STATES)) return true;
  if (states.some((s) => s in OPEN_STATES)) return false;
  if (category !== 'museum' && signals.designations?.length) return false;
  return (signals.closures ?? []).some((c) => {
    const date = /^-?\d{4,}-\d{2}-\d{2}/.exec(c)?.[0];
    // Date inconnue (valeur « inconnue » de Wikidata) : le lieu a fermé, on ne sait pas quand.
    return !date || date.startsWith('-') || date.slice(0, 10) <= today;
  });
}

/**
 * Verdict d'un lieu (règles 1 à 4) : gardé, écarté, ou coup d'œil.
 * @param {{ name: string, category: string, signals?: import('./notoriety.js').PlaceSignals }} place
 * @param {number} notoriety notorietyScore du lieu
 * @param {{ today?: string }} [options] today : date du jour, "YYYY-MM-DD" (fermetures)
 * @returns {{ action: 'keep' | 'exclude' | 'glance', reason?: 'closed' | 'redirect_only' | 'not_a_place' | 'generic_label' | 'non_visitable' | 'generic_class' | 'glance_class' }}
 */
export function placeVerdict(place, notoriety, rules, { today = '9999-12-31' } = {}) {
  if (isClosed(place.signals, today, place)) return { action: 'exclude', reason: 'closed' };
  if (!HERITAGE_CATEGORIES.includes(place.category)) return { action: 'keep' };
  if ((place.signals?.sitelinks ?? 0) > 0 && articleCount(place.signals) === 0) return { action: 'exclude', reason: 'redirect_only' };
  const { minSitelinks, glanceScore } = rules.notoriety.exclusion;
  const sitelinks = articleCount(place.signals);
  const types = place.signals?.types ?? [];
  if (types.some((t) => t in NOT_A_PLACE_CLASSES)) return { action: 'exclude', reason: 'not_a_place' };
  if (isGenericLabel(place.name) && sitelinks < minSitelinks) return { action: 'exclude', reason: 'generic_label' };
  if (place.category === 'museum') return { action: 'keep' };
  if (types.some((t) => t in NON_VISITABLE_CLASSES)) {
    return notoriety >= glanceScore ? { action: 'glance', reason: 'non_visitable' } : { action: 'exclude', reason: 'non_visitable' };
  }
  if (types.some((t) => t in GENERIC_CLASSES) && sitelinks < minSitelinks) return { action: 'exclude', reason: 'generic_class' };
  if (types.some((t) => t in GLANCE_CLASSES)) return { action: 'glance', reason: 'glance_class' };
  return { action: 'keep' };
}

/** Rang de deux lieux : meilleure notoriété, puis certifié. */
const better = (a, b) => (b.notoriety ?? 0) - (a.notoriety ?? 0) || Number(b.certified) - Number(a.certified);

/**
 * Règle 5 : un élément et ses parties (signals.partOf, P361) présents
 * ensemble -> un seul, le mieux noté (notoriété, puis certifié). L'ordre
 * d'origine est conservé.
 * @template {{ id: string, category: string, wikidata?: string, notoriety?: number, certified: boolean, signals?: { partOf?: string[] } }} P
 * @param {P[]} places
 * @returns {{ places: P[], removed: P[] }}
 */
export function collapseEnsembles(places) {
  const byQid = new Map(places.filter((p) => p.wikidata).map((p) => [p.wikidata, p]));
  /** Ensemble de rattachement de chaque lieu (élément racine présent). */
  const rootOf = (p, seen = new Set()) => {
    const parent = (p.signals?.partOf ?? []).map((q) => byQid.get(q)).find((x) => x && x !== p && !seen.has(x.id));
    return parent ? rootOf(parent, seen.add(p.id)) : p;
  };
  const groups = new Map();
  for (const p of places) {
    // Un musée installé dans un ensemble reste une visite à part.
    const root = p.category === 'museum' ? p : rootOf(p);
    if (!groups.has(root.id)) groups.set(root.id, []);
    groups.get(root.id).push(p);
  }
  const keep = new Set();
  for (const members of groups.values()) keep.add([...members].sort(better)[0].id);
  return { places: places.filter((p) => keep.has(p.id)), removed: places.filter((p) => !keep.has(p.id)) };
}

/**
 * Qualité des lieux collectés : notoriété (place.notoriety, place.sitelinks
 * si connu), lieu connu (place.notable : notoriété d'au moins
 * rules.notoriety.notableScore), coups d'œil (place.glance), lieux écartés
 * et ensembles réduits ; les signaux bruts (place.signals) sont retirés.
 * @template {{ id: string, name: string, category: string, certified: boolean, wikidata?: string, signals?: import('./notoriety.js').PlaceSignals }} P
 * @param {P[]} places
 * @param {{ today: string }} options today : date du jour, "YYYY-MM-DD" (lieux fermés)
 * @returns {{ places: P[], excluded: { id: string, name: string, reason: string }[] }}
 */
export function applyPlaceQuality(places, rules, { today }) {
  const excluded = [];
  const scored = [];
  for (const place of places) {
    const notoriety = notorietyScore(place.signals, rules);
    const verdict = placeVerdict(place, notoriety, rules, { today });
    if (verdict.action === 'exclude') {
      excluded.push({ id: place.id, name: place.name, reason: verdict.reason });
      continue;
    }
    const out = { ...place, notoriety };
    if (typeof place.signals?.sitelinks === 'number') out.sitelinks = articleCount(place.signals);
    if (notoriety >= rules.notoriety.notableScore) out.notable = true;
    if (verdict.action === 'glance') out.glance = true;
    scored.push(out);
  }
  const { places: kept, removed } = collapseEnsembles(scored);
  for (const p of removed) excluded.push({ id: p.id, name: p.name, reason: 'ensemble' });
  return { places: kept.map(({ signals: _signals, ...p }) => /** @type {any} */ (p)), excluded };
}
