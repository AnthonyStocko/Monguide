import { describe, expect, it } from 'vitest';
import { compactDay } from './compactDay.js';
import { RULES } from './config/rules.js';
import { destinationPoint } from './geo.js';
import { scheduleDay } from './scheduleDay.js';
import { toMinutes } from './time.js';

const C = { lat: 50.8467, lon: 4.3525 };
const place = (id, category, km, bearing, extra = {}) => ({ id, name: id, category, ...destinationPoint(C, km, bearing), source: 't', certified: true, indoor: category === 'museum' ? true : null, ...extra });
const step = (id, type, slotStart, p, extra = {}) => ({ id, type, slotStart, place: p, indoor: p?.indoor ?? null, badges: [], ...extra });
const route = { from: null, to: null, mode: 'walk' };
const gaps = (steps) =>
  steps.slice(1).map((s, i) => toMinutes(s.start) - (s.travelFromPreviousMin ?? 0) - toMinutes(steps[i].end));

/** Matinée : un monument (45 min) à 10:00, déjeuner à 12:30 ; après-midi : visite à 14:30, soir à 17:30, dîner. */
function day() {
  return [
    step('m', 'culture', '10:00', place('monument', 'monument', 0.2, 0)),
    step('l', 'lunch', '12:30', place('resto', 'restaurant', 0.3, 90)),
    step('o', 'outdoor', '14:30', place('parc', 'park', 0.4, 180)),
    step('r', 'relax', '17:30', place('musee-soir', 'museum', 0.3, 270)),
    step('d', 'dinner', '19:30', place('diner', 'restaurant', 0.2, 300))
  ];
}
const ctx = (extra = {}) => ({
  ...route,
  candidates: [place('musee-a', 'museum', 0.3, 30), place('eglise', 'monument', 0.25, 60, { kind: 'church' }), place('musee-b', 'museum', 0.35, 120)],
  fits: () => true,
  makeStep: (p) => step(`add-${p.id}`, p.category === 'museum' ? 'culture' : 'outdoor', '10:00', p),
  lunchFrom: '12:30',
  dinnerFrom: '19:00',
  ...extra
});

describe('compactDay', () => {
  it('sans compaction : des trous de plus d’une heure', () => {
    const before = scheduleDay(day(), route, RULES).steps;
    expect(Math.max(...gaps(before))).toBeGreaterThan(60);
  });

  it('trou de 2 h comblé : plus aucun écart de plus de rules.day.maxGapMin', () => {
    const { steps, added } = compactDay(day(), ctx(), RULES);
    const after = scheduleDay(steps, route, RULES).steps;
    expect(Math.max(...gaps(after))).toBeLessThanOrEqual(RULES.day.maxGapMin);
    expect(added.length).toBeGreaterThan(0);
    // Repas jamais avancés avant leur heure, jamais retardés.
    expect(after.find((s) => s.id === 'l').start).toBe('12:30');
    expect(after.find((s) => s.id === 'd').start).toBe('19:30');
  });

  it('sans candidat : la visite précédente est allongée (durée maximale), puis l’étape du soir avancée', () => {
    const { steps, added } = compactDay(day(), ctx({ candidates: [] }), RULES);
    const after = scheduleDay(steps, route, RULES).steps;
    expect(added).toEqual([]);
    const monument = after.find((s) => s.id === 'm');
    expect(toMinutes(monument.end) - toMinutes(monument.start)).toBeGreaterThan(45);
    expect(toMinutes(after.find((s) => s.id === 'r').start)).toBeLessThan(toMinutes('17:30'));
    // Le déjeuner ne part pas avant le début de sa plage : un écart peut rester avant lui.
    expect(after.find((s) => s.id === 'l').start).toBe('12:30');
  });

  it('respecte ctx.fits (ex. lieu en extérieur après la tombée de la nuit refusé)', () => {
    const outdoorOnly = [place('parc-soir', 'park', 0.3, 30)];
    const fits = (p, start) => !(p.category === 'park' && start >= toMinutes('16:10'));
    const { added } = compactDay(day(), ctx({ candidates: outdoorOnly, fits }), RULES);
    const after = scheduleDay(compactDay(day(), ctx({ candidates: outdoorOnly, fits }), RULES).steps, route, RULES).steps;
    const parc = after.find((s) => s.place?.id === 'parc-soir');
    if (parc) expect(toMinutes(parc.start)).toBeLessThan(toMinutes('16:10'));
    expect(added.length).toBeLessThanOrEqual(1);
  });

  it('temps libre voulu : ajouté une fois, avant le soir, avec son lieu', () => {
    const lodging = { id: 'lodging:1', name: 'Hôtel', category: 'personal', source: 'lodging', ...destinationPoint(C, 0.1, 0), certified: false, indoor: null };
    const freeTime = () => step('free', 'relax', '10:00', lodging, { badges: ['free_time'] });
    const { steps } = compactDay(day(), ctx({ freeTime }), RULES);
    const after = scheduleDay(steps, route, RULES).steps;
    const free = after.filter((s) => s.badges.includes('free_time'));
    expect(free).toHaveLength(1);
    expect(free[0].place.id).toBe('lodging:1');
    expect(after.indexOf(free[0])).toBeLessThan(after.findIndex((s) => s.id === 'd'));
  });
});
