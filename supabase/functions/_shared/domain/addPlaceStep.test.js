import { describe, expect, it } from 'vitest';
import { applyChanges } from './applyChanges.js';
import { defaultListTime, makePlaceStep, proposedTimes, roundUp5 } from './addPlaceStep.js';
import { checkDayInvariants } from './checkDayInvariants.js';
import { cuisineOptions, listCandidates, matchesName } from './listCandidates.js';
import { replanDay } from './replanDay.js';
import { travelMinutes } from './travel.js';
import { bistro, dayWithDinner, place, rules, standardDay, trip } from './testing/dayFixture.js';

const SATURDAY = '2026-10-10';

describe('addPlaceStep', () => {
  it('heure en tête de liste : fin de l\'étape précédente, arrondie aux 5 minutes', () => {
    const day = standardDay();
    expect(defaultListTime(day, 0, rules)).toBe('11:30');
    expect(defaultListTime({ ...day, steps: [{ ...day.steps[0], end: '11:32' }] }, 0, rules)).toBe('11:35');
    expect(defaultListTime(day, -1, rules)).toBe('10:00');
    expect(defaultListTime({ steps: [] }, -1, rules)).toBe(rules.dayTemplate.culture);
    expect(roundUp5(23 * 60 + 58)).toBe(23 * 60 + 55);
  });

  it('heures proposées : trajet depuis l\'étape précédente, durée conseillée du type', () => {
    const day = standardDay();
    const far = place('far', 'museum', 3);
    const travel = travelMinutes(day.steps[3].place, far, 'walk', rules);
    // Heure choisie trop tôt pour le trajet : repoussée ; musée 90 min.
    const p = proposedTimes({ day, afterIndex: 3, place: far, type: 'museum', time: '19:00', mode: 'walk' }, rules);
    expect(p.start).toBe(`19:${String(Math.ceil(travel / 5) * 5).padStart(2, '0')}`);
    expect(p.stepType).toBe('culture');
    // Restaurant à 20:00 : dîner de 90 min.
    expect(proposedTimes({ day, afterIndex: 3, place: bistro, type: 'restaurant', time: '20:00', mode: 'walk' }, rules)).toEqual({ start: '20:00', end: '21:30', stepType: 'dinner' });
    expect(proposedTimes({ day, afterIndex: 0, place: bistro, type: 'restaurant', time: '12:30', mode: 'walk' }, rules)).toMatchObject({ stepType: 'lunch', end: '13:45' });
  });

  it('étape construite : type selon l\'heure, horaire choisi (point fixe), remplaçable', () => {
    const s = makePlaceStep({ id: 'new', type: 'restaurant', place: bistro, start: '20:00', end: '21:30', badges: ['hours_unconfirmed', 'monument_historique'] }, rules);
    expect(s).toMatchObject({ id: 'new', type: 'dinner', customTime: true, locked: false, status: 'planned', badges: ['hours_unconfirmed'], place: { id: 'bistro' } });
  });
});

describe('ajout d\'un restaurant à 20:00 le samedi', () => {
  const late = place('late', 'restaurant', 1.9, { name: 'Tardif', food: { regional: false, openingHours: 'Sa 19:00-23:00', cuisine: ['french'] } });
  const noon = place('noon', 'restaurant', 1.7, { name: 'Midi', food: { regional: false, openingHours: 'Mo-Su 12:00-14:00', cuisine: ['french'] } });
  const weekdays = place('weekdays', 'restaurant', 1.8, { name: 'Semaine', food: { regional: false, openingHours: 'Mo-Fr 19:00-23:00', cuisine: ['pizza'] } });

  it('filtre « ouvert à 20:00 » : seuls les restaurants ouverts ; changer l\'heure met à jour les statuts', () => {
    const t = trip([dayWithDinner(SATURDAY)], [late, noon, weekdays]);
    const r = listCandidates(t, 'restaurant', { date: SATURDAY, time: '20:00', filters: { open: true } }, rules);
    expect(r.items.map((i) => i.place.id).sort()).toEqual(['bistro', 'late', 'restaurant']); // déjà prévus compris, signalés
    expect(r.items.every((i) => i.opening === 'open')).toBe(true);
    const noonTime = listCandidates(t, 'restaurant', { date: SATURDAY, time: '12:30' }, rules);
    expect(Object.fromEntries(noonTime.items.map((i) => [i.place.id, i.opening]))).toMatchObject({ noon: 'open', late: 'closed', weekdays: 'closed' });
  });

  it("l'ajout déclenche le recalcul de la soirée (dîner prévu proposé à la suppression)", () => {
    const t = trip([dayWithDinner(SATURDAY)], [late, noon]);
    const times = proposedTimes({ day: t.days[0], afterIndex: 3, place: late, type: 'restaurant', time: '20:00', mode: t.mode }, rules);
    const step = makePlaceStep({ id: 'new', type: 'restaurant', place: late, ...times }, rules);
    const r = replanDay(t, 0, step, rules);
    expect(r.changes.find((c) => c.stepId === 'dinner')).toMatchObject({ kind: 'removed', reason: 'DINNER_COVERED' });
    const applied = applyChanges(t, r, {}, rules);
    expect(applied.days[0].steps.find((s) => s.id === 'new')).toMatchObject({ type: 'dinner', start: '20:00', end: '21:30' });
    // Le lieu choisi quitte la réserve ; le restaurant supprimé y retourne.
    expect(applied.candidates.map((p) => p.id)).toEqual(expect.arrayContaining(['noon', 'bistro']));
    expect(applied.candidates.map((p) => p.id)).not.toContain('late');
    expect(checkDayInvariants(applied.days[0], { before: t.days[0], trip: applied, mode: t.mode }, rules)).toEqual([]);
  });
});

describe('recherche et cuisines', () => {
  it('recherche par nom : casse et accents indifférents, variantes de langue comprises', () => {
    const p = { name: 'Grand-Place - Grote Markt', names: { fr: 'Grand-Place', nl: 'Grote Markt' } };
    expect(matchesName(p, 'grote')).toBe(true);
    expect(matchesName({ name: 'Musée Paul-Dini' }, 'musee paul')).toBe(true);
    expect(matchesName({ name: 'Musée Paul-Dini' }, 'château')).toBe(false);
    expect(matchesName({ name: 'X' }, '  ')).toBe(true);
    const t = trip([standardDay()], [place('m2', 'museum', 2, { name: 'Musée municipal' })]);
    expect(listCandidates(t, 'museum', { filters: { query: 'MUNICIPAL' } }, rules).items.map((i) => i.place.id)).toEqual(['m2']);
  });

  it('cuisines les plus fréquentes d\'abord', () => {
    const items = [['pizza'], ['french', 'regional'], ['french'], undefined].map((cuisine) => ({ place: { food: cuisine ? { cuisine } : {} } }));
    expect(cuisineOptions(items)).toEqual(['french', 'pizza', 'regional']);
    expect(cuisineOptions(items, 1)).toEqual(['french']);
  });
});
