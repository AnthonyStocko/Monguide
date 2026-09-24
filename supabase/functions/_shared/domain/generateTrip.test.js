import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { distanceKm, destinationPoint } from './geo.js';
import { generateTrip } from './generateTrip.js';
import { detourKm } from './scorePlace.js';
import { toMinutes } from './time.js';

const VILLEFRANCHE = { lat: 45.9865, lon: 4.7266 };
const ANNECY = { lat: 45.8992, lon: 6.1294 };
const CHAMONIX = { lat: 45.9237, lon: 6.8694 };
const FACTORS = { car: { sp95: 2.69, diesel: 3.1 }, transitKgPerPkm: 0.00503 };

let seq = 0;
const makeId = () => `id-${(seq += 1)}`;

/** Lieu fictif à `km` du centre, dans la direction `bearing`. */
function place(id, category, center, km, bearing, extra = {}) {
  const pos = destinationPoint(center, km, bearing);
  return {
    id,
    name: `${category} ${id}`,
    category,
    lat: pos.lat,
    lon: pos.lon,
    source: 'test',
    certified: category === 'museum' || category === 'monument',
    indoor: category === 'museum' || category === 'restaurant' ? true : category === 'monument' ? null : false,
    ...extra
  };
}

/** Jeu de lieux autour d'un centre : musées, monuments, parcs, points de vue, marchés, restaurants. */
function placesAround(center, prefix, n = 6) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const b = i * (360 / n);
    out.push(place(`${prefix}-museum-${i}`, 'museum', center, 0.5 + i * 0.4, b));
    out.push(place(`${prefix}-monument-${i}`, 'monument', center, 0.8 + i * 0.4, b + 20));
    out.push(place(`${prefix}-park-${i}`, 'park', center, 1 + i * 0.5, b + 40));
    out.push(place(`${prefix}-view-${i}`, 'viewpoint', center, 1.2 + i * 0.5, b + 60));
    out.push(place(`${prefix}-market-${i}`, 'market', center, 0.6 + i * 0.3, b + 80));
    out.push(place(`${prefix}-resto-${i}`, 'restaurant', center, 0.4 + i * 0.3, b + 100, { food: { regional: i % 2 === 0, openingHours: 'Mo-Su 12:00-14:30' } }));
  }
  return out;
}

function trip(patch = {}) {
  return {
    schemaVersion: 1,
    id: 't1',
    title: 'Villefranche-sur-Saône',
    createdAt: 'x',
    updatedAt: 'x',
    deleted: false,
    destination: { name: 'Villefranche-sur-Saône', countryCode: 'FR', ...VILLEFRANCHE, radiusKm: 20 },
    timezone: 'Europe/Paris',
    currency: 'EUR',
    startDate: '2026-10-06',
    endDate: '2026-10-08',
    travelers: 2,
    mode: 'car',
    fuelType: 'diesel',
    profile: 'balanced',
    lunch: 'both',
    prefs: { vegetarian: false, wheelchair: false },
    lodgings: [],
    days: [],
    candidates: [],
    ...patch
  };
}

const weatherDay = (date, pct) => ({
  date,
  available: true,
  hours: Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, precipitationProbability: pct, temperature: 12, weatherCode: 61 }))
});

const run = (tripPatch = {}, input = {}) =>
  generateTrip({ trip: trip(tripPatch), places: placesAround(VILLEFRANCHE, 'v'), co2Factors: FACTORS, fuel: { currency: 'EUR', prices: { diesel: { average: 1.8 } } }, makeId, ...input }, RULES);

const placeIds = (t) => t.days.flatMap((d) => d.steps.filter((s) => s.place).map((s) => s.place.id));

