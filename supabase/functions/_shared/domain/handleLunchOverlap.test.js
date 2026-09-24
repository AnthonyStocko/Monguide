import { describe, expect, it } from 'vitest';
import { handleLunchOverlap } from './handleLunchOverlap.js';
import { insertStep } from './insertStep.js';
import { personal, rules, standardDay } from './testing/dayFixture.js';

const ctx = { mode: 'walk' };
const withPersonal = (p) => insertStep(standardDay().steps, p, ctx, rules);

describe('handleLunchOverlap', () => {
  it("propose de supprimer le déjeuner couvert par l'étape personnelle (12:00-14:00)", () => {
    const { steps, index } = withPersonal(personal('p', '12:00', '14:00', { title: 'Repas chez des amis' }));
    const out = handleLunchOverlap(steps, index, ctx, rules);
    expect(out.steps.map((s) => s.id)).toEqual(['culture', 'p', 'outdoor', 'relax']);
    expect(out.index).toBe(1);
    expect(out.changes).toEqual([expect.objectContaining({ kind: 'removed', stepId: 'lunch', reason: 'LUNCH_COVERED', name: 'Le Bouchon', from: { start: '12:30', end: '13:45' } })]);
  });

  it('ne supprime pas un déjeuner à peine chevauché (il sera raccourci ou décalé)', () => {
    const { steps, index } = withPersonal(personal('p', '13:30', '15:00'));
    const out = handleLunchOverlap(steps, index, ctx, rules);
    expect(out.changes).toEqual([]);
    expect(out.steps).toBe(steps);
  });

  it('ne touche jamais un déjeuner à horaire personnalisé', () => {
    const day = standardDay();
    day.steps[1] = { ...day.steps[1], customTime: true };
    const { steps } = insertStep(day.steps.filter((s) => s.id !== 'lunch'), personal('p', '12:00', '14:00'), ctx, rules);
    const withLunch = [steps[0], day.steps[1], ...steps.slice(1)];
    expect(handleLunchOverlap(withLunch, 2, ctx, rules).changes).toEqual([]);
  });

  it('sans déjeuner dans la journée : rien à faire', () => {
    const day = standardDay();
    const { steps, index } = insertStep(day.steps.filter((s) => s.type !== 'lunch'), personal('p', '12:00', '14:00'), ctx, rules);
    expect(handleLunchOverlap(steps, index, ctx, rules).changes).toEqual([]);
  });
});
