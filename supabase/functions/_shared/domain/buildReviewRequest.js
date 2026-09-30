import { ACTIVITY_TYPES } from './config/activityTypes.js';
import { displayName } from './displayName.js';
import { distanceKm } from './geo.js';
import { placeOpeningHours } from './openingHours.js';
import { isFixed, isPersonal } from './stepTiming.js';

/**
 * Résumé du séjour envoyé à l'IA de relecture (docs/ai-review.md) : compact
 * et anonymisé. Contenu :
 *  - séjour : destination (ville, pays), dates, voyageurs, mode, profil,
 *    repas et préférences ;
 *  - chaque jour : date, pluie par demi-journée, étapes (alias, type,
 *    catégorie, nom public du lieu, plage horaire, intérieur/extérieur,
 *    trajet depuis l'étape précédente) ; une étape fixe (personnelle,
 *    horaire choisi, terminée ou passée) n'a que sa plage horaire et
 *    locked: true ;
 *  - candidats (au plus rules.ai.maxCandidates) : alias, catégorie, nom,
 *    intérieur/extérieur, distance au lieu d'ancrage de chaque jour, horaires ;
 *  - « Vos envies » (texte libre), s'il existe.
 * JAMAIS : e-mail, hébergement (nom, adresse, coordonnées), titre, note ou
 * lieu d'une étape personnelle, coordonnées GPS, identifiants internes.
 *
 * Identifiants : alias courts (s1, s2… pour les étapes, c1, c2… pour les
 * candidats), plus compacts que les UUID ; ids les relie aux vrais
 * identifiants pour appliquer les opérations renvoyées.
 */

/** Longueur maximale d'un nom de lieu envoyé (un nom OSM piégé ne peut pas être long). */
const NAME_MAX = 60;
/** Longueur maximale des horaires d'ouverture résumés. */
const HOURS_MAX = 60;
/** Demi-journées de la météo : heures [début, fin[. */
const HALF_DAYS = Object.freeze({ morning: [8, 12], afternoon: [12, 18], evening: [18, 22] });

/**
 * Texte libre -> une ligne, sans caractères de contrôle, tronquée. Les noms
 * et « Vos envies » restent des DONNÉES pour le modèle (consignes du prompt).
 * @param {unknown} text
 * @param {number} max
 */
export function cleanText(text, max) {
  const one = String(text ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/** Pluie maximale (%) par demi-journée ; null si la météo du jour n'est pas connue. */
export function halfDayRain(day) {
  if (!day.weatherAvailable || !day.weather) return null;
  const out = {};
  for (const [name, [from, to]] of Object.entries(HALF_DAYS)) {
    const values = [];
    for (let h = from; h < to; h += 1) {
      const v = day.weather[String(h).padStart(2, '0')];
      if (typeof v === 'number') values.push(v);
    }
    if (values.length) out[name] = Math.round(Math.max(...values));
  }
  return Object.keys(out).length ? out : null;
}

/** Lieu d'ancrage d'un jour (distances des candidats) : hébergement de départ, sinon première étape avec un lieu, sinon destination. */
function anchorOf(trip, day) {
  const lodging = day.startLodgingId ? trip.lodgings?.find((l) => l.id === day.startLodgingId) : null;
  if (lodging) return lodging;
  const first = day.steps.find((s) => s.place && !isPersonal(s));
  return first?.place ?? trip.destination;
}

const round1 = (km) => Math.round(km * 10) / 10;

/**
 * Candidats les plus pertinents, au plus `max` : chaque type proposé
 * (config/activityTypes.js) à tour de rôle, du plus proche des lieux
 * d'ancrage au plus éloigné, pour garder de la variété.
 */
function pickCandidates(candidates, anchors, max) {
  const minKm = (p) => Math.min(...anchors.map((a) => distanceKm(a, p)));
  const queues = Object.values(ACTIVITY_TYPES)
    .filter((t) => t.categories.length)
    .map((t) => candidates.filter((p) => t.categories.includes(p.category)).sort((a, b) => minKm(a) - minKm(b)));
  const out = [];
  for (let rank = 0; out.length < max && queues.some((q) => q.length > rank); rank += 1) {
    for (const q of queues) if (q[rank] && out.length < max) out.push(q[rank]);
  }
  return out;
}

/**
 * @param {import('./model.js').Trip} trip
 * @param {{ language: string, wishes?: string }} options language : langue de l'interface (noms des lieux) ;
 *   wishes : texte « Vos envies »
 * @returns {{
 *   payload: object,
 *   text: string,
 *   ids: { steps: Record<string, string>, candidates: Record<string, string> },
 *   editableSteps: string[],
 *   candidateAliases: string[],
 *   dates: string[],
 *   stats: { chars: number, bytes: number, days: number, steps: number, candidates: number }
 * }} text : payload en JSON compact (message envoyé) ; editableSteps : alias des étapes modifiables
 */
export function buildReviewRequest(trip, { language, wishes }, rules) {
  const ids = { steps: {}, candidates: {} };
  const editableSteps = [];
  let stepCount = 0;

  const days = trip.days.map((day) => {
    const steps = day.steps.map((s) => {
      stepCount += 1;
      const alias = `s${stepCount}`;
      ids.steps[alias] = s.id;
      if (isFixed(s) || isPersonal(s)) return { id: alias, locked: true, start: s.start, end: s.end };
      editableSteps.push(alias);
      const out = { id: alias, type: s.type, start: s.start, end: s.end };
      if (s.place) {
        out.category = s.place.category;
        out.name = cleanText(displayName(s.place, language), NAME_MAX);
        out.indoor = s.place.indoor === true;
      } else out.free = true;
      if (s.travelFromPreviousMin > 0) out.travelMin = s.travelFromPreviousMin;
      return out;
    });
    const rain = halfDayRain(day);
    return { date: day.date, ...(rain ? { rainPct: rain } : {}), steps };
  });

  const anchors = trip.days.map((d) => anchorOf(trip, d));
  const candidates = pickCandidates(trip.candidates ?? [], anchors, rules.ai.maxCandidates).map((p, i) => {
    const alias = `c${i + 1}`;
    ids.candidates[alias] = p.id;
    const out = {
      id: alias,
      category: p.category,
      name: cleanText(displayName(p, language), NAME_MAX),
      indoor: p.indoor === true,
      // Distance (km) au lieu d'ancrage de chaque jour, dans l'ordre des jours.
      km: anchors.map((a) => round1(distanceKm(a, p)))
    };
    const hours = placeOpeningHours(p);
    if (hours) out.hours = cleanText(hours, HOURS_MAX);
    return out;
  });

  const payload = {
    trip: {
      city: cleanText(trip.destination.name, NAME_MAX),
      country: trip.destination.countryCode,
      start: trip.startDate,
      end: trip.endDate,
      travelers: trip.travelers,
      mode: trip.mode,
      profile: trip.profile,
      lunch: trip.lunch,
      dinner: trip.dinner ?? 'free',
      vegetarian: Boolean(trip.prefs?.vegetarian),
      wheelchair: Boolean(trip.prefs?.wheelchair)
    },
    days,
    candidates
  };
  const wish = cleanText(wishes, rules.ai.wishesMaxLength);
  if (wish) payload.wishes = wish;

  const text = JSON.stringify(payload);
  return {
    payload,
    text,
    ids,
    editableSteps,
    candidateAliases: Object.keys(ids.candidates),
    dates: trip.days.map((d) => d.date),
    stats: { chars: text.length, bytes: new TextEncoder().encode(text).length, days: days.length, steps: stepCount, candidates: candidates.length }
  };
}
