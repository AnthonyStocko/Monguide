import { allowedByProfile, durationsFor, fitsSlot, isMarket } from './activity.js';
import { openOn, planMustSees, selectMustSees } from './mustSee.js';
import { notorietyThreshold } from './scoring/notoriety.js';
import { eachDate } from './dates.js';
import { dedupePlaces } from './dedupePlaces.js';
import { distanceKm } from './geo.js';
import { ACTIVITY_TYPE_IDS, ACTIVITY_TYPES } from './config/activityTypes.js';
import { mealTimesFor } from './config/mealTimes.js';
import { openingState, placeOpeningHours, usuallyClosed } from './openingHours.js';
import { dinnerWindow, evaluateRestaurant, lunchKindForDay, pickRestaurant } from './pickRestaurant.js';
import { scheduleDay } from './scheduleDay.js';
import { fromMinutes, toMinutes } from './time.js';
import { detourKm, scorePlace } from './scorePlace.js';
import { effectiveRadiusKm, travelMinutes } from './travel.js';
import { includesRestaurants } from './tripDraft.js';
import { arbitrateWeather, dayWeather } from './weatherArbitration.js';
import { computeCarbon, computeFuelCost } from './carbon.js';
import { dayId } from './stableId.js';

/**
 * Moteur de génération d'un séjour (fonction pure, exécutée par la fonction
 * serveur generate). Construit chaque journée à partir du gabarit
 * (rules.dayTemplate) : départ, visite culturelle, pause gourmande, plein
 * air, détente, dîner (heures du pays de la destination : mealTimesFor ; un
 * déjeuner plus tardif décale d'autant le plein air), puis retour à
 * l'hébergement. Un lieu dont les horaires sont connus n'est proposé que s'il
 * est ouvert pendant tout son créneau (heure du gabarit, durée conseillée) :
 * jamais pendant une fermeture de mi-journée. Notoriété (scoring/notoriety.js) : les musées et
 * monuments sous le seuil adaptatif de la destination ne sont pas proposés ; les incontournables
 * (mustSee.js, badge must_see) sont placés en priorité, répartis sur les jours, aux créneaux du
 * gabarit puis en visites insérées ; des coups d'œil (place.glance, badge glance) sont insérés
 * sur les trajets. Un lieu (hors restaurants, vérifiés repas par repas) fermé à
 * toutes les dates du séjour d'après ses horaires connus est écarté ; un musée
 * aux horaires inconnus n'est jamais proposé un jour de fermeture habituel du
 * pays (config/museumClosingDays.js) et porte le badge hours_unconfirmed
 * (« Horaires à vérifier »). Aucun lieu n'est répété ; un créneau sans candidat devient
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

/** Type d'une étape insérée : plein air si le lieu convient au créneau de l'après-midi, sinon culture. */
const followType = (place) => (place.indoor !== true && fitsSlot(place, 'outdoor') ? 'outdoor' : 'culture');

/**
 * Insertion d'étapes (follow : visite incontournable en plus, coup d'œil)
 * juste après une étape avec lieu, à la position du plus petit détour
 * (au plus maxDetourMin, ou sans limite avec null). Une insertion n'est
 * retenue que si ses trajets ne dépassent pas rules.travel.maxTravelMin, si
 * aucune étape n'est abandonnée, si aucune étape du gabarit
 * ne commence plus de rules.notoriety.mustSee.delayToleranceMin après son
 * heure sans insertion, et si le lieu est ouvert (ou ses horaires inconnus)
 * pendant l'étape.
 * @param {object[]} raw étapes du gabarit (slotStart)
 * @param {{ from: object | null, to: object | null, mode: string, date: string, countryCode: string }} route
 */
