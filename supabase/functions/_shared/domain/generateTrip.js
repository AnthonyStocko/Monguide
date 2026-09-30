import { allowedByProfile, fitsSlot, isMarket } from './activity.js';
import { eachDate } from './dates.js';
import { dedupePlaces } from './dedupePlaces.js';
import { distanceKm } from './geo.js';
import { ACTIVITY_TYPE_IDS, ACTIVITY_TYPES } from './config/activityTypes.js';
import { dinnerTimeFor } from './config/countries.js';
import { dinnerWindow, evaluateRestaurant, lunchKindForDay, pickRestaurant } from './pickRestaurant.js';
import { scheduleDay } from './scheduleDay.js';
import { detourKm, scorePlace } from './scorePlace.js';
import { effectiveRadiusKm, travelMinutes } from './travel.js';
import { includesRestaurants } from './tripDraft.js';
import { arbitrateWeather, dayWeather } from './weatherArbitration.js';
import { computeCarbon, computeFuelCost } from './carbon.js';

/**
 * Moteur de génération d'un séjour (fonction pure, exécutée par la fonction
 * serveur generate). Construit chaque journée à partir du gabarit
 * (rules.dayTemplate) : départ, visite culturelle, pause gourmande, plein
 * air, détente, dîner (heure du pays : dinnerTimeFor), puis retour à
 * l'hébergement. Aucun lieu n'est répété ; un créneau sans candidat devient
 * un "temps libre" (badge free_time) plutôt qu'un lieu inventé. Dîner
 * "libre" : créneau sans lieu ni badge ("Soirée libre") ; trip.dinner absent
 * (demande d'une application antérieure) : aucun dîner.
 */

/** Hébergement d'une nuit, ou null. */
function lodgingForNight(lodgings, date) {
  return lodgings.find((l) => l.nights.includes(date)) ?? null;
}

/**
 * Hébergements de départ et d'arrivée d'un jour : départ = nuit précédente
 * (1er jour : première nuit) ; arrivée = nuit du jour (dernier jour : dernière nuit).
 */
export function dayLodgings(lodgings, dates, i) {
  if (!lodgings.length) return { start: null, end: null };
  const night = (d) => (d ? lodgingForNight(lodgings, d) : null);
  const start = night(dates[i - 1]) ?? night(dates[i]);
  const end = night(dates[i]) ?? night(dates[i - 1]);
  return { start, end };
}

/**
 * Restaurants ouverts le soir (plage du dîner) d'au moins un jour du séjour,
 * compatibles avec les préférences : horaires confirmés d'abord, puis
 * horaires inconnus (acceptés comme pour le choix du dîner) ; meilleur score
 * de base d'abord.
 * @param {import('./model.js').Place[]} restaurants
 * @param {{ dates: string[], countryCode: string, window: { start: string, end: string }, prefs: { vegetarian: boolean, wheelchair: boolean } }} ctx
 * @returns {import('./model.js').Place[]}
 */
export function eveningRestaurants(restaurants, { dates, countryCode, window, prefs }, rules) {
  const out = [];
  for (const place of restaurants) {
    const verdicts = dates.map((date) => evaluateRestaurant(place, { date, countryCode, prefs, meal: 'dinner', window }, rules)).filter(Boolean);
    if (!verdicts.length) continue;
    const best = verdicts.find((v) => v.hours === 'open') ?? verdicts[0];
    out.push({ place, known: best.hours === 'open', score: best.score });
  }
  return out.sort((a, b) => Number(b.known) - Number(a.known) || b.score - a.score).map((o) => o.place);
}

/**
 * Réserve de lieux non utilisés (Trip.candidates), au plus
 * rules.places.maxCandidates, classés par score. Y sont gardés en priorité :
 *  - pour chaque type proposé (config/activityTypes.js), ses
 *    rules.places.minPerType meilleurs lieux, quel que soit le profil (le
 *    voyageur choisit lui-même le type) ;
 *  - avec un dîner, rules.places.minDinnerCandidates restaurants ouverts le soir.
 * Le reste est complété par les meilleurs lieux du profil.
 */
function buildCandidates({ all, visits, markets, restaurants, used, center, radius, trip, dates, countryCode, dinnerSlot }, rules) {
  const score = new Map();
  const scoreOf = (p) => {
    if (!score.has(p.id)) score.set(p.id, scorePlace(p, { distanceKm: distanceKm(center, p), effectiveRadiusKm: radius, categoryUses: 0 }, rules));
    return score.get(p.id);
  };
  const byScore = (list) => list.filter((p) => !used.has(p.id)).sort((a, b) => scoreOf(b) - scoreOf(a));
  const reserved = new Set();
  const keep = (list, n) => list.slice(0, n).forEach((p) => reserved.add(p.id));

  const unused = byScore([...all]);
  for (const id of ACTIVITY_TYPE_IDS) keep(unused.filter((p) => ACTIVITY_TYPES[id].categories.includes(p.category)), rules.places.minPerType);
  if (trip.dinner) keep(eveningRestaurants(restaurants.filter((p) => !used.has(p.id)), { dates, countryCode, window: dinnerSlot, prefs: trip.prefs }, rules), rules.places.minDinnerCandidates);

  const ranked = byScore([...new Set([...visits, ...markets, ...restaurants])]);
  const room = Math.max(0, rules.places.maxCandidates - reserved.size);
  const others = new Set(ranked.filter((p) => !reserved.has(p.id)).slice(0, room).map((p) => p.id));
  return unused.filter((p) => reserved.has(p.id) || others.has(p.id));
}

