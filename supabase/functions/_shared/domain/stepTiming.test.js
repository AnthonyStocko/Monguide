import { describe, expect, it } from 'vitest';
import { fitsStepType, infeasibility, isFixed, isFixedForTracking, legMinutes, minimumFor } from './stepTiming.js';
import { museum, park, personal, place, restaurant, rules, standardDay, step } from './testing/dayFixture.js';

const ctx = (day) => ({ day, countryCode: 'FR' });
const m = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

describe('stepTiming', () => {
  it('points fixes : verrouillée, horaire personnalisé, terminée ou passée', () => {
    const s = step('a', 'culture', '10:00', '11:00', museum);
    expect(isFixed(s)).toBe(false);
    expect(isFixed({ ...s, customTime: true })).toBe(true);
    expect(isFixed({ ...s, status: 'done' })).toBe(true);
    expect(isFixed(personal('p', '10:00', '11:00'))).toBe(true);
    // Suivi en temps réel : un horaire personnalisé peut être décalé (en le signalant).
    expect(isFixedForTracking({ ...s, customTime: true })).toBe(false);
  });

  it('trajet nul si une étape est sans lieu ; minimum de l\'activité', () => {
    const a = step('a', 'culture', '10:00', '11:00', museum);
    expect(legMinutes(a, step('b', 'relax', '12:00', '13:00', null), 'walk', rules)).toBe(0);
    expect(legMinutes(a, step('c', 'outdoor', '12:00', '13:00', park), 'walk', rules)).toBeGreaterThan(0);
    expect(minimumFor(a, rules)).toBe(60);
    expect(minimumFor(personal('p', '10:00', '10:10'), rules)).toBe(1);
  });

  it('le déjeuner accepte un restaurant ou un marché', () => {
    expect(fitsStepType(restaurant, 'lunch')).toBe(true);
    expect(fitsStepType(place('mk', 'market', 0), 'lunch')).toBe(true);
    expect(fitsStepType(museum, 'lunch')).toBe(false);
  });

  it('faisabilité : 19h00, 21h00, minimum, fermeture, pluie', () => {
    const day = standardDay();
    const lunch = day.steps[1];
    expect(infeasibility(lunch, m('12:30'), m('13:45'), ctx(day), rules)).toEqual([]);
    expect(infeasibility(lunch, m('13:40'), m('14:55'), ctx(day), rules)).toEqual(['CLOSED']);
    expect(infeasibility(lunch, m('12:30'), m('13:00'), ctx(day), rules)).toEqual(['TOO_SHORT']);
    const outdoor = day.steps[2];
    expect(infeasibility(outdoor, m('19:30'), m('21:30'), ctx(day), rules)).toEqual(['LATE_START', 'LATE_END']);
    const rainy = { ...day, weatherAvailable: true, weather: { 14: 80, 15: 90 } };
    expect(infeasibility(outdoor, m('14:30'), m('16:00'), ctx(rainy), rules)).toEqual(['RAIN']);
    expect(infeasibility(day.steps[0], m('14:30'), m('16:00'), ctx(rainy), rules)).toEqual([]); // musée : intérieur
  });
});
