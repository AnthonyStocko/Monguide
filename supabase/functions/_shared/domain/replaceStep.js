import { fitsSlot, isMarket } from './activity.js';
import { recomputeTravel } from './dayEdits.js';
import { distanceKm } from './geo.js';

/**
 * Remplacement d'une étape par un autre lieu, sans réseau à partir de la
 * réserve trip.candidates (ou de lieux supplémentaires fournis par le
 * serveur, bouton "Plus de choix").
 */

/** Identifiants des lieux déjà utilisés dans le séjour. */
export function usedPlaceIds(trip) {
  return new Set(trip.days.flatMap((d) => d.steps.filter((s) => s.place).map((s) => s.place.id)));
}

/** Le lieu convient-il à ce type d'étape ? */
function fitsStep(place, step) {
  if (step.type === 'lunch') return place.category === 'restaurant' || isMarket(place);
  return fitsSlot(place, step.type);
}

/**
 * Meilleures alternatives pour une étape : lieux non utilisés convenant au
 * créneau, les plus proches des étapes voisines d'abord. Pour la pause
 * déjeuner en mode "Les deux", l'autre type (restaurant ou marché) est
 * toujours proposé en premier.
 * @param {import('./model.js').Trip} trip
 * @param {number} dayIndex
 * @param {number} stepIndex
 * @param {{ limit?: number, extraPlaces?: object[] }} [options]
 * @returns {object[]}
 */
export function alternativesFor(trip, dayIndex, stepIndex, { limit = 3, extraPlaces = [] } = {}) {
  const day = trip.days[dayIndex];
  const step = day.steps[stepIndex];
  const used = usedPlaceIds(trip);
  const neighbours = [day.steps[stepIndex - 1]?.place, step.place, day.steps[stepIndex + 1]?.place].filter(Boolean);
  const closeness = (p) => (neighbours.length ? neighbours.reduce((sum, n) => sum + distanceKm(n, p), 0) / neighbours.length : 0);
  const seen = new Set();
  const pool = [...trip.candidates, ...extraPlaces].filter((p) => {
    if (seen.has(p.id) || used.has(p.id) || !fitsStep(p, step)) return false;
    seen.add(p.id);
    return true;
  });
  const otherTypeFirst = step.type === 'lunch' && trip.lunch === 'both' && step.place;
  const isOtherType = (p) => (step.place.category === 'restaurant' ? isMarket(p) : p.category === 'restaurant');
  return pool
    .sort((a, b) => (otherTypeFirst ? Number(isOtherType(b)) - Number(isOtherType(a)) : 0) || closeness(a) - closeness(b))
    .slice(0, limit);
}

/**
 * Remplace le lieu d'une étape : l'ancien lieu retourne dans la réserve, le
 * nouveau en sort ; trajets de la journée recalculés.
 * @returns {import('./model.js').Trip} nouveau séjour
 */
export function replaceStepPlace(trip, dayIndex, stepIndex, place, rules) {
  const old = trip.days[dayIndex].steps[stepIndex].place;
  const days = trip.days.map((d, i) => {
    if (i !== dayIndex) return d;
    const steps = d.steps.map((s, j) =>
      // Nouveau lieu : les badges de l'ancien (météo, horaires…) ne s'appliquent plus.
      j === stepIndex ? { ...s, place, indoor: place.indoor, badges: [] } : s
    );
    return recomputeTravel({ ...d, steps }, trip, rules);
  });
  const candidates = [...trip.candidates.filter((c) => c.id !== place.id), ...(old ? [old] : [])].slice(0, rules.places.maxCandidates);
  return { ...trip, days, candidates };
}