describe('generateTrip : planning', () => {
  it('3 jours, profil Équilibré : quatre créneaux par jour, aucun lieu répété', () => {
    const { trip: t } = run();
    expect(t.days.map((d) => d.date)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08']);
    for (const d of t.days) expect(d.steps.map((s) => s.type)).toEqual(['culture', 'lunch', 'outdoor', 'relax']);
    const ids = placeIds(t);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('chaque créneau finit après son début et ne chevauche pas le trajet vers le suivant', () => {
    for (const mode of ['walk', 'transit', 'bike', 'car']) {
      const { trip: t } = run({ mode, fuelType: mode === 'car' ? 'diesel' : undefined });
      for (const d of t.days) {
        d.steps.forEach((s, i) => {
          expect(toMinutes(s.end)).toBeGreaterThan(toMinutes(s.start));
          const next = d.steps[i + 1];
          if (next) expect(toMinutes(next.start)).toBeGreaterThanOrEqual(toMinutes(s.end) + (next.travelFromPreviousMin ?? 0));
        });
      }
    }
  });

  it('respecte le trajet maximal de 45 minutes entre deux étapes', () => {
    for (const mode of ['walk', 'transit', 'bike', 'car']) {
      const { trip: t } = run({ mode });
      for (const d of t.days) for (const s of d.steps) expect(s.travelFromPreviousMin ?? 0).toBeLessThanOrEqual(45);
    }
  });

  it('alterne restaurant et marché en mode "Les deux" (restaurant le premier jour)', () => {
    const { trip: t } = run();
    expect(t.days.map((d) => d.steps[1].place.category)).toEqual(['restaurant', 'market', 'restaurant']);
    expect(run({ lunch: 'restaurant' }).trip.days.every((d) => d.steps[1].place.category === 'restaurant')).toBe(true);
  });

  it('associe les appellations locales à la pause au marché', () => {
    const { trip: t } = run({ lunch: 'market' }, { appellations: [{ name: 'Beaujolais', local: false }] });
    expect(t.days[0].steps[1].specialties).toEqual(['Beaujolais']);
  });

  it('indique un temps libre plutôt qu\'inventer un lieu', () => {
    const { trip: t, warnings } = generateTrip({ trip: trip({ profile: 'certified' }), places: [place('m', 'museum', VILLEFRANCHE, 1, 0)], co2Factors: FACTORS, makeId }, RULES);
    expect(t.days[0].steps[0].place.id).toBe('m');
    expect(t.days[0].steps[2]).toMatchObject({ badges: ['free_time'] });
    expect(t.days[0].steps[2].place).toBeUndefined();
    expect(warnings).toContainEqual(expect.objectContaining({ code: 'free_time' }));
  });

  it('signale le jour férié', () => {
    const { trip: t } = run({}, { holidays: [{ date: '2026-10-07', localName: 'Fête locale', global: true }] });
    expect(t.days[1].holiday).toBe('Fête locale');
    expect(t.days[0].holiday).toBeUndefined();
  });
});

describe('generateTrip : réserve de candidats', () => {
  it('contient au plus 60 lieux, aucun déjà utilisé', () => {
    const many = [...placesAround(VILLEFRANCHE, 'a', 12), ...placesAround(destinationPoint(VILLEFRANCHE, 3, 45), 'b', 12)];
    const { trip: t } = generateTrip({ trip: trip(), places: many, co2Factors: FACTORS, makeId }, RULES);
    expect(t.candidates.length).toBe(60);
    const used = new Set(placeIds(t));
    expect(t.candidates.some((c) => used.has(c.id))).toBe(false);
  });
});

describe('generateTrip : météo', () => {
  it('pluie à 80 % : les activités extérieures sont remplacées par des lieux intérieurs', () => {
    const { trip: t } = run({}, { weatherDays: [weatherDay('2026-10-06', 80), weatherDay('2026-10-07', 10)] });
    const rainy = t.days[0];
    expect(rainy.steps.filter((x) => ['culture', 'outdoor', 'relax'].includes(x.type) && x.place).length).toBe(3);
    for (const s of rainy.steps.filter((x) => ['culture', 'outdoor', 'relax'].includes(x.type) && x.place)) {
      expect(s.place.indoor).toBe(true);
    }
    expect(rainy.steps.some((s) => s.badges.includes('weather_adapted'))).toBe(true);
    // Jour sec : les activités extérieures restent.
    expect(t.days[1].steps.find((s) => s.type === 'outdoor').place.indoor).not.toBe(true);
    const ids = placeIds(t);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('séjour partiellement couvert : les jours hors prévision ne sont pas arbitrés et sont à réévaluer', () => {
    const { trip: t, warnings } = run({}, { weatherDays: [weatherDay('2026-10-06', 80), { date: '2026-10-07', available: false }, { date: '2026-10-08', available: false }] });
    expect(t.days.map((d) => d.weatherAvailable)).toEqual([true, false, false]);
    expect(t.days[0].weather['14']).toBe(80);
    expect(t.days[1].weather).toBeUndefined();
    expect(t.days[1].steps.some((s) => s.badges.includes('weather_adapted'))).toBe(false);
    expect(warnings).toContainEqual({ code: 'weather_later' });
  });
});

describe('generateTrip : hébergement', () => {
  const lodging = (id, pos, nights) => ({ id, address: id, ...pos, nights });

  it('journée regroupée autour de l\'hébergement, avec départ et retour', () => {
    const hotel = lodging('hotel', destinationPoint(VILLEFRANCHE, 2, 200), ['2026-10-06', '2026-10-07']);
    const { trip: t } = run({ lodgings: [hotel] });
    const day = t.days[1];
    expect(day.startLodgingId).toBe('hotel');
    expect(day.endLodgingId).toBe('hotel');
    expect(day.departure.travelMin).toBeGreaterThan(0);
    expect(toMinutes(day.departure.time) + day.departure.travelMin).toBe(toMinutes(day.steps[0].start));
    expect(day.returnTravelMin).toBeGreaterThan(0);
    expect(day.steps.filter((x) => x.place).length).toBe(4);
    for (const s of day.steps.filter((x) => x.place)) expect(distanceKm(hotel, s.place)).toBeLessThan(6);
  });

  it('journée de transition Annecy -> Chamonix : étapes proches du trajet', () => {
    const places = [
      ...placesAround(ANNECY, 'annecy'),
      ...placesAround(CHAMONIX, 'chamonix'),
      // Lieux le long du trajet et lieux à l'écart.
      ...placesAround(destinationPoint(ANNECY, 25, 80), 'route', 3),
      ...placesAround(destinationPoint(ANNECY, 25, 170), 'ecart', 3)
    ];
    const lodgings = [lodging('annecy', ANNECY, ['2026-10-06']), lodging('chamonix', CHAMONIX, ['2026-10-07'])];
    const t = generateTrip(
      { trip: trip({ destination: { name: 'Annecy', countryCode: 'FR', ...ANNECY, radiusKm: 40 }, lodgings, startDate: '2026-10-06', endDate: '2026-10-08' }), places, co2Factors: FACTORS, makeId },
      RULES
    ).trip;
    const transition = t.days[1];
    expect(transition).toMatchObject({ startLodgingId: 'annecy', endLodgingId: 'chamonix' });
    expect(transition.steps.filter((x) => x.place).length).toBeGreaterThanOrEqual(3);
    expect(transition.steps.filter((x) => x.place).some((x) => x.place.id.startsWith('route'))).toBe(true);
    for (const s of transition.steps.filter((x) => x.place)) {
      expect(s.place.id.startsWith('ecart')).toBe(false);
      expect(detourKm(distanceKm, ANNECY, s.place, CHAMONIX)).toBeLessThan(15);
    }
  });

  it('les trajets de départ et de retour entrent dans le bilan carbone', () => {
    const hotel = lodging('hotel', destinationPoint(VILLEFRANCHE, 5, 200), ['2026-10-06', '2026-10-07']);
    const without = run();
    const withLodging = run({ lodgings: [hotel] });
    expect(withLodging.trip.carbon.distanceKm).toBeGreaterThan(without.trip.carbon.distanceKm);
    expect(withLodging.trip.carbon.totalKgCo2e).toBeGreaterThan(0);
  });

  it('sans hébergement : ni départ, ni retour, ni hébergement de jour', () => {
    const { trip: t } = run();
    for (const d of t.days) {
      expect(d).not.toHaveProperty('departure');
      expect(d).not.toHaveProperty('returnTravelMin');
      expect(d).not.toHaveProperty('startLodgingId');
      expect(d.steps[0]).not.toHaveProperty('travelFromPreviousMin');
    }
  });
});

describe('generateTrip : carbone et carburant', () => {
  it('transports en commun : planning et bilan carbone non nuls', () => {
    const { trip: t } = run({ mode: 'transit', fuelType: undefined });
    expect(placeIds(t).length).toBeGreaterThan(0);
    expect(t.carbon.totalKgCo2e).toBeGreaterThan(0);
    expect(t.carbon.byMode.walk).toBe(0);
    expect(t.carbon.byMode.bike).toBe(0);
    expect(t).not.toHaveProperty('fuelCost');
  });

  it('voiture : coût carburant dans la monnaie du pays, consommation par défaut 6,5 L/100 km', () => {
    const { trip: t } = run({}, { fuel: { currency: 'PLN', prices: { diesel: { average: 5.554 } } } });
    expect(t.fuelConsumption).toBe(6.5);
    expect(t.fuelCost.currency).toBe('PLN');
    expect(t.fuelCost.amount).toBeCloseTo((t.carbon.distanceKm * 6.5 * 5.554) / 100, 0);
  });

  it('signale l\'absence de prix du carburant', () => {
    const { warnings } = run({}, { fuel: null });
    expect(warnings).toContainEqual({ code: 'no_fuel_price' });
  });
});