/**
 * @param {{
 *   trip: import('./model.js').Trip,
 *   places: import('./model.js').Place[],
 *   appellations?: { name: string, local: boolean }[],
 *   weatherDays?: { date: string, available: boolean, hours?: object[] }[],
 *   holidays?: { date: string, localName: string, global: boolean }[],
 *   co2Factors?: { car: Record<string, number>, transitKgPerPkm: number } | null,
 *   fuel?: { currency: string, prices: Record<string, { average: number }> } | null,
 *   makeId: () => string
 * }} input
 * @returns {{ trip: import('./model.js').Trip, warnings: { code: string, [k: string]: any }[] }}
 */
export function generateTrip({ trip, places, appellations = [], weatherDays = [], holidays = [], co2Factors = null, fuel = null, makeId }, rules) {
  const warnings = [];
  const all = dedupePlaces(places, rules.places.dedupDistanceM);
  const visits = all.filter((p) => allowedByProfile(p, trip.profile) && !isMarket(p));
  const markets = all.filter(isMarket);
  const restaurants = all.filter((p) => p.category === 'restaurant');
  const indoor = all.filter((p) => p.indoor === true && (p.category === 'museum' || p.category === 'monument') && allowedByProfile(p, trip.profile));

  const radius = effectiveRadiusKm(trip.mode, trip.destination.radiusKm, rules);
  const center = { lat: trip.destination.lat, lon: trip.destination.lon };
  const dates = eachDate(trip.startDate, trip.endDate);
  const used = new Set();
  const categoryUses = {};
  const specialties = appellations.slice(0, 3).map((a) => a.name);
  const countryCode = trip.destination.countryCode;
  // Heures de gabarit par type d'étape, dîner à l'heure du pays.
  const slots = { ...rules.dayTemplate, dinner: dinnerTimeFor(countryCode, rules) };
  const dinnerSlot = dinnerWindow(slots.dinner, rules);

  const days = [];
  const legsKmByDay = [];
  let freeSlots = 0;

  dates.forEach((date, dayIndex) => {
    const { start: startLodging, end: endLodging } = dayLodgings(trip.lodgings, dates, dayIndex);
    const transition = startLodging && endLodging && startLodging.id !== endLodging.id;

    // Proximité : autour de l'hébergement (ou du lieu d'ancrage), ou le long du trajet un jour de transition.
    let anchor = startLodging ?? null;
    const closeness = (p) => (transition ? detourKm(distanceKm, startLodging, p, endLodging) : distanceKm(anchor ?? center, p));
    const score = (p) => scorePlace(p, { distanceKm: closeness(p), effectiveRadiusKm: radius, categoryUses: categoryUses[p.category] ?? 0 }, rules);
    const reachable = (from, p) => !from || travelMinutes(from, p, trip.mode, rules) <= rules.travel.maxTravelMin;
    const best = (pool, from) =>
      pool
        .filter((p) => !used.has(p.id) && reachable(from, p))
        .map((p) => ({ p, s: score(p) }))
        .sort((a, b) => b.s - a.s)[0]?.p ?? null;
    const take = (p) => {
      if (!p) return null;
      used.add(p.id);
      categoryUses[p.category] = (categoryUses[p.category] ?? 0) + 1;
      return p;
    };

    // Sans hébergement : le lieu d'ancrage est la meilleure visite culturelle autour de la destination.
    const culture = take(best(visits.filter((p) => fitsSlot(p, 'culture')), startLodging));
    if (!anchor) anchor = culture;
    const outdoor = take(best(visits.filter((p) => fitsSlot(p, 'outdoor')), culture ?? startLodging));
    const relax = take(best(visits.filter((p) => fitsSlot(p, 'relax')), outdoor ?? culture ?? startLodging));

    // Pause gourmande : marché ou restaurant (alternance en mode "Les deux"), près des étapes de 10h00 et 14h30.
    const near = [culture, outdoor].filter(Boolean);
    const kind = lunchKindForDay(trip.lunch, dayIndex);
    const pickLunch = (k) => {
      if (k === 'restaurant') {
        const r = pickRestaurant(
          restaurants,
          { date, countryCode, near: near.length ? near : [anchor ?? center], effectiveRadiusKm: radius, prefs: trip.prefs, usedIds: used, accept: (p) => reachable(culture ?? startLodging, p) },
          rules
        );
        return r ? { place: take(r.place), badges: r.badges } : null;
      }
      const m = take(best(markets, culture ?? startLodging));
      return m ? { place: m, badges: [], specialties } : null;
    };
    const lunch = pickLunch(kind) ?? (trip.lunch === 'both' ? pickLunch(kind === 'restaurant' ? 'market' : 'restaurant') : null);

    // Dîner : restaurant ouvert sur la plage du dîner, jamais déjà proposé (déjeuner compris),
    // près de la dernière étape du jour et de l'hébergement du soir.
    let dinner = null;
    if (trip.dinner === 'restaurant') {
      const last = relax ?? outdoor ?? lunch?.place ?? culture;
      const dinnerNear = [last, endLodging].filter(Boolean);
      const r = pickRestaurant(
        restaurants,
        {
          date,
          countryCode,
          meal: 'dinner',
          window: dinnerSlot,
          near: dinnerNear.length ? dinnerNear : [anchor ?? center],
          effectiveRadiusKm: radius,
          prefs: trip.prefs,
          usedIds: used,
          accept: (p) => reachable(last ?? startLodging, p)
        },
        rules
      );
      dinner = r ? { place: take(r.place), badges: r.badges } : null;
    }

    const step = (type, slotStart, place, extra = {}) => {
      const s = { id: makeId(), type, slotStart, indoor: place ? place.indoor : null, status: 'planned', customTime: false, locked: false, badges: [], ...extra };
      if (place) s.place = place;
      else {
        s.badges = ['free_time'];
        freeSlots += 1;
      }
      return s;
    };
    // Soirée libre choisie : aucune proposition, et ce n'est pas un créneau "sans lieu trouvé".
    const freeEvening = () => ({ id: makeId(), type: 'dinner', slotStart: slots.dinner, indoor: null, status: 'planned', customTime: false, locked: false, badges: [] });
    const lunchExtra = lunch ? { badges: lunch.badges, ...(lunch.specialties?.length ? { specialties: lunch.specialties } : {}) } : {};
    const raw = [
      step('culture', slots.culture, culture),
      step('lunch', slots.lunch, lunch?.place ?? null, lunchExtra),
      step('outdoor', slots.outdoor, outdoor),
      step('relax', slots.relax, relax)
    ];
    if (!lunch) raw[1].badges = ['free_time'];
    if (trip.dinner === 'restaurant') raw.push(step('dinner', slots.dinner, dinner?.place ?? null, dinner ? { badges: dinner.badges } : {}));
    else if (trip.dinner === 'free') raw.push(freeEvening());

    const from = startLodging ? { lat: startLodging.lat, lon: startLodging.lon } : null;
    const to = endLodging ? { lat: endLodging.lat, lon: endLodging.lon } : null;
    let schedule = scheduleDay(raw, { from, to, mode: trip.mode }, rules);
    // Étape abandonnée (commençant trop tard) : son lieu redevient disponible.
    const kept = new Set(schedule.steps.map((s) => s.id));
    for (const r of raw) if (!kept.has(r.id) && r.place) used.delete(r.place.id);

    const day = { date, weatherAvailable: Boolean(weatherDays.find((w) => w.date === date)?.available), steps: schedule.steps };
    const weather = dayWeather(weatherDays.find((w) => w.date === date));
    if (weather) day.weather = weather;
    const holiday = holidays.find((h) => h.date === date && h.global);
    if (holiday) day.holiday = holiday.localName;
    if (startLodging) day.startLodgingId = startLodging.id;
    if (endLodging) day.endLodgingId = endLodging.id;

    // Arbitrage météo, puis nouveaux horaires si des lieux ont changé.
    const arbitrated = arbitrateWeather(day, indoor, used, rules);
    if (arbitrated.swapped) {
      const rescheduled = scheduleDay(
        arbitrated.steps.map((s) => ({ ...s, slotStart: slots[s.type] })),
        { from, to, mode: trip.mode },
        rules
      );
      schedule = rescheduled;
      day.steps = rescheduled.steps;
    }
    if (schedule.departure) day.departure = schedule.departure;
    if (schedule.returnTravelMin !== undefined) day.returnTravelMin = schedule.returnTravelMin;
    legsKmByDay.push(schedule.legsKm);
    days.push(day);
  });

  if (freeSlots) warnings.push({ code: 'free_time', count: freeSlots });
  if (days.some((d) => !d.weatherAvailable)) warnings.push({ code: 'weather_later' });
  if (!restaurants.length && includesRestaurants(trip.lunch, trip.dinner)) warnings.push({ code: 'no_restaurants' });

  // Réserve : les meilleurs lieux non utilisés, pour remplacer ou ajouter une étape sans réseau.
  const candidates = buildCandidates({ all, visits, markets, restaurants, used, center, radius, trip, dates, countryCode, dinnerSlot }, rules);

  const result = { ...trip, days, candidates };
  const carbon = computeCarbon(legsKmByDay, trip, co2Factors, rules);
  if (carbon) result.carbon = carbon;
  else warnings.push({ code: 'no_carbon_factors' });
  if (trip.mode === 'car') {
    const cost = computeFuelCost(carbon?.distanceKm ?? 0, trip, fuel, rules);
    if (cost) result.fuelCost = cost;
    else warnings.push({ code: 'no_fuel_price' });
    if (result.fuelConsumption === undefined) result.fuelConsumption = rules.fuel.defaultConsumptionL100;
  }
  return { trip: result, warnings };
}
