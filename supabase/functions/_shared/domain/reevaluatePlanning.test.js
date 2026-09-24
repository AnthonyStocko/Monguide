import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { fromMinutes } from './time.js';
import { buildDay, rawStep } from './testing/randomDay.js';
import { applyChanges } from './applyChanges.js';
import { checkDayInvariants } from './checkDayInvariants.js';
import { reevaluatePlanning, setStepStatus } from './reevaluatePlanning.js';
import { travelMinutes } from './travel.js';
import { garden, museum, park, place, restaurant, rules, standardDay, step, trip } from './testing/dayFixture.js';

const byId = (day, id) => day.steps.find((s) => s.id === id);
const validate = (t, stepId, now, status = 'done') => setStepStatus(t, 0, stepId, status, now);

describe('setStepStatus', () => {
  it('enregistre le statut et l\'heure, et les efface au retour à "prévue"', () => {
    const done = validate(trip(), 'culture', '11:40');
    expect(byId(done.days[0], 'culture')).toMatchObject({ status: 'done', completedAt: '11:40' });
    const back = setStepStatus(done, 0, 'culture', 'planned');
    expect(byId(back.days[0], 'culture').status).toBe('planned');
    expect(byId(back.days[0], 'culture').completedAt).toBeUndefined();
  });
});

describe('reevaluatePlanning', () => {
  it("retard d'une heure : les créneaux suivants sont décalés", () => {
    // Musée validé à 13:30 au lieu de 11:30 : le déjeuner (12:30) est dépassé ; restaurant ouvert jusqu'à 16:00.
    const day = standardDay();
    day.steps[1] = { ...day.steps[1], place: { ...restaurant, food: { regional: true, openingHours: 'Mo-Su 11:30-16:00' } } };
    const t = validate(trip([day]), 'culture', '13:30');
    const r = reevaluatePlanning(t, 0, 'culture', { now: '13:30', online: false }, rules);
    const leg = travelMinutes(museum, restaurant, 'walk', rules);
    expect(byId(r.day, 'lunch')).toMatchObject({ start: `13:${30 + leg}` });
    expect(r.changes.map((c) => [c.kind, c.stepId])).toEqual([
      ['shifted', 'lunch'],
      ['shifted', 'outdoor']
    ]);
    expect(r.changes.find((c) => c.stepId === 'lunch').from).toEqual({ start: '12:30', end: '13:45' });
    expect(checkDayInvariants(r.day, { mode: 'walk' }, rules)).toEqual([]);
  });

  it('sans retard : aucune proposition', () => {
    const t = validate(trip(), 'culture', '11:20');
    expect(reevaluatePlanning(t, 0, 'culture', { now: '11:20', online: false }, rules).changes).toEqual([]);
  });

  it('créneau repoussé après 19h00 : proposé au report ou à la suppression', () => {
    const t = validate(trip(), 'outdoor', '19:00');
    const r = reevaluatePlanning(t, 0, 'outdoor', { now: '19:00', online: false }, rules);
    expect(r.changes).toEqual([expect.objectContaining({ kind: 'removed', stepId: 'relax', reason: 'LATE_START' })]);
    expect(byId(r.day, 'relax')).toBeUndefined();
  });

  it('pluie sur un créneau extérieur : lieu intérieur proposé, à moins de 45 min (en ligne seulement)', () => {
    const indoor = place('indoor', 'monument', 1.6, { name: 'Collégiale', indoor: true });
    const day = { ...standardDay(), weatherAvailable: true, weather: { 14: 90, 15: 90, 16: 90, 17: 20, 18: 10 } };
    const t = validate(trip([day], [indoor]), 'lunch', '13:40');
    const online = reevaluatePlanning(t, 0, 'lunch', { now: '13:40', online: true }, rules);
    expect(online.weatherChecked).toBe(true);
    expect(online.changes).toEqual([expect.objectContaining({ kind: 'replaced', stepId: 'outdoor', reason: 'RAIN', name: 'Collégiale', previousName: 'Parc Vermorel' })]);
    const applied = applyChanges(t, online, {}, rules);
    expect(byId(applied.days[0], 'outdoor').place.id).toBe('indoor');
    expect(applied.candidates.map((c) => c.id)).toEqual(['park']);
  });

  it('hors ligne : pas de vérification météo, mais retard et trajets fonctionnent', () => {
    const indoor = place('indoor', 'monument', 1.6, { indoor: true });
    const day = { ...standardDay(), weatherAvailable: true, weather: { 14: 90, 15: 90 } };
    const t = validate(trip([day], [indoor]), 'lunch', '14:40');
    const r = reevaluatePlanning(t, 0, 'lunch', { now: '14:40', online: false }, rules);
    expect(r.weatherChecked).toBe(false);
    const leg = travelMinutes(restaurant, park, 'walk', rules);
    expect(leg).toBe(20);
    // Aucun remplacement pour la pluie hors ligne : seul le retard est pris en compte.
    expect(r.changes).toEqual([expect.objectContaining({ kind: 'shifted', stepId: 'outdoor', to: { start: '15:00', end: '16:30' } })]);
  });

  it("un horaire personnalisé décalé est signalé ; une étape verrouillée ne bouge jamais", () => {
    const day = standardDay();
    day.steps[2] = { ...day.steps[2], customTime: true, start: '15:00', end: '16:00' };
    const t = validate(trip([day]), 'lunch', '15:10');
    const r = reevaluatePlanning(t, 0, 'lunch', { now: '15:10', online: false }, rules);
    expect(r.changes.find((c) => c.stepId === 'outdoor')).toMatchObject({ kind: 'shifted', customTime: true, from: { start: '15:00', end: '16:00' } });

    const locked = standardDay();
    locked.steps[2] = { ...locked.steps[2], locked: true };
    const t2 = validate(trip([locked]), 'lunch', '15:10');
    const r2 = reevaluatePlanning(t2, 0, 'lunch', { now: '15:10', online: false }, rules);
    expect(byId(r2.day, 'outdoor')).toMatchObject({ start: '14:30', end: '16:00' });
  });

  it('trajet de plus de 45 min depuis le lieu validé : lieu plus proche proposé', () => {
    const far = place('far', 'park', 6, { name: 'Parc lointain' });
    const near = place('near', 'viewpoint', 0.6, { name: 'Belvédère' });
    const day = standardDay();
    day.steps[2] = step('outdoor', 'outdoor', '14:30', '16:00', far);
    const t = validate(trip([day], [near]), 'lunch', '13:45');
    expect(travelMinutes(restaurant, far, 'walk', rules)).toBeGreaterThan(45);
    const r = reevaluatePlanning(t, 0, 'lunch', { now: '13:45', online: false }, rules);
    expect(r.changes.find((c) => c.stepId === 'outdoor')).toMatchObject({ kind: 'replaced', reason: 'TRAVEL', name: 'Belvédère' });
    expect(garden).toBeDefined();
  });
});

