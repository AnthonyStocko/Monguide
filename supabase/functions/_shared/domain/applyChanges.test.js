import { describe, expect, it } from 'vitest';
import { applyChanges } from './applyChanges.js';
import { place, restaurant, rules, standardDay, step, trip } from './testing/dayFixture.js';

describe('applyChanges', () => {
  it('remplacement : le nouveau lieu sort de la réserve, l\'ancien y retourne', () => {
    const open = place('open', 'restaurant', 0.4);
    const t = trip([standardDay()], [open]);
    const day = { ...t.days[0], steps: t.days[0].steps.map((s) => (s.id === 'lunch' ? { ...s, place: open } : s)) };
    const out = applyChanges(t, { dayIndex: 0, day, changes: [{ kind: 'replaced', stepId: 'lunch', fromPlace: restaurant, toPlace: open }] }, {}, rules);
    expect(out.candidates.map((c) => c.id)).toEqual(['restaurant']);
    expect(out.days[0].steps[1].place.id).toBe('open');
  });

  it('report : remplace un temps libre du jour cible, ou supprimé au choix', () => {
    const day2 = { date: '2026-10-07', weatherAvailable: false, steps: [step('free', 'relax', '17:30', '19:00', null)] };
    const t = trip([standardDay(), day2]);
    const relax = t.days[0].steps[3];
    const proposal = {
      dayIndex: 0,
      day: { ...t.days[0], steps: t.days[0].steps.slice(0, 3) },
      changes: [{ kind: 'postponed', stepId: 'relax', step: relax, target: { dayIndex: 1, date: '2026-10-07', start: '17:30', end: '19:00', freeStepId: 'free' } }]
    };
    const postponed = applyChanges(t, proposal, {}, rules);
    expect(postponed.days[1].steps).toEqual([expect.objectContaining({ id: 'relax', start: '17:30', end: '19:00', badges: [], status: 'planned' })]);
    const removed = applyChanges(t, proposal, { relax: 'removed' }, rules);
    expect(removed.days[1].steps[0].id).toBe('free');
    expect(removed.candidates.map((c) => c.id)).toEqual(['garden']);
  });

  it('un lieu encore utilisé dans le séjour ne retourne jamais dans la réserve', () => {
    const t = trip([standardDay()], []);
    const out = applyChanges(t, { dayIndex: 0, day: t.days[0], changes: [{ kind: 'removed', stepId: 'x', step: { place: restaurant, type: 'lunch' }, target: null }] }, {}, rules);
    expect(out.candidates).toEqual([]);
  });
});
