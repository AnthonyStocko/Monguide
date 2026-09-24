import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { destinationPoint } from './geo.js';
import { scheduleDay } from './scheduleDay.js';

const HOME = { lat: 45.99, lon: 4.72 };
const at = (km, bearing, category = 'museum', name = 'Lieu') => ({ id: `${km}-${bearing}`, name, category, ...destinationPoint(HOME, km, bearing) });
const step = (slotStart, place) => ({ id: slotStart, type: 'x', slotStart, badges: [], ...(place ? { place } : {}) });

describe('scheduleDay', () => {
  it('place chaque étape à l\'heure du gabarit, pour sa durée conseillée', () => {
    const { steps } = scheduleDay([step('10:00', at(1, 0, 'museum')), step('14:30', at(2, 90, 'park'))], { from: null, to: null, mode: 'car' }, RULES);
    expect(steps.map((s) => [s.start, s.end])).toEqual([
      ['10:00', '11:30'],
      ['14:30', '16:00']
    ]);
  });

  it('raccourcit une étape pour laisser le temps du trajet, sans passer sous la durée minimale', () => {
    // Château (120 min conseillées, 75 min minimum) à 10h00, étape suivante à 11h30 à 10 km à pied.
    const { steps } = scheduleDay(
      [step('10:00', at(0, 0, 'monument', 'Château de Test')), step('11:30', at(2, 0, 'museum'))],
      { from: null, to: null, mode: 'walk' },
      RULES
    );
    expect(steps[0].end).toBe('11:15'); // 75 min minimum
    expect(steps[1].travelFromPreviousMin).toBe(32); // 2,6 km à 5 km/h
    expect(steps[1].start).toBe('11:47'); // repoussée : fin + trajet
  });

  it('calcule le départ de l\'hébergement et le retour', () => {
    const r = scheduleDay([step('10:00', at(5, 0))], { from: HOME, to: HOME, mode: 'car' }, RULES);
    expect(r.departure).toEqual({ time: '09:52', travelMin: 8 }); // 6,5 km à 50 km/h
    expect(r.returnTravelMin).toBe(8);
    expect(r.legsKm).toHaveLength(2);
  });

  it('ne donne pas de trajet à un temps libre', () => {
    const { steps } = scheduleDay([step('10:00', at(1, 0)), step('12:30', null), step('14:30', at(1, 180, 'park'))], { from: null, to: null, mode: 'walk' }, RULES);
    expect(steps[1]).toMatchObject({ start: '12:30', end: '13:30', travelFromPreviousMin: 0 });
  });

  it('abandonne une étape qui commencerait après 19h00', () => {
    const { steps } = scheduleDay([step('17:30', at(0, 0, 'monument', 'Château')), step('19:10', at(0.1, 0, 'park'))], { from: null, to: null, mode: 'car' }, RULES);
    expect(steps).toHaveLength(1);
  });
});
