import { describe, expect, it } from 'vitest';
import { insertStep, stepsConflict } from './insertStep.js';
import { FRIEND_KM, personal, rules, standardDay } from './testing/dayFixture.js';

const ctx = { mode: 'walk' };

describe('insertStep', () => {
  it("insère l'étape personnelle à son horaire, dans l'ordre chronologique", () => {
    const day = standardDay();
    const p = personal('p', '14:00', '16:00', { km: FRIEND_KM });
    const out = insertStep(day.steps, p, ctx, rules);
    expect(out.index).toBe(2);
    expect(out.steps.map((s) => s.id)).toEqual(['culture', 'lunch', 'p', 'outdoor', 'relax']);
    expect(day.steps).toHaveLength(4); // entrée non modifiée
  });

  it('insère en fin de journée', () => {
    const out = insertStep(standardDay().steps, personal('p', '20:00', '21:00'), ctx, rules);
    expect(out.index).toBe(4);
  });

  it('refuse le chevauchement de deux étapes personnelles (point fixe)', () => {
    const steps = insertStep(standardDay().steps, personal('p1', '14:00', '16:00'), ctx, rules).steps;
    expect(insertStep(steps, personal('p2', '15:30', '17:00'), ctx, rules)).toEqual({ error: { code: 'OVERLAP_FIXED', stepId: 'p1' } });
  });

  it('refuse un chevauchement avec un horaire personnalisé, trajet compris', () => {
    const day = standardDay();
    day.steps[2] = { ...day.steps[2], customTime: true }; // parc 14:30-16:00, fixe
    // Le proche (0,9 km) est à 10 min du parc : finir à 14:25 ne laisse pas le temps d'y aller.
    expect(insertStep(day.steps, personal('p', '13:50', '14:25', { km: FRIEND_KM }), ctx, rules).error).toEqual({ code: 'OVERLAP_FIXED', stepId: 'outdoor' });
    expect(insertStep(day.steps, personal('p', '13:50', '14:20', { km: FRIEND_KM }), ctx, rules).error).toBeUndefined();
  });

  it('refuse une fin avant le début', () => {
    expect(insertStep([], personal('p', '15:00', '14:00'), ctx, rules)).toEqual({ error: { code: 'INVALID' } });
  });

  it('remplace une étape de même identifiant (modification)', () => {
    const steps = insertStep(standardDay().steps, personal('p', '14:00', '16:00'), ctx, rules).steps;
    const out = insertStep(steps, personal('p', '20:00', '21:00'), ctx, rules);
    expect(out.steps.map((s) => s.id)).toEqual(['culture', 'lunch', 'outdoor', 'relax', 'p']);
  });

  it('stepsConflict tient compte du trajet', () => {
    const [a, b] = [personal('a', '10:00', '11:00', { km: 0 }), personal('b', '11:05', '12:00', { km: 0.9 })];
    expect(stepsConflict(a, b, 'walk', rules)).toBe(true); // 15 min de marche
    expect(stepsConflict(a, { ...b, start: '11:15' }, 'walk', rules)).toBe(false);
  });
});
