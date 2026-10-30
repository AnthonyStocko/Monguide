import { activityType, allowedByProfile, durationsFor, fitsSlot, isMarket } from './activity.js';
import { compactDay } from './compactDay.js';
import { CHRISTMAS_SEASON } from './config/nightSights.js';
import { PACES } from './model.js';
import { sunTimes } from './sun.js';
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
import { arbitrateWeather, averageRain, dayWeather } from './weatherArbitration.js';
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
 * (« Horaires à vérifier »). Tombée de la nuit (sun.js) : visites en extérieur
 * finies rules.day.outdoorBeforeSunsetMin avant le coucher du soleil, visite
 * du soir couverte ou à voir de nuit. Les jours alternent matinée culturelle
 * et matinée en extérieur (météo et coucher du soleil l'emportent). Chaque
 * jour a un déjeuner et un dîner au restaurant quand il en existe d'ouverts
 * (un marché ne remplace le déjeuner que s'il est place.mealCapable). Puis
 * compaction (compactDay.js) : aucun écart de plus de rules.day.maxGapMin,
 * temps libre seulement s'il est voulu (rythme tranquille, « Vos envies »).
 * Durées : scoring/duration.js, rythme du séjour (Trip.pace).
 * Aucun lieu n'est répété ; un créneau sans candidat devient
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
 * Lieu à voir de nuit ce jour-là (place.nightSight) : toujours pour un lieu
 * illuminé ou couvert connu ; marché de Noël pendant la saison seulement
 * (config/nightSights.js).
 * @param {{ nightSight?: string }} place
 * @param {string} date "YYYY-MM-DD"
 */
export function nightSightOn(place, date) {
  if (place.nightSight === 'always') return true;
  if (place.nightSight !== 'christmas') return false;
  const day = date.slice(5);
  const { from, to } = CHRISTMAS_SEASON;
  return from <= to ? day >= from && day <= to : day >= from || day <= to;
}

/** Hébergement vu comme le lieu d'un temps libre ; null sans hébergement. */
function lodgingPlace(lodging) {
  if (!lodging) return null;
  return { id: `lodging:${lodging.id}`, name: lodging.name ?? lodging.address, category: 'personal', source: 'lodging', lat: lodging.lat, lon: lodging.lon, certified: false, indoor: null };
}

/**
 * Temps libre volontaire (rythme tranquille, ou demandé dans « Vos envies ») :
 * étape de détente avec son lieu (hébergement ou place animée) et le badge
 * free_time ; sans lieu, aucun trajet n'est compté vers elle.
 */
function freeTimeStep(place, makeId) {
  return { id: makeId(), type: 'relax', slotStart: '00:00', indoor: null, status: 'planned', customTime: false, locked: false, badges: ['free_time'], ...(place ? { place } : {}) };
}

/** Envie de temps libre exprimée dans « Vos envies » (mots-clés, français ou anglais). */
const FREE_TIME_WISH = /(temps libre|quartier libre|se reposer|repos|tranquille|free time|rest\b|relax)/i;

/** Type d'une étape insérée : plein air si le lieu convient au créneau de l'après-midi, sinon culture. */
const followType = (place) => (place.indoor !== true && fitsSlot(place, 'outdoor') ? 'outdoor' : 'culture');

/**
 * Insertion d'étapes (follow : visite incontournable en plus, coup d'œil)
 * juste après une étape avec lieu, à la position du plus petit détour
 * (au plus maxDetourMin, ou sans limite avec null). Une insertion n'est
 * retenue que si ses trajets ne dépassent pas rules.travel.maxTravelMin, si
 * aucune étape n'est abandonnée, si aucune étape du gabarit
 * ne commence plus de rules.notoriety.mustSee.delayToleranceMin après son
 * heure sans insertion, et si route.fits accepte le lieu pendant l'étape
 * (horaires, coucher du soleil).
 * @param {object[]} raw étapes du gabarit (slotStart)
 * @param {{ from: object | null, to: object | null, mode: string, fits: (place: object, start: number, end: number) => boolean }} route
 */
function insertFollowSteps(raw, { from, to, mode, fits }, rules) {
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
      if (!fits(place, toMinutes(mine.start), toMinutes(mine.end))) continue;
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
  // Marché de Noël : seulement si le séjour tombe pendant la saison.
  const inSeason = (p) => p.nightSight !== 'christmas' || dates.some((d) => nightSightOn(p, d));
  const visits = all.filter((p) => allowedByProfile(p, trip.profile) && !isMarket(p) && known(p) && inSeason(p));
  const pace = PACES.includes(trip.pace) ? trip.pace : 'balanced';
  const wantsFreeTime = pace === 'relaxed' || FREE_TIME_WISH.test(trip.params?.wishes ?? '');
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
  // Durée du déjeuner au restaurant propre au pays, et rythme du séjour (durées des visites).
  const dayRules = {
    ...rules,
    tripPace: pace,
    durations: { ...rules.durations, restaurant: { ...rules.durations.restaurant, recommendedMin: meals.lunch.durationMin } }
  };

  const days = [];
  const legsKmByDay = [];
  let freeSlots = 0;

  dates.forEach((date, dayIndex) => {
    const { start: startLodging, end: endLodging } = dayLodgings(trip.lodgings, dates, dayIndex);
    const transition = startLodging && endLodging && startLodging.id !== endLodging.id;

    // Tombée de la nuit : visites en extérieur finies avant outdoorEnd ; après le coucher du soleil,
    // seulement des lieux couverts ou à voir de nuit.
    const sun = sunTimes(date, center, trip.timezone);
    const sunset = sun.sunset ? toMinutes(sun.sunset) : 24 * 60;
    const outdoorEnd = sunset - rules.day.outdoorBeforeSunsetMin;
    const weather = dayWeather(weatherDays.find((w) => w.date === date));
    const nightOk = (p) => p.indoor === true || nightSightOn(p, date);
    const outdoorish = (p) => p.indoor !== true && !nightSightOn(p, date) && !['restaurant', 'museum'].includes(p.category);
    /** Lieu possible de start à end (minutes) : coucher du soleil, horaires connus, jours de fermeture habituels. */
    const rainy = (start, end) => {
      if (!weather) return false;
      const rain = averageRain(weather, fromMinutes(start), fromMinutes(Math.min(end, 24 * 60 - 1)));
      return rain !== null && rain > rules.weather.rainThresholdPct;
    };
    const fits = (p, start, end) => {
      if (outdoorish(p) && end > outdoorEnd) return false;
      if (start >= sunset && !nightOk(p)) return false;
      const state = openingState(placeOpeningHours(p), { date, from: fromMinutes(start), to: fromMinutes(Math.min(end, 24 * 60 - 1)), lat: p.lat, lon: p.lon, countryCode });
      return state === 'open' || (state === 'unknown' && !usuallyClosed(p, date, countryCode));
    };
    // Visite ajoutée par la compaction : jamais en plein air sous une pluie annoncée (les créneaux du
    // gabarit, eux, sont adaptés ensuite par l'arbitrage météo).
    const fitsFiller = (p, start, end) => fits(p, start, end) && !(outdoorish(p) && rainy(start, end));
    // Ouvert (et possible) sur tout le créneau commençant à time, pour sa durée conseillée.
    const openAt = (time) => (p) => fits(p, toMinutes(time), toMinutes(time) + durationsFor(p, dayRules).recommendedMin);

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
    const take = (p) => {
      if (!p) return null;
      used.add(p.id);
      categoryUses[p.category] = (categoryUses[p.category] ?? 0) + 1;
      return p;
    };

    // Gabarit du jour : A = matinée culturelle, après-midi en extérieur ; B = l'inverse. Les jours
    // alternent ; la météo l'emporte (plein air dans la demi-journée sèche), et un après-midi trop
    // court avant la nuit impose B.
    let pattern = dayIndex % 2 === 0 ? 'A' : 'B';
    if (weather) {
      const morningRain = averageRain(weather, '09:00', '12:00');
      const afternoonRain = averageRain(weather, '14:00', '17:00');
      const wet = (r) => r !== null && r > rules.weather.rainThresholdPct;
      if (wet(afternoonRain) && !wet(morningRain)) pattern = 'B';
      else if (wet(morningRain) && !wet(afternoonRain)) pattern = 'A';
    }
    if (outdoorEnd - toMinutes(slots.outdoor) < 60) pattern = 'B';
    const morningKind = pattern === 'A' ? 'culture' : 'outdoor';
    const afternoonKind = pattern === 'A' ? 'outdoor' : 'culture';
    // Visite du soir : après la tombée de la nuit, un lieu couvert ou à voir de nuit.
    const evening = toMinutes(slots.relax) >= outdoorEnd;
    const fitsKind = (p, kind) => (kind === 'relax' && evening ? !['restaurant', 'market', 'farm'].includes(p.category) && nightOk(p) : fitsSlot(p, kind));

    // Incontournables du jour d'abord, aux créneaux du gabarit qui leur conviennent.
    const mustVisits = plan.days[dayIndex].filter((p) => !p.glance);
    const takeMust = (kind, time, from) => {
      const i = mustVisits.findIndex((p) => fitsKind(p, kind) && openAt(time)(p) && reachable(from, p) && (kind !== 'relax' || dinnerReachable(p)));
      return i >= 0 ? take(mustVisits.splice(i, 1)[0]) : null;
    };
    // Sans hébergement : le lieu d'ancrage est la meilleure visite du matin autour de la destination.
    // Détente : avec un dîner au restaurant, un lieu d'où un restaurant est accessible.
    const slotPool = (kind, time) => visits.filter((p) => fitsKind(p, kind) && openAt(time)(p) && (kind !== 'relax' || dinnerReachable(p)));
    const morning = takeMust(morningKind, slots.culture, startLodging) ?? take(best(slotPool(morningKind, slots.culture), startLodging));
    if (!anchor) anchor = morning;
    const afternoon = takeMust(afternoonKind, slots.outdoor, morning ?? startLodging) ?? take(best(slotPool(afternoonKind, slots.outdoor), morning ?? startLodging));
    const relax = takeMust('relax', slots.relax, afternoon ?? morning ?? startLodging) ?? take(best(slotPool('relax', slots.relax), afternoon ?? morning ?? startLodging));

    // Pause gourmande : restaurant, ou marché où l'on déjeune vraiment (food court, stands :
    // place.mealCapable). Un autre marché devient une visite, et un vrai déjeuner est ajouté.
    const near = [morning, afternoon].filter(Boolean);
    const kind = lunchKindForDay(trip.lunch, dayIndex);
    const restaurantFor = (meal, window, nearPlaces, from) =>
      pickRestaurant(restaurants, { date, countryCode, meal, window, near: nearPlaces, effectiveRadiusKm: radius, prefs: trip.prefs, usedIds: used, accept: (p) => reachable(from, p) }, rules) ??
      // Repas garanti : à défaut, le meilleur restaurant ouvert autour de la destination, sans contrainte de trajet.
      pickRestaurant(restaurants, { date, countryCode, meal, window, near: [anchor ?? center], effectiveRadiusKm: radius, prefs: trip.prefs, usedIds: used }, rules);
    const pickLunch = (k) => {
      if (k === 'restaurant') {
        const r = restaurantFor('lunch', lunchSlot, near.length ? near : [anchor ?? center], morning ?? startLodging);
        return r ? { place: take(r.place), badges: r.badges } : null;
      }
      const m = take(best(markets.filter((p) => p.mealCapable && openAt(slots.lunch)(p)), morning ?? startLodging));
      return m ? { place: m, badges: [], specialties } : null;
    };
    let marketVisit = null;
    let lunch = pickLunch(kind);
    if (!lunch && kind === 'market') {
      // Aucun marché où déjeuner : le marché du jour devient une visite avant le repas.
      marketVisit = best(markets.filter((p) => !p.mealCapable && openAt(slots.culture)(p)), morning ?? startLodging);
      lunch = pickLunch('restaurant');
    }
    if (!lunch && trip.lunch === 'both') lunch = pickLunch(kind === 'restaurant' ? 'market' : 'restaurant');

    // Dîner : restaurant ouvert sur la plage du dîner, jamais déjà proposé (déjeuner compris),
    // près de la dernière étape du jour et de l'hébergement du soir ; garanti s'il en existe un ouvert.
    let dinner = null;
    if (trip.dinner === 'restaurant') {
      const last = relax ?? afternoon ?? lunch?.place ?? morning;
      const dinnerNear = [last, endLodging].filter(Boolean);
      const r = restaurantFor('dinner', dinnerSlot, dinnerNear.length ? dinnerNear : [anchor ?? center], last ?? startLodging);
      dinner = r ? { place: take(r.place), badges: r.badges } : null;
    }

    const step = (type, slotStart, place, extra = {}) => {
      const s = { id: makeId(), type, slotStart, indoor: place ? place.indoor : null, status: 'planned', customTime: false, locked: false, badges: [], ...extra };
      if (place) {
        s.place = place;
        if (reserved.has(place.id)) s.badges = [...s.badges, 'must_see'];
        // Musée aux horaires inconnus : « Horaires à vérifier ».
        if (place.category === 'museum' && !placeOpeningHours(place)) s.badges = [...s.badges, 'hours_unconfirmed'];
      } else {
        s.badges = ['free_time'];
        freeSlots += 1;
      }
      return s;
    };
    // Soirée libre choisie : aucune proposition, et ce n'est pas un créneau "sans lieu trouvé".
    const freeEvening = () => ({ id: makeId(), type: 'dinner', slotStart: slots.dinner, indoor: null, status: 'planned', customTime: false, locked: false, badges: [] });
    const lunchExtra = lunch ? { badges: lunch.badges, ...(lunch.specialties?.length ? { specialties: lunch.specialties } : {}) } : {};
    const raw = [
      step(morningKind, slots.culture, morning),
      step('lunch', slots.lunch, lunch?.place ?? null, lunchExtra),
      step(afternoonKind, slots.outdoor, afternoon),
      step('relax', slots.relax, relax)
    ];
    if (!lunch) raw[1].badges = ['free_time'];
    if (trip.dinner === 'restaurant') raw.push(step('dinner', slots.dinner, dinner?.place ?? null, dinner ? { badges: dinner.badges } : {}));
    else if (trip.dinner === 'free') raw.push(freeEvening());

    const from = startLodging ? { lat: startLodging.lat, lon: startLodging.lon } : null;
    const to = endLodging ? { lat: endLodging.lat, lon: endLodging.lon } : null;
    const route = { from, to, mode: trip.mode, fits };

    // Étapes insérées après une étape du gabarit : marché visité, incontournables restants, leurs
    // coups d'œil, puis d'autres coups d'œil proches du trajet. Un lieu qui ne trouve pas sa place est libéré.
    const inserted = insertFollowSteps(raw, route, dayRules);
    if (marketVisit && inserted.add(step('culture', slots.culture, marketVisit), null)) take(marketVisit);
    for (const p of [...mustVisits, ...plan.days[dayIndex].filter((x) => x.glance)]) {
      // Coup d'œil incontournable : détour d'au plus deux fois celui d'un coup d'œil ordinaire.
      const ok = inserted.add(step(followType(p), slots.culture, p, p.glance ? { badges: ['glance'] } : {}), p.glance ? 2 * rules.notoriety.glance.maxDetourMin : null);
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
    const slotOf = new Map(inserted.steps.map((s) => [s.id, s.slotStart]));
    let schedule = scheduleDay(inserted.steps, { from, to, mode: trip.mode }, dayRules);
    // Étape abandonnée (commençant trop tard) : son lieu redevient disponible.
    const kept = new Set(schedule.steps.map((s) => s.id));
    for (const r of inserted.steps) if (!kept.has(r.id) && r.place) used.delete(r.place.id);

    const day = { id: dayId(trip.id, date), date, weatherAvailable: Boolean(weatherDays.find((w) => w.date === date)?.available), steps: schedule.steps };
    if (weather) day.weather = weather;
    if (sun.sunset) day.sunset = sun.sunset;
    const holiday = holidays.find((h) => h.date === date && h.global);
    if (holiday) day.holiday = holiday.localName;
    if (startLodging) day.startLodgingId = startLodging.id;
    if (endLodging) day.endLodgingId = endLodging.id;

    // Arbitrage météo. Lieux couverts de repli : ouverts aux heures de l'après-midi et du soir (horaires connus).
    const arbitrated = arbitrateWeather(day, indoor.filter((p) => openAt(slots.outdoor)(p) && openAt(slots.relax)(p)), used, rules);

    // Compaction : plus de trou de plus de rules.day.maxGapMin (visites ajoutées, visites allongées,
    // étape suivante avancée ; temps libre seulement s'il est voulu).
    // Temps libre voulu : près de l'hébergement du soir, sinon sur une place animée proche.
    const square = wantsFreeTime && !(endLodging ?? startLodging) ? best(visits.filter((p) => activityType(p) === 'square' && fits(p, outdoorEnd - 60, outdoorEnd)), anchor) : null;
    const freePlace = wantsFreeTime ? (lodgingPlace(endLodging ?? startLodging) ?? take(square)) : null;
    const fillers = visits
      .filter((p) => !used.has(p.id) && !reserved.has(p.id))
      .map((p) => ({ p, s: score(p) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map(({ p }) => p);
    const freeTime = wantsFreeTime ? () => freeTimeStep(freePlace, makeId) : null;
    const compacted = compactDay(
      arbitrated.steps.map((s) => ({ ...s, slotStart: slotOf.get(s.id) ?? s.start, ...(followIds.has(s.id) ? { follow: true } : {}) })),
      {
        from,
        to,
        mode: trip.mode,
        candidates: fillers,
        fits: fitsFiller,
        makeStep: (p) => step(followType(p), slots.culture, p, p.glance ? { badges: ['glance'] } : {}),
        lunchFrom: lunchSlot.start,
        // Dîner avancé d'au plus une demi-heure, jamais avant l'heure du pays.
        dinnerFrom: fromMinutes(Math.max(toMinutes(meals.dinner.earliest), toMinutes(slots.dinner) - 30)),
        freeTime
      },
      dayRules
    );
    for (const p of compacted.added) take(p);
    schedule = scheduleDay(compacted.steps, { from, to, mode: trip.mode }, dayRules);
    day.steps = schedule.steps;
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
