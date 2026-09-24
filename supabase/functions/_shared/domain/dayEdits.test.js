import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { applyTiming, checkDay, recomputeTravel } from './dayEdits.js';
import { destinationPoint } from './geo.js';

const HOME = { lat: 45.99, lon: 4.72 };
const at = (id, km, bearing, category = 'museum') => ({ id, name: id, category, ...destinationPoint(HOME, km, bearing), indoor: category === 'museum' });
const step = (id, place, start, end) => ({ id, type: 'culture', place, start, end, badges: [] });
const day = () => ({
  date: '2026-10-06',
  weatherAvailable: false,
  steps: [step('a', at('a', 0.5, 0), '10:00', '11:30'), step('b', at('b', 1, 90, 'park'), '12:30', '13:45'), step('c', at('c', 1.5, 180, 'park'), '14:30', '16:00')]
});

describe('applyTiming', () => {
  it('modifie une étape et la marque "horaire personnalisé"', () => {
    const d = applyTiming(day(), 0, { start: '10:15', end: '11:45' });
    expect(d.steps[0]).toMatchObject({ start: '10:15', end: '11:45', customTime: true });
    expect(d.steps[1]).toMatchObject({ start: '12:30', end: '13:45' });
    expect(d.steps[1].customTime).toBeUndefined();
  });

  it('"Décaler aussi les étapes suivantes" décale toute la fin de journée du même écart', () => {
    const d = applyTiming(day(), 0, { start: '10:00', end: '12:40', shiftFollowing: true });
    expect(d.steps.map((s) => [s.start, s.end])).toEqual([
      ['10:00', '12:40'],
      ['13:40', '14:55'],
      ['15:40', '17:10']
    ]);
    expect(checkDay(d, { mode: 'walk', countryCode: 'FR' }, RULES).b ?? []).not.toContainEqual(expect.objectContaining({ code: 'OVERLAP_PREVIOUS' }));
  });
});

describe('checkDay', () => {
  it('revérifie les horaires décalés, y compris la règle des 19h00', () => {
    const d = applyTiming(day(), 0, { start: '10:00', end: '16:10', shiftFollowing: true }); // écart de 280 min
    const warnings = checkDay(d, { mode: 'walk', countryCode: 'FR' }, RULES);
    expect(warnings.c).toContainEqual({ code: 'STARTS_TOO_LATE', latest: '19:00' });
    expect(d.steps[2].start).toBe('19:10');
  });
});

describe('recomputeTravel', () => {
  it('recalcule les trajets, le départ et le retour depuis les hébergements', () => {
    const trip = { mode: 'walk', lodgings: [{ id: 'h', address: 'Hôtel', ...HOME, nights: [] }] };
    const d = recomputeTravel({ ...day(), startLodgingId: 'h', endLodgingId: 'h' }, trip, RULES);
    expect(d.steps[0].travelFromPreviousMin).toBe(8); // 0,65 km à pied depuis l'hôtel
    expect(d.departure).toEqual({ time: '09:52', travelMin: 8 });
    expect(d.returnTravelMin).toBeGreaterThan(0);
    const noLodging = recomputeTravel(day(), { mode: 'walk', lodgings: [] }, RULES);
    expect(noLodging).not.toHaveProperty('departure');
    expect(noLodging.steps[0]).not.toHaveProperty('travelFromPreviousMin');
  });
});
