import { TOP_DESIGNATIONS } from '../config/placeClasses.js';

/**
 * Notoriété d'un lieu : score 0-100 (fonction pure), et seuil adaptatif des
 * visites d'une destination. Pondérations : rules.notoriety.
 */

/**
 * @typedef {object} PlaceSignals Signaux bruts d'un lieu, rassemblés à la
 * collecte (services/wikidata.js, osmMapping.js) et retirés du lieu une fois
 * la notoriété calculée (scoring/exclusions.js, applyPlaceQuality).
 * @property {number} [sitelinks] articles Wikipédia de l'élément Wikidata (toutes langues)
 * @property {number} [redirects] parmi eux, liens vers une redirection (REDIRECT_BADGES), non comptés
 * @property {string[]} [closures] dates de fermeture ou de dissolution (P3999, P576) : "YYYY-MM-DD…", ou une
 *   autre valeur pour une date inconnue
 * @property {string[]} [states] états d'usage (P5817)
 * @property {boolean} [osmClosed] tags OSM disused:*, abandoned:* ou opening_hours=closed
 * @property {boolean} [langArticle] article Wikipédia dans la langue de l'interface
 * @property {boolean} [localArticle] article Wikipédia dans une langue du pays
 * @property {string[]} [types] natures Wikidata (P31)
 * @property {string[]} [designations] désignations patrimoniales Wikidata (P1435)
 * @property {string[]} [partOf] ensembles Wikidata dont le lieu fait partie (P361)
 * @property {boolean} [osmAttraction] tag OSM tourism=attraction ou tourism=museum
 * @property {boolean} [osmHeritage] tag OSM heritage=* avec un tag wikidata
 */

/**
 * Score de notoriété 0-100 :
 *  - signal principal : articles Wikipédia (sans les liens vers une
 *    redirection), log(1 + n) / log(1 + sitelinksFull), plein au-delà de
 *    sitelinksFull ;
 *  - signaux secondaires : article dans la langue de l'interface, dans une
 *    langue du pays, tags OSM tourism=attraction|museum et heritage avec
 *    wikidata, désignation de premier rang (TOP_DESIGNATIONS) : patrimoine
 *    mondial, liste indicative, ou classement national de premier rang.
 * @param {PlaceSignals | undefined} signals
 * @returns {number} arrondi à l'unité
 */
export function notorietyScore(signals, rules) {
  if (!signals) return 0;
  const { weights: w, sitelinksFull } = rules.notoriety;
  const n = articleCount(signals);
  let score = w.sitelinks * Math.min(1, Math.log1p(n) / Math.log1p(sitelinksFull));
  if (signals.langArticle) score += w.langArticle;
  if (signals.localArticle) score += w.localArticle;
  if (signals.osmAttraction) score += w.osmAttraction;
  if (signals.osmHeritage) score += w.osmHeritage;
  const ranks = new Set((signals.designations ?? []).map((q) => TOP_DESIGNATIONS[q]).filter(Boolean));
  if (ranks.has('world_heritage')) score += w.worldHeritage;
  else if (ranks.has('top')) score += w.topDesignation;
  else if (ranks.has('tentative')) score += w.tentativeHeritage;
  return Math.round(Math.min(100, score));
}

/** Articles Wikipédia qui décrivent vraiment le lieu (liens vers une redirection exclus). */
export function articleCount(signals) {
  return Math.max(0, (signals?.sitelinks ?? 0) - (signals?.redirects ?? 0));
}

/**
 * Percentile (0-100) d'une liste de nombres, par interpolation linéaire ; 0 si vide.
 * @param {number[]} values
 * @param {number} p
 */
export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

/**
 * Seuil adaptatif des visites d'une destination : le percentile
 * rules.notoriety.threshold.percentile des scores locaux, au moins minScore
 * (minimum absolu). S'il reste moins de minVisits lieux au-dessus (petite
 * ville), le seuil descend au score du minVisits-ième lieu, pour qu'il
 * reste assez de visites.
 * @param {number[]} scores notoriété des visites candidates (musées, monuments)
 * @param {number} minVisits visites à garder au moins (jours × minVisitsPerDay)
 * @returns {{ threshold: number, base: number, lowered: boolean }} base : seuil avant abaissement
 */
export function notorietyThreshold(scores, minVisits, rules) {
  const { percentile: p, minScore } = rules.notoriety.threshold;
  const base = Math.max(percentile(scores, p), minScore);
  const above = scores.filter((s) => s >= base).length;
  if (above >= minVisits || !scores.length) return { threshold: base, base, lowered: false };
  const sorted = [...scores].sort((a, b) => b - a);
  return { threshold: sorted[Math.min(minVisits, sorted.length) - 1], base, lowered: true };
}
