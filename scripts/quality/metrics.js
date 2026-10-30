import { displayName } from '../../supabase/functions/_shared/domain/displayName.js';
import { isGenericLabel } from '../../supabase/functions/_shared/domain/scoring/exclusions.js';
import { sunTimes } from '../../supabase/functions/_shared/domain/sun.js';
import { toMinutes } from '../../supabase/functions/_shared/domain/time.js';

/**
 * Mesures de qualité d'un séjour généré (Prompt 10.0, Phase E), communes au
 * rapport avant / après (compare.js) et au test des séjours de référence
 * (reference.test.js) :
 *  - incontournables présents (identifiants Wikidata attendus) ;
 *  - étapes au libellé générique (isGenericLabel) ;
 *  - libellés dans une langue non voulue : ni français ni anglais alors
 *    qu'une version française ou anglaise existe ;
 *  - temps morts par jour : écarts sans étape ni trajet (le plus long, et le
 *    total des écarts de plus de 30 min) ;
 *  - repas manquants : jour sans déjeuner, ou sans dîner au restaurant ;
 *  - visites en extérieur qui finissent après la tombée de la nuit (coucher
 *    du soleil − 30 min, sun.js) ;
 *  - réserve (trip.candidates, proposée pour remplacer ou ajouter une étape) :
 *    lieux au libellé générique ou dans une langue non voulue.
 */

/** Écart compté comme temps mort dans le total (minutes, comme le rapport du Bloc 0). */
export const DEAD_TIME_MIN = 30;
/** Marge avant le coucher du soleil des visites en extérieur. */
const BEFORE_SUNSET_MIN = 30;

const LANG = 'fr';
const isOutdoor = (place) => place.indoor !== true && !['museum', 'restaurant'].includes(place.category) && !place.nightSight;

/**
 * Libellé affiché dans une langue non voulue ? Avec les libellés Wikidata de
 * l'élément (labels, si connus) ou les variantes du lieu (place.names).
 * @param {object} place
 * @param {string} shown libellé affiché (displayName)
 * @param {Record<string, string>} [labels] libellés Wikidata par langue
 */
export function unwantedLabel(place, shown, labels = {}) {
  const wanted = [labels.fr, labels.en, place.names?.fr, place.names?.en].filter(Boolean);
  if (!wanted.length || wanted.includes(shown)) return false;
  const others = [...Object.entries(labels), ...Object.entries(place.names ?? {})].filter(([l]) => l !== 'fr' && l !== 'en').map(([, v]) => v);
  return others.includes(shown) || (place.nameLang !== undefined && !['fr', 'en'].includes(place.nameLang));
}

/**
 * @param {{ days: object[], destination: { lat: number, lon: number }, timezone: string, dinner?: string }} trip
 * @param {{ mustSee?: string[], labelsOf?: (place: object) => Record<string, string> | undefined }} [options]
 *   mustSee : identifiants Wikidata attendus ; labelsOf : libellés Wikidata d'un lieu
 */
export function tripMetrics(trip, { mustSee = [], labelsOf = () => undefined } = {}) {
  const steps = trip.days.flatMap((d) => d.steps);
  const qids = new Set(steps.map((s) => s.place?.wikidata ?? (s.place?.id?.startsWith('wikidata:') ? s.place.id.slice(9) : null)).filter(Boolean));
  const shownOf = (s) => displayName(s.place, LANG);
  const days = trip.days.map((day) => {
    const sunset = sunTimes(day.date, trip.destination, trip.timezone).sunset;
    const limit = sunset ? toMinutes(sunset) - BEFORE_SUNSET_MIN : 24 * 60;
    // « Temps libre » sans lieu (aucun lieu trouvé) : compté comme un trou ; le temps libre voulu (avec un lieu) et la soirée libre, non.
    const kept = day.steps.filter((s) => s.place || s.type === 'dinner' || !s.badges?.includes('free_time'));
    const gaps = kept.slice(1).map((s, i) => toMinutes(s.start) - (s.travelFromPreviousMin ?? 0) - toMinutes(kept[i].end));
    const visits = day.steps.filter((s) => s.place && !['lunch', 'dinner'].includes(s.type));
    return {
      date: day.date,
      sunset,
      lunch: day.steps.some((s) => s.type === 'lunch' && s.place),
      dinner: day.steps.some((s) => s.type === 'dinner' && s.place),
      maxGapMin: Math.max(0, ...gaps),
      deadMin: gaps.filter((g) => g > DEAD_TIME_MIN).reduce((a, b) => a + b, 0),
      visits: visits.length,
      outdoorAfterDark: visits.filter((s) => isOutdoor(s.place) && toMinutes(s.end) > limit).map((s) => `${shownOf(s)} ${s.start}-${s.end}`)
    };
  });
  const placed = steps.filter((s) => s.place && s.type !== 'personal');
  const reserve = (trip.candidates ?? []).filter((p) => p.category !== 'restaurant');
  return {
    mustSee: mustSee.filter((q) => qids.has(q)),
    genericLabels: placed.filter((s) => isGenericLabel(shownOf(s))).map(shownOf),
    unwantedLanguage: placed.filter((s) => unwantedLabel(s.place, shownOf(s), labelsOf(s.place))).map(shownOf),
    reserveGeneric: reserve.filter((p) => isGenericLabel(displayName(p, LANG))).map((p) => displayName(p, LANG)),
    reserveUnwanted: reserve.filter((p) => unwantedLabel(p, displayName(p, LANG), labelsOf(p))).map((p) => displayName(p, LANG)),
    missingMeals: days.filter((d) => !d.lunch).length + (trip.dinner === 'restaurant' ? days.filter((d) => !d.dinner).length : 0),
    days
  };
}
