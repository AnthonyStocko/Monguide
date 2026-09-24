import { describe, expect, it } from 'vitest';
import { checkDayInvariants } from './checkDayInvariants.js';
import { personal, rules, standardDay, trip } from './testing/dayFixture.js';

const ctx = { mode: 'walk' };

describe('checkDayInvariants', () => {
  it('accepte la journée type', () => {
    const day = standardDay();
    expect(checkDayInvariants(day, { ...ctx, before: day, trip: trip([day]) }, rules)).toEqual([]);
  });

  it('détecte le format, une fin avant le début et un chevauchement trajet compris', () => {
    const day = standardDay();
    expect(checkDayInvariants({ ...day, steps: [{ ...day.steps[0], start: '9:00' }] }, ctx, rules)).toEqual(['FORMAT:culture']);
    expect(checkDayInvariants({ ...day, steps: [{ ...day.steps[0], end: '09:00' }] }, ctx, rules)).toEqual(['END_BEFORE_START:culture']);
    // Déjeuner à 11:32 : 2 min après le musée, 5 min de marche nécessaires.
    const overlap = { ...day, steps: [day.steps[0], { ...day.steps[1], start: '11:32' }] };
    expect(checkDayInvariants(overlap, ctx, rules)).toEqual(['OVERLAP:culture->lunch']);
  });

  it('détecte un point fixe déplacé ou supprimé, et un ordre modifié', () => {
    const before = standardDay();
    before.steps.splice(2, 0, personal('p', '14:00', '14:20'));
    const moved = { ...before, steps: before.steps.map((s) => (s.id === 'p' ? { ...s, start: '14:05', end: '14:25' } : s)) };
    expect(checkDayInvariants(moved, { ...ctx, before }, rules)).toContain('FIXED_MOVED:p');
    const removed = { ...before, steps: before.steps.filter((s) => s.id !== 'p') };
    expect(checkDayInvariants(removed, { ...ctx, before }, rules)).toContain('FIXED_REMOVED:p');
    const swapped = { ...before, steps: [before.steps[1], { ...before.steps[0], start: '14:30', end: '15:00' }] };
    expect(checkDayInvariants(swapped, { ...ctx, before: { ...before, steps: before.steps.slice(0, 2) } }, rules)).toContain('ORDER:lunch,culture');
  });

  it("détecte un lieu présent deux fois dans le séjour", () => {
    const a = standardDay('2026-10-06');
    const b = standardDay('2026-10-07');
    expect(checkDayInvariants(a, { ...ctx, trip: trip([a, b]) }, rules)).toContain('DUPLICATE_PLACE:museum');
  });
});
