import { describe, expect, it } from 'vitest';
import { insertStep } from './insertStep.js';
import { shiftFollowing } from './shiftFollowing.js';
import { isFixedForTracking } from './stepTiming.js';
import { travelMinutes } from './travel.js';
import { FRIEND_KM, garden, park, personal, rules, standardDay } from './testing/dayFixture.js';

const ctx = { mode: 'walk' };

describe('shiftFollowing', () => {
  it("décale au plus tôt après la fin de l'étape personnelle + trajet (14h30 -> 16h10)", () => {
    const p = personal('p', '14:00', '16:00', { km: FRIEND_KM });
    expect(travelMinutes(p.place, park, 'walk', rules)).toBe(10);
    const { steps, index } = insertStep(standardDay().steps, p, ctx, rules);
    const out = shiftFollowing(steps, index, ctx, rules);
    const leg = travelMinutes(park, garden, 'walk', rules);
    expect(out.steps.find((s) => s.id === 'outdoor')).toMatchObject({ start: '16:10', end: '17:40' });
    expect(out.steps.find((s) => s.id === 'relax')).toMatchObject({ start: `17:${40 + leg}`, end: `19:${10 + leg}` });
    expect(out.changes.map((c) => [c.kind, c.stepId])).toEqual([
      ['shifted', 'outdoor'],
      ['shifted', 'relax']
    ]);
    expect(out.infeasible).toEqual([]);
  });

  it('déclare infaisable une étape repoussée après 19h00', () => {
    const { steps, index } = insertStep(standardDay().steps, personal('p', '14:20', '17:30', { km: FRIEND_KM }), ctx, rules);
    const out = shiftFollowing(steps, index, ctx, rules);
    expect(out.steps.find((s) => s.id === 'outdoor')).toMatchObject({ start: '17:40', end: '19:10' });
    expect(out.infeasible).toEqual([{ stepId: 'relax', reasons: ['LATE_START'] }]);
  });

  it('ne chevauche jamais un point fixe : raccourcit, sinon infaisable', () => {
    const day = standardDay();
    day.steps[3] = { ...day.steps[3], customTime: true, start: '17:30', end: '19:00' };
    const { steps, index } = insertStep(day.steps, personal('p', '14:00', '16:00', { km: FRIEND_KM }), ctx, rules);
    const out = shiftFollowing(steps, index, ctx, rules);
    const leg = travelMinutes(park, garden, 'walk', rules);
    // Parc 16:10, doit finir avant 17:30 - trajet : 16:10-17:25 (75 min >= 45).
    expect(out.steps.find((s) => s.id === 'outdoor')).toMatchObject({ start: '16:10', end: `17:${30 - leg}` });
    expect(out.steps.find((s) => s.id === 'relax')).toMatchObject({ start: '17:30', end: '19:00' });

    const tight = insertStep(day.steps, personal('p', '14:00', '16:50', { km: FRIEND_KM }), ctx, rules);
    const out2 = shiftFollowing(tight.steps, tight.index, ctx, rules);
    expect(out2.infeasible).toEqual([{ stepId: 'outdoor', reasons: ['TOO_SHORT'] }]);
  });

  it("n'avance jamais une étape", () => {
    const { steps, index } = insertStep(standardDay().steps, personal('p', '11:40', '12:00'), ctx, rules);
    expect(shiftFollowing(steps, index, ctx, rules).changes).toEqual([]);
  });

  it('suivi : décale depuis un curseur (heure actuelle) et signale un horaire personnalisé', () => {
    const day = standardDay();
    day.steps[2] = { ...day.steps[2], customTime: true };
    day.steps[0] = { ...day.steps[0], status: 'done' };
    // Musée validé à 14:00 : le déjeuner 12:30 est dépassé.
    const out = shiftFollowing(day.steps, 0, ctx, rules, { fixed: isFixedForTracking, cursor: { end: 14 * 60, step: day.steps[0] } });
    const lunch = out.steps[1];
    const leg = travelMinutes(day.steps[0].place, lunch.place, 'walk', rules);
    expect(lunch).toMatchObject({ start: `14:0${leg}` });
    expect(out.changes.find((c) => c.stepId === 'outdoor')).toMatchObject({ kind: 'shifted', customTime: true, from: { start: '14:30', end: '16:00' } });
  });
});
