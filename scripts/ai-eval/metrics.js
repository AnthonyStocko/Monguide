// Mesures de l'évaluation de la relecture (docs/ai-review.md, Bloc G) : fonctions pures.
import { checkDayInvariants } from '../../supabase/functions/_shared/domain/checkDayInvariants.js';

/** Seuils d'activation proposés (Bloc G). */
export const THRESHOLDS = Object.freeze({ maxRejectedPct: 30, maxDegraded: 0, maxMedianMs: 6000 });

const placed = (day) => day.steps.filter((s) => s.place && s.type !== 'personal');

/** Variété d'une journée : nombre de catégories de lieux différentes. */
export const dayVariety = (day) => new Set(placed(day).map((s) => s.place.category)).size;

/** Variété moyenne par journée d'un séjour (1 décimale). */
export function tripVariety(trip) {
  if (!trip.days.length) return 0;
  return Math.round((trip.days.reduce((sum, d) => sum + dayVariety(d), 0) / trip.days.length) * 10) / 10;
}

/** Temps de trajet total estimé (minutes) : départs, trajets entre étapes, retours. */
export function travelMinutes(trip) {
  return trip.days.reduce((sum, d) => sum + (d.departure?.travelMin ?? 0) + d.steps.reduce((s, st) => s + (st.travelFromPreviousMin ?? 0), 0) + (d.returnTravelMin ?? 0), 0);
}

/** Nombre d'étapes par catégorie (musées, nature…) : vérification guidée des envies. */
export function categoryCounts(trip) {
  const out = {};
  for (const d of trip.days) for (const s of placed(d)) out[s.place.category] = (out[s.place.category] ?? 0) + 1;
  return out;
}

/** Indicateurs utiles pour vérifier une envie (vérification manuelle guidée). */
const WISH_HINTS = [
  { match: /mus[ée]e|museum/i, label: 'musées', value: (t) => categoryCounts(t).museum ?? 0 },
  { match: /nature/i, label: 'nature (parcs, espaces naturels, points de vue)', value: (t) => ['park', 'nature', 'viewpoint'].reduce((s, c) => s + (categoryCounts(t)[c] ?? 0), 0) },
  { match: /vin|wine/i, label: 'marchés, producteurs et cuisine régionale', value: (t) => (categoryCounts(t).market ?? 0) + (categoryCounts(t).farm ?? 0) + t.days.flatMap((d) => placed(d)).filter((s) => s.place.food?.regional).length },
  { match: /marche|walking/i, label: 'temps de trajet total (min)', value: (t) => travelMinutes(t) },
  { match: /enfant|child|kid/i, label: 'parcs et plein air', value: (t) => ['park', 'nature'].reduce((s, c) => s + (categoryCounts(t)[c] ?? 0), 0) }
];

/**
 * Indicateurs avant / après pour chaque envie reconnue.
 * @returns {{ label: string, before: number, after: number }[]}
 */
export function wishHints(wishes, before, after) {
  if (!wishes) return [];
  return WISH_HINTS.filter((h) => h.match.test(wishes)).map((h) => ({ label: h.label, before: h.value(before), after: h.value(after) }));
}

/**
 * Séjour dégradé par la relecture : variété moyenne en baisse, trajets en
 * hausse de plus de 15 % (et de plus de 5 min), ou invariants d'une journée
 * non tenus.
 * @returns {string[]} raisons (vide : non dégradé)
 */
export function degradation(before, after, rules) {
  const reasons = [];
  if (tripVariety(after) < tripVariety(before)) reasons.push('variété');
  const tb = travelMinutes(before);
  const ta = travelMinutes(after);
  if (ta > tb * 1.15 && ta - tb > 5) reasons.push('trajets');
  if (after.days.some((d) => checkDayInvariants(d, { trip: after, mode: after.mode }, rules).length)) reasons.push('invariants');
  return reasons;
}

/** Médiane (null si vide). */
export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Bilan de l'évaluation et seuils d'activation.
 * @param {{ proposed: number, rejected: number, degraded: string[], durationMs: number | null, status: string }[]} rows
 */
export function summarize(rows) {
  const attempted = rows.filter((r) => r.durationMs !== null);
  const proposed = rows.reduce((s, r) => s + r.proposed, 0);
  const rejected = rows.reduce((s, r) => s + r.rejected, 0);
  const rejectedPct = proposed ? Math.round((1000 * rejected) / proposed) / 10 : 0;
  const degraded = rows.filter((r) => r.degraded.length).length;
  const medianMs = median(attempted.map((r) => r.durationMs));
  const answered = rows.filter((r) => r.status === 'applied' || r.status === 'unchanged').length;
  return {
    trips: rows.length,
    answered,
    proposed,
    rejected,
    rejectedPct,
    degraded,
    medianMs,
    passes: {
      rejected: rejectedPct < THRESHOLDS.maxRejectedPct,
      degraded: degraded <= THRESHOLDS.maxDegraded,
      duration: medianMs !== null && medianMs < THRESHOLDS.maxMedianMs,
      answered: answered === rows.length
    }
  };
}
