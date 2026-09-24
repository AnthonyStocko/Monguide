import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildDay, HOURS, scenario } from './testing/randomDay.js';
import { applyChanges } from './applyChanges.js';
import { checkDayInvariants } from './checkDayInvariants.js';
import { insertWithoutReplan, removePersonalStep, replanDay } from './replanDay.js';
import { fromMinutes } from './time.js';
import { travelMinutes } from './travel.js';
import { FRIEND_KM, garden, park, personal, place, rules, standardDay, step, trip } from './testing/dayFixture.js';

const ids = (day) => day.steps.map((s) => s.id);
const byId = (day, id) => day.steps.find((s) => s.id === id);
const invariantsOf = (before, after) => after.days.flatMap((d, i) => checkDayInvariants(d, { before: before.days[i], trip: after, mode: after.mode }, rules));

describe('replanDay — journée type 10h00 / 12h30 / 14h30 / 17h30', () => {
  it("visite d'un proche 14h00-16h00 à 10 min : l'étape de 14h30 passe à 16h10, celle de 17h30 est décalée", () => {
    const t = trip();
    const p = personal('p', '14:00', '16:00', { km: FRIEND_KM });
    expect(travelMinutes(p.place, park, 'walk', rules)).toBe(10);
    const r = replanDay(t, 0, p, rules);
    const leg = travelMinutes(park, garden, 'walk', rules);
    expect(ids(r.day)).toEqual(['culture', 'lunch', 'p', 'outdoor', 'relax']);
    expect(byId(r.day, 'outdoor')).toMatchObject({ start: '16:10', end: '17:40' });
    expect(byId(r.day, 'relax')).toMatchObject({ start: fromMinutes(17 * 60 + 40 + leg) });
    expect(r.changes.map((c) => [c.kind, c.stepId])).toEqual([
      ['shifted', 'outdoor'],
      ['shifted', 'relax']
    ]);
    expect(r.warnings).toEqual([]);
    expect(invariantsOf(t, applyChanges(t, r, {}, rules))).toEqual([]);
  });

  it("l'étape de 17h30 repoussée après 19h00 est proposée au report (ou à la suppression)", () => {
    const day2 = { date: '2026-10-07', weatherAvailable: false, steps: [step('d2-m', 'culture', '10:00', '11:30', place('m2', 'museum', 0.1))] };
    const t = trip([standardDay(), day2]);
    const r = replanDay(t, 0, personal('p', '14:00', '17:30', { km: FRIEND_KM }), rules);
    expect(byId(r.day, 'outdoor')).toMatchObject({ start: '17:40', end: '19:10' });
    const relax = r.changes.find((c) => c.stepId === 'relax');
    expect(relax).toMatchObject({ kind: 'postponed', reason: 'LATE_START', target: { dayIndex: 1, date: '2026-10-07' } });
    expect(byId(r.day, 'relax')).toBeUndefined();
    // Appliquer : reporté au jour 2 ; ou, au choix, supprimé (le lieu retourne dans la réserve).
    const postponed = applyChanges(t, r, {}, rules);
    expect(ids(postponed.days[1])).toEqual(['d2-m', 'relax']);
    expect(invariantsOf(t, postponed)).toEqual([]);
    const removed = applyChanges(t, r, { relax: 'removed' }, rules);
    expect(ids(removed.days[1])).toEqual(['d2-m']);
    expect(removed.candidates.map((c) => c.id)).toContain('garden');
  });

  it("étape personnelle 12h00-14h00 : la pause déjeuner est proposée à la suppression", () => {
    const t = trip();
    const r = replanDay(t, 0, personal('p', '12:00', '14:00', { km: 0.3, title: 'Repas chez des amis' }), rules);
    expect(r.changes[0]).toMatchObject({ kind: 'removed', stepId: 'lunch', reason: 'LUNCH_COVERED' });
    expect(ids(r.day)).toEqual(['culture', 'p', 'outdoor', 'relax']);
    const applied = applyChanges(t, r, {}, rules);
    expect(applied.candidates.map((c) => c.id)).toContain('restaurant');
    expect(invariantsOf(t, applied)).toEqual([]);
  });

  it('restaurant décalé après sa fermeture : remplacé par un restaurant ouvert, sinon reporté ou supprimé', () => {
    const open = place('open', 'restaurant', 0.35, { name: 'Brasserie de la Gare', food: { regional: false, openingHours: 'Mo-Su 11:30-15:30' } });
    // Proche à côté du restaurant (fermeture 14:30) : déjeuner repoussé à 13:20-14:35.
    const p = personal('p', '11:40', '13:20', { km: 0.3 });
    const r = replanDay(trip([standardDay()], [open]), 0, p, rules);
    expect(r.changes.find((c) => c.stepId === 'lunch')).toMatchObject({ kind: 'replaced', reason: 'CLOSED', name: 'Brasserie de la Gare' });
    expect(byId(r.day, 'lunch').place.id).toBe('open');

    const none = replanDay(trip([standardDay()], []), 0, p, rules);
    expect(none.changes.find((c) => c.stepId === 'lunch')).toMatchObject({ kind: 'removed', reason: 'CLOSED' });
  });

  it("une étape verrouillée n'est jamais déplacée", () => {
    const day = standardDay();
    day.steps.splice(3, 0, personal('fixed', '16:30', '17:15', { km: 1.6, title: 'Rendez-vous' }));
    const t = trip([day]);
    const r = replanDay(t, 0, personal('p', '14:00', '16:00', { km: FRIEND_KM }), rules);
    expect(byId(r.day, 'fixed')).toMatchObject({ start: '16:30', end: '17:15' });
    // Le parc (16:10) ne tient plus avant 16:30 : il n'est ni superposé ni déplacé après le rendez-vous.
    expect(r.changes.find((c) => c.stepId === 'outdoor').kind).toMatch(/replaced|postponed|removed/);
    expect(invariantsOf(t, applyChanges(t, r, {}, rules))).toEqual([]);
  });

  it('étape personnelle sans lieu : "Temps de trajet inconnu", trajets voisins non recalculés', () => {
    const t = trip();
    const r = replanDay(t, 0, personal('p', '14:00', '16:00'), rules);
    expect(r.warnings).toContainEqual({ code: 'TRAVEL_UNKNOWN' });
    expect(byId(r.day, 'outdoor')).toMatchObject({ start: '16:00', end: '17:30', travelFromPreviousMin: 0 });
  });

  it('chevauchement de deux étapes personnelles : aucun recalcul, message d\'erreur', () => {
    const day = standardDay();
    day.steps.splice(2, 0, personal('p1', '14:00', '15:00'));
    expect(replanDay(trip([day]), 0, personal('p2', '14:30', '16:00'), rules)).toEqual({ error: { code: 'OVERLAP_FIXED', stepId: 'p1' } });
  });

  it('modification : même identifiant, l\'ancienne version est remplacée', () => {
    const t = trip();
    const first = applyChanges(t, replanDay(t, 0, personal('p', '14:00', '16:00', { km: FRIEND_KM }), rules), {}, rules);
    const r = replanDay(first, 0, personal('p', '20:00', '20:45', { km: FRIEND_KM }), rules);
    expect(ids(r.day).filter((id) => id === 'p')).toHaveLength(1);
    expect(byId(r.day, 'p')).toMatchObject({ start: '20:00' });
  });

  it('signale un retour après 21h00 (LATE)', () => {
    const r = replanDay(trip(), 0, personal('p', '20:30', '21:30'), rules);
    expect(r.warnings).toContainEqual({ code: 'LATE', lateEnd: '21:00' });
  });

  it('"Ajouter sans réorganiser" : badge "Conflit d\'horaire" sur les étapes concernées', () => {
    const t = trip();
    const r = insertWithoutReplan(t, 0, personal('p', '14:00', '16:00', { km: FRIEND_KM }), rules);
    expect(byId(r.day, 'outdoor').conflicts).toEqual(['p']);
    expect(byId(r.day, 'p').conflicts).toEqual(['outdoor']);
    expect(byId(r.day, 'lunch').conflicts).toBeUndefined();
    // Correction : suppression de l'étape personnelle, le badge disparaît.
    const applied = applyChanges(t, r, {}, rules);
    const removed = removePersonalStep(applied, 0, 'p', rules);
    expect(removed.day.steps.some((s) => s.conflicts)).toBe(false);
  });
});