describe('reevaluatePlanning — tests aléatoires (fast-check)', () => {
  it('la journée réajustée reste valide ; étapes verrouillées et terminées inchangées', () => {
    const tracking = fc.record({
      raws: fc.array(rawStep, { minLength: 1, maxLength: 6 }),
      pick: fc.nat(10),
      now: fc.integer({ min: 8 * 12, max: 22 * 12 }).map((n) => n * 5),
      online: fc.boolean(),
      rain: fc.option(fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 24, maxLength: 24 }), { nil: null }),
      candidates: fc.array(fc.record({ km: fc.integer({ min: -30, max: 30 }), cat: fc.constantFrom('museum', 'monument', 'restaurant', 'market', 'park', 'viewpoint') }), { maxLength: 6 })
    });
    fc.assert(
      fc.property(tracking, (sc) => {
        const day = buildDay(sc.raws, 's', '2026-10-06');
        if (sc.rain) Object.assign(day, { weatherAvailable: true, weather: Object.fromEntries(sc.rain.map((v, h) => [String(h).padStart(2, '0'), v])) });
        const planned = day.steps.filter((s) => s.status === 'planned' && !s.locked);
        if (!planned.length) return;
        const target = planned[sc.pick % planned.length];
        const candidates = sc.candidates.map((c, i) => place(`cand-${i}`, c.cat, c.km / 10));
        const t = setStepStatus(trip([day], candidates), 0, target.id, 'done', fromMinutes(sc.now));
        const r = reevaluatePlanning(t, 0, target.id, { now: fromMinutes(sc.now), online: sc.online }, rules);
        const applied = applyChanges(t, r, {}, rules);
        const after = applied.days[0];
        // Invariants (sans la règle des horaires personnalisés, que le suivi peut décaler en le signalant).
        const before = { ...t.days[0], steps: t.days[0].steps.map((s) => (s.status === 'planned' && !s.locked ? { ...s, customTime: false } : s)) };
        expect(checkDayInvariants(after, { before, trip: applied, mode: 'walk' }, rules)).toEqual([]);
        for (const s of t.days[0].steps.filter((n) => n.locked || n.status !== 'planned')) {
          expect(byId(after, s.id)).toMatchObject({ start: s.start, end: s.end });
        }
        // Un horaire personnalisé déplacé est toujours signalé.
        for (const c of r.changes) if (byId(t.days[0], c.stepId)?.customTime) expect(c.customTime).toBe(true);
      }),
      { numRuns: 500, seed: 20260925 }
    );
  });
});
