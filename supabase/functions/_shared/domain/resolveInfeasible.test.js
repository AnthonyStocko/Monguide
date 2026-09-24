import { describe, expect, it } from 'vitest';
import { findPostponeTarget, resolveInfeasible } from './resolveInfeasible.js';
import { usedPlaceIds } from './replaceStep.js';
import { ctxOf, place, rules, standardDay, step, trip } from './testing/dayFixture.js';

const ctxFor = (t, dayIndex = 0, extra = {}) => ({ ...ctxOf(t, dayIndex), used: usedPlaceIds(t), claims: new Set(), ...extra });

/** Journée où le déjeuner a été repoussé à 14:10 : le restaurant ferme à 14:30. */
function lateLunchTrip(candidates, otherDays = []) {
  const day = standardDay();
  day.steps[1] = { ...day.steps[1], start: '14:10', end: '15:25' };
  day.steps[2] = { ...day.steps[2], start: '15:40', end: '17:10' };
  return trip([day, ...otherDays], candidates);
}

describe('resolveInfeasible', () => {
  it("restaurant décalé après sa fermeture : remplacé par un restaurant ouvert", () => {
    const open = place('open', 'restaurant', 0.4, { name: 'Brasserie de la Gare', food: { regional: false, openingHours: 'Mo-Su 11:30-15:30' } });
    const closed = place('closed', 'restaurant', 0.35, { name: 'Fermé', food: { regional: false, openingHours: 'Mo-Su 19:00-22:00' } });
    const t = lateLunchTrip([closed, open]);
    const ctx = ctxFor(t);
    const out = resolveInfeasible(t.days[0].steps, { stepId: 'lunch', reasons: ['CLOSED'] }, ctx, rules);
    expect(out.change).toMatchObject({ kind: 'replaced', stepId: 'lunch', reason: 'CLOSED', name: 'Brasserie de la Gare', previousName: 'Le Bouchon' });
    expect(out.steps[1]).toMatchObject({ place: { id: 'open' } });
    expect(ctx.used.has('open')).toBe(true);
  });

  it('propose un marché quand aucun restaurant ouvert ne convient', () => {
    const market = place('market', 'market', 0.4, { name: 'Marché couvert', indoor: true });
    const t = lateLunchTrip([market]);
    const out = resolveInfeasible(t.days[0].steps, { stepId: 'lunch', reasons: ['CLOSED'] }, ctxFor(t), rules);
    expect(out.change).toMatchObject({ kind: 'replaced', name: 'Marché couvert' });
  });

  it('sans remplaçant : reporté sur un autre jour ayant un temps libre du même type', () => {
    const day2 = standardDay('2026-10-07');
    day2.steps = day2.steps.map((s) => ({ ...s, id: `d2-${s.id}` }));
    day2.steps[1] = { id: 'd2-free-lunch', type: 'lunch', start: '12:30', end: '14:00', indoor: null, status: 'planned', customTime: false, locked: false, badges: ['free_time'] };
    // Les autres lieux du jour 2 sont distincts de ceux du jour 1.
    day2.steps = day2.steps.map((s) => (s.place ? { ...s, place: { ...s.place, id: `d2-${s.place.id}` } } : s));
    const t = lateLunchTrip([], [day2]);
    const out = resolveInfeasible(t.days[0].steps, { stepId: 'lunch', reasons: ['CLOSED'] }, ctxFor(t), rules);
    expect(out.change).toMatchObject({ kind: 'postponed', stepId: 'lunch', target: { dayIndex: 1, date: '2026-10-07', freeStepId: 'd2-free-lunch', start: '12:30', end: '13:45' } });
    expect(out.steps.map((s) => s.id)).toEqual(['culture', 'outdoor', 'relax']);
  });

  it('sans remplaçant ni jour de report : supprimé', () => {
    const t = lateLunchTrip([]);
    const out = resolveInfeasible(t.days[0].steps, { stepId: 'lunch', reasons: ['CLOSED'] }, ctxFor(t), rules);
    expect(out.change).toMatchObject({ kind: 'removed', stepId: 'lunch', target: null });
    expect(out.steps).toHaveLength(3);
  });

  it("raccourcit d'abord jusqu'au minimum quand c'est suffisant (fin après 21h00)", () => {
    const day = standardDay();
    day.steps[3] = { ...day.steps[3], start: '19:00', end: '21:30' };
    const t = trip([day]);
    const out = resolveInfeasible(t.days[0].steps, { stepId: 'relax', reasons: ['LATE_END'] }, ctxFor(t), rules);
    expect(out.change).toMatchObject({ kind: 'shortened', from: { start: '19:00', end: '21:30' }, to: { start: '19:00', end: '21:00' } });
  });

  it('un temps libre infaisable est supprimé (jamais remplacé ni reporté)', () => {
    const day = standardDay();
    day.steps[3] = step('free', 'relax', '19:30', '20:30', null);
    const t = trip([day], [place('vp', 'viewpoint', 1.9)]);
    const out = resolveInfeasible(t.days[0].steps, { stepId: 'free', reasons: ['LATE_START'] }, ctxFor(t), rules);
    expect(out.change).toMatchObject({ kind: 'removed', stepId: 'free' });
  });

  it("ne choisit jamais un lieu déjà utilisé dans le séjour", () => {
    const t = lateLunchTrip([{ ...t0Restaurant() }]);
    const out = resolveInfeasible(t.days[0].steps, { stepId: 'lunch', reasons: ['CLOSED'] }, ctxFor(t), rules);
    expect(out.change.kind).toBe('removed');
  });
});

function t0Restaurant() {
  // Même identifiant que le restaurant du jour (déjà utilisé).
  return place('restaurant', 'restaurant', 0.3, { food: { regional: true, openingHours: 'Mo-Su 11:00-16:00' } });
}

describe('findPostponeTarget', () => {
  it("trouve une plage libre après la dernière étape d'un autre jour, jamais aujourd'hui ni avant", () => {
    const day2 = { date: '2026-10-07', weatherAvailable: false, steps: [step('d2', 'culture', '10:00', '11:30', place('m2', 'museum', 0.1))] };
    const t = trip([standardDay(), day2]);
    const park = t.days[0].steps[2];
    const target = findPostponeTarget(park, { ...ctxFor(t), dayIndex: 0 }, rules);
    expect(target).toMatchObject({ dayIndex: 1, afterStepId: 'd2' });
    expect(findPostponeTarget(park, { ...ctxFor(t), dayIndex: 0, today: '2026-10-07' }, rules)).toBeNull();
  });
});
