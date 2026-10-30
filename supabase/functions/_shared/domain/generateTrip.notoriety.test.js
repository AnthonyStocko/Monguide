import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { destinationPoint } from './geo.js';
import { generateTrip } from './generateTrip.js';
import { scheduleDay } from './scheduleDay.js';
import { toMinutes } from './time.js';

const BOURSE = { lat: 50.8483, lon: 4.3498 };
const DATES = ['2026-12-11', '2026-12-12', '2026-12-13'];

let seq = 0;
const makeId = () => `id-${(seq += 1)}`;

function place(id, category, km, bearing, extra = {}) {
  return {
    id,
    name: id,
    category,
    ...destinationPoint(BOURSE, km, bearing),
    source: 'test',
    certified: category === 'museum' || category === 'monument',
    indoor: category === 'museum' || category === 'restaurant' ? true : category === 'monument' ? null : false,
    ...extra
  };
}

/** Une ville dense : beaucoup de monuments protégés inconnus tout près, quelques lieux célèbres un peu plus loin. */
function brusselsLike() {
  const out = [];
  for (let i = 0; i < 40; i += 1) out.push(place(`inventaire-${i}`, 'monument', 0.03 + i * 0.01, i * 37, { notoriety: 0 }));
  for (let i = 0; i < 12; i += 1) {
    out.push(place(`resto-${i}`, 'restaurant', 0.2 + i * 0.05, i * 30, { food: { regional: false, openingHours: 'Mo-Su 11:30-23:00' } }));
    out.push(place(`parc-${i}`, 'park', 0.5 + i * 0.1, i * 30 + 15));
    out.push(place(`marche-${i}`, 'market', 0.4 + i * 0.1, i * 30 + 5));
  }
  out.push(
    place('grand-place', 'monument', 0.26, 140, { notoriety: 97, notable: true }),
    place('galeries', 'monument', 0.37, 100, { notoriety: 58, notable: true }),
    place('manneken-pis', 'monument', 0.5, 190, { notoriety: 82, notable: true, glance: true, indoor: false }),
    place('mont-des-arts', 'park', 0.9, 130, { notoriety: 55, notable: true, certified: false }),
    place('cathedrale', 'monument', 0.74, 80, { notoriety: 75, notable: true, indoor: true }),
    place('beaux-arts', 'museum', 0.94, 135, { notoriety: 72, notable: true })
  );
  return out;
}

function trip(patch = {}) {
  return {
    schemaVersion: 3,
    id: 'bxl',
    title: 'Bruxelles',
    createdAt: 'x',
    updatedAt: 'x',
    deleted: false,
    destination: { name: 'Bruxelles', countryCode: 'BE', lat: 50.8467, lon: 4.3525, radiusKm: 10 },
    timezone: 'Europe/Brussels',
    currency: 'EUR',
    startDate: DATES[0],
    endDate: DATES[2],
    travelers: 6,
    mode: 'walk',
    profile: 'balanced',
    lunch: 'both',
    dinner: 'restaurant',
    prefs: { vegetarian: false, wheelchair: false },
    lodgings: [{ id: 'l1', address: 'Place de la Bourse', ...BOURSE, nights: DATES.slice(0, 2) }],
    days: [],
    candidates: [],
    ...patch
  };
}

const stepsOf = (t) => t.days.flatMap((d) => d.steps);
const placeIds = (t) => stepsOf(t).map((s) => s.place?.id).filter(Boolean);

