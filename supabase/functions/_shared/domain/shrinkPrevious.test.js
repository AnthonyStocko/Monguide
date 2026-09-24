import { describe, expect, it } from 'vitest';
import { insertStep } from './insertStep.js';
import { shrinkPrevious } from './shrinkPrevious.js';
import { FRIEND_KM, personal, rules, standardDay } from './testing/dayFixture.js';

const ctx = { mode: 'walk' };

describe('shrinkPrevious', () => {
  it("raccourcit l'étape précédente qui chevauche l'étape personnelle (trajet compris)", () => {
    // Proche à 0,9 km du restaurant (0,3 km) : 10 min de marche ; déjeuner 12:30-13:45.
    const { steps, index } = insertStep(standardDay().steps, personal('p', '13:50', '15:00', { km: FRIEND_KM }), ctx, rules);
    const out = shrinkPrevious(steps, index, ctx, rules);
    expect(out.steps[1]).toMatchObject({ id: 'lunch', start: '12:30', end: '13:40' });
    expect(out.changes).toEqual([{ kind: 'shortened', stepId: 'lunch', name: 'Le Bouchon', from: { start: '12:30', end: '13:45' }, to: { start: '12:30', end: '13:40' }, customTime: false }]);
    expect(out.infeasible).toEqual([]);
  });

  it('déclare infaisable une étape qui passerait sous son minimum', () => {
    // Déjeuner (minimum 60 min) jusqu'à 13:05 au plus : 35 min seulement.
    const { steps, index } = insertStep(standardDay().steps, personal('p', '13:15', '15:00', { km: FRIEND_KM }), ctx, rules);
    const out = shrinkPrevious(steps, index, ctx, rules);
    expect(out.infeasible).toEqual([{ stepId: 'lunch', reasons: ['TOO_SHORT'] }]);
    expect(out.steps[1]).toBe(steps[1]);
  });

  it('ne modifie rien sans chevauchement', () => {
    const { steps, index } = insertStep(standardDay().steps, personal('p', '14:00', '16:00', { km: FRIEND_KM }), ctx, rules);
    const out = shrinkPrevious(steps, index, ctx, rules);
    expect(out.changes).toEqual([]);
    expect(out.steps).toEqual(steps);
  });

  it("ne raccourcit jamais un point fixe ; la borne suivante devient l'étape fixe", () => {
    const day = standardDay();
    day.steps[0] = { ...day.steps[0], customTime: true, start: '10:00', end: '11:30' };
    const { steps, index } = insertStep(day.steps, personal('p', '11:45', '13:00'), ctx, rules);
    // Le déjeuner (12:30) commence après l'étape personnelle : il n'est pas concerné ici.
    const out = shrinkPrevious(steps, index, ctx, rules);
    expect(out.steps[0]).toEqual(day.steps[0]);
    expect(out.changes).toEqual([]);
  });

  it('une étape infaisable ne sert plus de borne : la précédente est vérifiée par rapport à la suivante conservée', () => {
    const day = standardDay();
    // Musée 10:00-11:30 puis temps libre 11:30-12:00, étape personnelle à 11:40.
    day.steps.splice(1, 0, { id: 'free', type: 'relax', start: '11:30', end: '12:00', indoor: null, status: 'planned', customTime: false, locked: false, badges: ['free_time'] });
    const { steps, index } = insertStep(day.steps, personal('p', '11:40', '12:20'), ctx, rules);
    const out = shrinkPrevious(steps, index, ctx, rules);
    expect(out.infeasible).toEqual([{ stepId: 'free', reasons: ['TOO_SHORT'] }]);
    expect(out.steps[0]).toMatchObject({ id: 'culture', end: '11:30' });
  });
});