describe('replanDay — tests aléatoires (fast-check)', () => {
  it('checkDayInvariants passe sur au moins 500 journées générées', () => {
    let replanned = 0;
    fc.assert(
      fc.property(scenario, (sc) => {
        const main = buildDay(sc.main, 's', '2026-10-06');
        if (sc.rain) {
          main.weatherAvailable = true;
          main.weather = Object.fromEntries(sc.rain.map((v, h) => [String(h).padStart(2, '0'), v]));
        }
        const others = sc.others.map((raws, i) => buildDay(raws, `o${i}-`, `2026-10-0${7 + i}`));
        const candidates = sc.candidates.map((c, i) => place(`cand-${i}`, c.cat, c.km / 10, c.cat === 'restaurant' ? { food: { regional: false, ...(HOURS[c.hours] ? { openingHours: HOURS[c.hours] } : {}) } } : {}));
        const t = trip([main, ...others], candidates);
        // Journée de départ valide.
        expect(checkDayInvariants(main, { trip: t, mode: 'walk' }, rules)).toEqual([]);

        const end = Math.min(sc.personalStart + sc.personalDuration, 23 * 60 + 59);
        const p = personal('new', fromMinutes(sc.personalStart), fromMinutes(end), { km: sc.personalKm === null ? null : sc.personalKm / 10 });
        const r = replanDay(t, 0, p, rules);
        if (r.error) {
          expect(['INVALID', 'OVERLAP_FIXED']).toContain(r.error.code);
          return;
        }
        replanned += 1;
        const choices = Object.fromEntries(r.changes.filter((c) => c.kind === 'postponed').map((c, i) => [c.stepId, sc.choices[i % 10] ? 'postponed' : 'removed']));
        const applied = applyChanges(t, r, choices, rules);
        expect(invariantsOf(t, applied)).toEqual([]);
        expect(byId(applied.days[0], 'new')).toMatchObject({ start: p.start, end: p.end });
      }),
      { numRuns: 600, seed: 20260924 }
    );
    expect(replanned).toBeGreaterThan(200);
  });
});