describe('generateTrip : notoriété, incontournables, coups d’œil', () => {
  const { trip: generated } = generateTrip({ trip: trip(), places: brusselsLike(), makeId }, RULES);

  it('place tous les lieux célèbres, avec le badge incontournable', () => {
    for (const id of ['grand-place', 'galeries', 'manneken-pis', 'mont-des-arts', 'cathedrale', 'beaux-arts']) {
      const step = stepsOf(generated).find((s) => s.place?.id === id);
      expect(step, id).toBeDefined();
      expect(step.badges, id).toContain('must_see');
    }
  });

  it('Manneken-Pis en coup d’œil : étape courte insérée, badge glance', () => {
    const step = stepsOf(generated).find((s) => s.place?.id === 'manneken-pis');
    expect(step.badges).toContain('glance');
    const minutes = toMinutes(step.end) - toMinutes(step.start);
    expect(minutes).toBeGreaterThanOrEqual(RULES.durations.glance.minimumMin);
    expect(minutes).toBeLessThanOrEqual(15);
  });

  it('les lieux célèbres passent avant les monuments inconnus les plus proches', () => {
    const culture = generated.days.map((d) => d.steps.find((s) => s.type === 'culture')?.place?.id);
    expect(culture.every((id) => !id.startsWith('inventaire'))).toBe(true);
  });

  it('les étapes insérées ne retardent pas le déjeuner ni le dîner au-delà de la tolérance', () => {
    for (const day of generated.days) {
      const lunch = day.steps.find((s) => s.type === 'lunch');
      const dinner = day.steps.find((s) => s.type === 'dinner');
      expect(toMinutes(lunch.start)).toBeLessThanOrEqual(toMinutes('12:30') + RULES.notoriety.mustSee.delayToleranceMin);
      expect(toMinutes(dinner.start)).toBeLessThanOrEqual(toMinutes('19:30') + RULES.notoriety.mustSee.delayToleranceMin);
      // Aucun chevauchement : chaque étape commence après la fin de la précédente et le trajet.
      day.steps.forEach((s, i) => {
        if (i) expect(toMinutes(s.start)).toBeGreaterThanOrEqual(toMinutes(day.steps[i - 1].end) + (s.travelFromPreviousMin ?? 0));
      });
    }
  });

  it('aucun lieu répété', () => {
    const ids = placeIds(generated);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pluie annoncée : un incontournable n’est jamais remplacé par l’arbitrage météo', () => {
    const rain = Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h).padStart(2, '0'), 95]));
    const weatherDays = DATES.map((date) => ({ date, available: true, hours: Object.entries(rain).map(([hour, p]) => ({ hour: `${hour}:00`, precipitationProbability: p })) }));
    const { trip: wet } = generateTrip({ trip: trip(), places: brusselsLike(), weatherDays, makeId }, RULES);
    const kept = stepsOf(wet).filter((s) => s.badges.includes('must_see'));
    expect(kept.length).toBeGreaterThanOrEqual(5);
    expect(kept.every((s) => !s.badges.includes('weather_adapted'))).toBe(true);
  });

  it('dîner au restaurant : jamais de parc célèbre de détente trop loin de tout restaurant', () => {
    const farPark = place('parc-celebre', 'park', 4, 300, { notoriety: 95, notable: true });
    const { trip: t } = generateTrip({ trip: trip({ lodgings: [] }), places: [...brusselsLike(), farPark], makeId }, RULES);
    expect(placeIds(t)).not.toContain('parc-celebre');
    expect(stepsOf(t).filter((s) => s.type === 'dinner').every((s) => s.place)).toBe(true);
  });

  it('petite ville sans lieu connu : au moins autant de visites qu’avant, sans incontournable', () => {
    const small = brusselsLike().filter((p) => !p.notable);
    const { trip: t } = generateTrip({ trip: trip(), places: small, makeId }, RULES);
    const visits = stepsOf(t).filter((s) => ['culture', 'outdoor', 'relax'].includes(s.type) && s.place);
    expect(visits.length).toBeGreaterThanOrEqual(9);
    expect(stepsOf(t).some((s) => s.badges.includes('must_see'))).toBe(false);
  });

  it('écarte de la génération les monuments sous le seuil de la destination, gardés dans la réserve', () => {
    // Assez de lieux connus pour remplir les journées (rules.notoriety.threshold.minVisitsPerDay × 3 jours).
    const famous = Array.from({ length: 30 }, (_, i) => place(`connu-${i}`, 'monument', 0.6 + i * 0.03, i * 12, { notoriety: 50 + i }));
    const { trip: t } = generateTrip({ trip: trip(), places: [...brusselsLike(), ...famous], makeId }, RULES);
    expect(placeIds(t).some((id) => id.startsWith('inventaire'))).toBe(false);
    expect(t.candidates.some((p) => p.id.startsWith('inventaire'))).toBe(true);
  });
});

describe('scheduleDay : étape insérée (follow)', () => {
  const step = (id, type, slotStart, p, extra = {}) => ({ id, type, slotStart, place: p, indoor: null, badges: [], ...extra });
  const a = place('a', 'monument', 0.1, 0);
  const g = place('g', 'monument', 0.2, 0, { glance: true });
  const r = place('r', 'restaurant', 0.3, 0);

  it('commence juste après la précédente et ne l’écourte pas', () => {
    const { steps } = scheduleDay(
      [step('a', 'culture', '10:00', a), step('g', 'outdoor', '10:00', g, { follow: true }), step('r', 'lunch', '12:30', r)],
      { from: null, to: null, mode: 'walk' },
      RULES
    );
    expect(steps.map((s) => [s.id, s.start, s.end])).toEqual([
      ['a', '10:00', '10:45'],
      ['g', `10:${45 + steps[1].travelFromPreviousMin}`, steps[1].end],
      ['r', '12:30', '13:45']
    ]);
    expect(toMinutes(steps[1].end) - toMinutes(steps[1].start)).toBe(RULES.durations.glance.recommendedMin);
    expect(steps.every((s) => !('follow' in s))).toBe(true);
  });
});