function insertFollowSteps(raw, { from, to, mode, date, countryCode }, rules) {
  let steps = raw;
  const followIds = new Set();
  const base = new Map(scheduleDay(raw, { from, to, mode }, rules).steps.map((s) => [s.id, toMinutes(s.start)]));
  const tolerance = rules.notoriety.mustSee.delayToleranceMin;
  const travel = (a, b) => (a && b ? travelMinutes(a, b, mode, rules) : 0);
  const add = (newStep, maxDetourMin) => {
    const place = newStep.place;
    const positions = [];
    steps.forEach((s, k) => {
      if (!s.place || s.type === 'dinner' || k === steps.length - 1) return;
      const next = steps.slice(k + 1).find((x) => x.place)?.place ?? to;
      const detour = travel(s.place, place) + travel(place, next) - travel(s.place, next);
      const reachable = Math.max(travel(s.place, place), travel(place, next)) <= rules.travel.maxTravelMin;
      if (reachable && (maxDetourMin === null || detour <= maxDetourMin)) positions.push({ k, detour });
    });
    positions.sort((a, b) => a.detour - b.detour || a.k - b.k);
    for (const { k } of positions) {
      const trial = [...steps.slice(0, k + 1), { ...newStep, slotStart: steps[k].slotStart, follow: true }, ...steps.slice(k + 1)];
      const schedule = scheduleDay(trial, { from, to, mode }, rules);
      if (schedule.steps.length !== trial.length) continue;
      if (schedule.steps.some((s) => base.has(s.id) && toMinutes(s.start) > base.get(s.id) + tolerance)) continue;
      const mine = schedule.steps.find((s) => s.id === newStep.id);
      const state = openingState(placeOpeningHours(place), { date, from: mine.start, to: mine.end, lat: place.lat, lon: place.lon, countryCode });
      if (state === 'closed' || state === 'partial') continue;
      steps = trial;
      followIds.add(newStep.id);
      return true;
    }
    return false;
  };
  return {
    get steps() {
      return steps;
    },
    followIds,
    add
  };
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
  const dates = eachDate(trip.startDate, trip.endDate);
  const countryCode = trip.destination.countryCode;
  // Horaires connus et fermé à toutes les dates du séjour : écarté (restaurants : vérifiés repas par repas).
  const openDuringTrip = (p) =>
    p.category === 'restaurant' ||
    dates.some((date) => openingState(placeOpeningHours(p), { date, from: '09:00', to: '19:00', lat: p.lat, lon: p.lon, countryCode }) !== 'closed');
  const all = dedupePlaces(places, rules.places.dedupDistanceM).filter(openDuringTrip);
  // Seuil adaptatif : musées et monuments de notoriété trop faible pour la destination
  // jamais proposés à la génération (ils restent dans la réserve).
  const isHeritage = (p) => p.category === 'museum' || p.category === 'monument';
  const heritageScores = all.filter((p) => isHeritage(p) && allowedByProfile(p, trip.profile)).map((p) => p.notoriety ?? 0);
  const { threshold } = notorietyThreshold(heritageScores, dates.length * rules.notoriety.threshold.minVisitsPerDay, rules);
  const known = (p) => !isHeritage(p) || (p.notoriety ?? 0) >= threshold;
  const visits = all.filter((p) => allowedByProfile(p, trip.profile) && !isMarket(p) && known(p));
  const markets = all.filter(isMarket);
  const restaurants = all.filter((p) => p.category === 'restaurant');
  const indoor = all.filter((p) => p.indoor === true && isHeritage(p) && !p.glance && allowedByProfile(p, trip.profile) && known(p));

  const radius = effectiveRadiusKm(trip.mode, trip.destination.radiusKm, rules);
  const center = { lat: trip.destination.lat, lon: trip.destination.lon };
  // Incontournables : les plus connus près des logements (ou de la destination), répartis sur les jours.
  const mustSees = selectMustSees(visits, { anchors: trip.lodgings.length ? trip.lodgings : [center], radiusKm: Math.min(rules.notoriety.mustSee.radiusKm, radius), dates, countryCode }, rules);
  const plan = planMustSees(mustSees, { dates, weather: dates.map((d) => dayWeather(weatherDays.find((w) => w.date === d))), countryCode }, rules);
  const reserved = new Set(mustSees.map((p) => p.id));
  // Restaurants collectés près de la destination seulement : la dernière visite du jour doit en avoir
  // un à portée (rules.travel.maxTravelMin), sinon le dîner devient un temps libre.
  const nearDinner = new Map();
  const dinnerReachable = (p) => {
    if (trip.dinner !== 'restaurant' || !restaurants.length) return true;
    if (!nearDinner.has(p.id)) nearDinner.set(p.id, restaurants.some((r) => travelMinutes(p, r, trip.mode, rules) <= rules.travel.maxTravelMin));
    return nearDinner.get(p.id);
  };
  const used = new Set();
  const categoryUses = {};
  const specialties = appellations.slice(0, 3).map((a) => a.name);
  // Heures de gabarit par type d'étape, repas et dernière visite à l'heure du pays.
  const meals = mealTimesFor(countryCode, rules);
  const lunchShift = Math.max(0, toMinutes(meals.lunch.start) - toMinutes(rules.dayTemplate.lunch));
  const slots = {
    ...rules.dayTemplate,
    lunch: meals.lunch.start,
    outdoor: fromMinutes(toMinutes(rules.dayTemplate.outdoor) + lunchShift),
    relax: meals.visits.relax,
    dinner: meals.dinner.start
  };
  const lunchSlot = meals.lunch.window;
  const dinnerSlot = dinnerWindow(slots.dinner, rules);
  // Durée du déjeuner au restaurant propre au pays (horaires de la journée).
  const dayRules =
    meals.lunch.durationMin === rules.durations.restaurant.recommendedMin
      ? rules
      : { ...rules, durations: { ...rules.durations, restaurant: { ...rules.durations.restaurant, recommendedMin: meals.lunch.durationMin } } };

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
        .filter((p) => !used.has(p.id) && !reserved.has(p.id) && !p.glance && reachable(from, p))
        .map((p) => ({ p, s: score(p) }))
        .sort((a, b) => b.s - a.s)[0]?.p ?? null;
    // Horaires connus : ouvert sur tout le créneau (heure du gabarit + durée conseillée) ; inconnus : accepté.
    const openFor = (slot) => (p) => {
      const from = slots[slot];
      const to = fromMinutes(toMinutes(from) + durationsFor(p, dayRules).recommendedMin);
      const state = openingState(placeOpeningHours(p), { date, from, to, lat: p.lat, lon: p.lon, countryCode });
      return state === 'open' || (state === 'unknown' && !usuallyClosed(p, date, countryCode));
    };
    const take = (p) => {
      if (!p) return null;
      used.add(p.id);
      categoryUses[p.category] = (categoryUses[p.category] ?? 0) + 1;
      return p;
    };

    // Incontournables du jour d'abord, aux créneaux du gabarit qui leur conviennent.
    const mustVisits = plan.days[dayIndex].filter((p) => !p.glance);
    const takeMust = (slot, from) => {
      const i = mustVisits.findIndex((p) => fitsSlot(p, slot) && openFor(slot)(p) && reachable(from, p) && (slot !== 'relax' || dinnerReachable(p)));
      return i >= 0 ? take(mustVisits.splice(i, 1)[0]) : null;
    };
    // Sans hébergement : le lieu d'ancrage est la meilleure visite culturelle autour de la destination.
    // Détente : avec un dîner au restaurant, un lieu d'où un restaurant est accessible.
    const slotPool = (slot) => visits.filter((p) => fitsSlot(p, slot) && openFor(slot)(p) && (slot !== 'relax' || dinnerReachable(p)));
    const culture = takeMust('culture', startLodging) ?? take(best(slotPool('culture'), startLodging));
    if (!anchor) anchor = culture;
    const outdoor = takeMust('outdoor', culture ?? startLodging) ?? take(best(slotPool('outdoor'), culture ?? startLodging));
    const relax = takeMust('relax', outdoor ?? culture ?? startLodging) ?? take(best(slotPool('relax'), outdoor ?? culture ?? startLodging));

    // Pause gourmande : marché ou restaurant (alternance en mode "Les deux"), près des étapes de 10h00 et 14h30.
    const near = [culture, outdoor].filter(Boolean);
    const kind = lunchKindForDay(trip.lunch, dayIndex);
    const pickLunch = (k) => {
      if (k === 'restaurant') {
        const r = pickRestaurant(
          restaurants,
          { date, countryCode, window: lunchSlot, near: near.length ? near : [anchor ?? center], effectiveRadiusKm: radius, prefs: trip.prefs, usedIds: used, accept: (p) => reachable(culture ?? startLodging, p) },
          rules
        );
        return r ? { place: take(r.place), badges: r.badges } : null;
      }
      const m = take(best(markets.filter(openFor('lunch')), culture ?? startLodging));
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
      if (place) {
        s.place = place;
        if (reserved.has(place.id)) s.badges = [...s.badges, 'must_see'];
        // Musée aux horaires inconnus : « Horaires à vérifier ».
        if (place.category === 'museum' && !placeOpeningHours(place)) s.badges = [...s.badges, 'hours_unconfirmed'];
      }
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
    const route = { from, to, mode: trip.mode, date, countryCode };

    // Étapes insérées après une étape du gabarit : incontournables restants, leurs coups d'œil,
    // puis d'autres coups d'œil proches du trajet. Un lieu qui ne trouve pas sa place est libéré.
    const inserted = insertFollowSteps(raw, route, dayRules);
    for (const p of [...mustVisits, ...plan.days[dayIndex].filter((x) => x.glance)]) {
      const ok = inserted.add(step(followType(p), slots.culture, p, p.glance ? { badges: ['glance'] } : {}), null);
      if (ok) take(p);
      else reserved.delete(p.id);
    }
    let extraGlances = 0;
    const glances = visits.filter((p) => p.glance && !used.has(p.id) && !reserved.has(p.id)).sort((a, b) => (b.notoriety ?? 0) - (a.notoriety ?? 0));
    for (const p of glances) {
      if (extraGlances >= rules.notoriety.glance.maxPerDay) break;
      if (inserted.add(step(followType(p), slots.culture, p, { badges: ['glance'] }), rules.notoriety.glance.maxDetourMin)) {
        take(p);
        extraGlances += 1;
      }
    }
    const followIds = inserted.followIds;
    let schedule = scheduleDay(inserted.steps, { from, to, mode: trip.mode }, dayRules);
    // Étape abandonnée (commençant trop tard) : son lieu redevient disponible.
    const kept = new Set(schedule.steps.map((s) => s.id));
    for (const r of inserted.steps) if (!kept.has(r.id) && r.place) used.delete(r.place.id);

    const day = { id: dayId(trip.id, date), date, weatherAvailable: Boolean(weatherDays.find((w) => w.date === date)?.available), steps: schedule.steps };
    const weather = dayWeather(weatherDays.find((w) => w.date === date));
    if (weather) day.weather = weather;
    const holiday = holidays.find((h) => h.date === date && h.global);
    if (holiday) day.holiday = holiday.localName;
    if (startLodging) day.startLodgingId = startLodging.id;
    if (endLodging) day.endLodgingId = endLodging.id;

    // Arbitrage météo, puis nouveaux horaires si des lieux ont changé.
    // Lieux couverts de repli : ouverts aux heures du plein air et de la détente (horaires connus).
    const arbitrated = arbitrateWeather(day, indoor.filter((p) => openFor('outdoor')(p) && openFor('relax')(p)), used, rules);
    if (arbitrated.swapped) {
      const rescheduled = scheduleDay(
        arbitrated.steps.map((s) => ({ ...s, slotStart: slots[s.type], ...(followIds.has(s.id) ? { follow: true } : {}) })),
        { from, to, mode: trip.mode },
        dayRules
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
