import { describe, expect, it } from 'vitest';
import { applyChanges } from '../applyChanges.js';
import { switchToOriginal, switchToReviewed } from '../applyReview.js';
import { clearResolvedConflicts } from '../conflicts.js';
import { applyTiming, recomputeTravel } from '../dayEdits.js';
import { makePlaceStep } from '../addPlaceStep.js';
import { migrate } from '../migrations.js';
import { setStepStatus } from '../reevaluatePlanning.js';
import { insertWithoutReplan, removePersonalStep, replanDay } from '../replanDay.js';
import { replanLodgings } from '../replanLodgings.js';
import { replaceStepPlace } from '../replaceStep.js';
import { at, bistro, dayWithDinner, FRIEND_KM, personal, place, rules, standardDay, step, trip as fixtureTrip } from '../testing/dayFixture.js';
import { applyOps } from './applyOps.js';
import { diffTrips } from './diffTrips.js';

const secondDay = () => {
  const d = dayWithDinner('2026-10-07');
  return { ...d, steps: d.steps.map((s) => (s.id === 'dinner' ? s : { ...s, id: `${s.id}2` })) };
};
const near = place('near', 'museum', 0.6, { name: 'Musée proche' });
const open = place('open', 'restaurant', 0.4, { name: 'Brasserie de la Gare', food: { regional: false, openingHours: 'Mo-Su 11:00-23:00' } });
/** Séjour cohérent (trajets recalculés), comme après une génération puis une première modification. */
function makeTrip(days = [standardDay('2026-10-06'), secondDay()], candidates = [near, open, bistro]) {
  const t = migrate(fixtureTrip(days, candidates)).trip;
  return { ...t, days: t.days.map((d) => recomputeTravel(d, t, rules)) };
}

/** Aller-retour : les opérations rejouées sur `before` redonnent exactement `after`. */
function expectRoundTrip(before, after) {
  const { ops, unsupported } = diffTrips(before, after);
  expect(unsupported).toEqual([]);
  const result = applyOps(before, ops, { rules });
  expect(result.rejected).toEqual([]);
  expect(result.trip).toEqual(after);
  return { ops, summaries: result.summaries.map((s) => s.text) };
}

describe('diffTrips : chaque action de l’écran donne des opérations qui la rejouent', () => {
  it('aucun changement : aucune opération', () => {
    const t = makeTrip();
    expect(diffTrips(t, t)).toEqual({ ops: [], unsupported: [] });
  });

  it('modifier un horaire, avec décalage des suivantes (TimeEditorDialog + saveDay)', () => {
    const t = makeTrip();
    const day = applyTiming(t.days[0], 1, { start: '12:45', end: '14:15', shiftFollowing: true });
    const after = { ...t, days: t.days.map((d, i) => (i === 0 ? clearResolvedConflicts(recomputeTravel(day, t, rules), t.mode, rules) : d)) };
    const { ops, summaries } = expectRoundTrip(t, after);
    expect(ops.map((o) => o.type)).toEqual(['setStepTime', 'setStepTime', 'setStepTime']);
    expect(summaries[0]).toBe("a changé l'horaire de « Le Bouchon » : 12:45–14:15 (mardi)");
  });

  it('remplacer le lieu d’une étape (ReplaceStepDialog)', () => {
    const t = makeTrip();
    const after = replaceStepPlace(t, 0, 0, near, rules);
    const { ops } = expectRoundTrip(t, after);
    expect(ops.map((o) => o.type)).toEqual(['replaceStep', 'updateCandidates']);
  });

  it('ajouter une étape personnelle avec réajustement (replanDay + Appliquer)', () => {
    const t = makeTrip();
    const result = replanDay(t, 0, personal('p', '14:00', '16:00', { km: FRIEND_KM }), rules);
    expect(result.changes.length).toBeGreaterThan(0);
    const after = applyChanges(t, result, {}, rules);
    const { ops, summaries } = expectRoundTrip(t, after);
    expect(ops.some((o) => o.type === 'addStep' && o.params.step.id === 'p')).toBe(true);
    expect(summaries).toContain('a ajouté « Visite d’un proche » (mardi)');
  });

  it('ajouter un lieu choisi dans la liste (« + Ajouter une étape »)', () => {
    const t = makeTrip();
    const added = makePlaceStep({ id: 'added', type: 'museum', place: near, start: '19:15', end: '20:00' }, rules);
    const after = applyChanges(t, replanDay(t, 0, added, rules), {}, rules);
    expectRoundTrip(t, after);
  });

  it('« Ajouter sans réorganiser » (conflits d’horaire gardés)', () => {
    const t = makeTrip();
    const result = insertWithoutReplan(t, 0, personal('p', '10:30', '11:00', { km: 0.1 }), rules);
    const after = applyChanges(t, result, {}, rules);
    expect(after.days[0].steps.some((s) => s.conflicts)).toBe(true);
    expectRoundTrip(t, after);
  });

  it('modifier puis supprimer une étape personnelle', () => {
    const t = makeTrip();
    const first = applyChanges(t, replanDay(t, 0, personal('p', '14:00', '16:00', { km: FRIEND_KM }), rules), {}, rules);
    const edited = applyChanges(first, replanDay(first, 0, personal('p', '20:00', '20:45', { km: FRIEND_KM, title: 'Apéritif' }), rules), {}, rules);
    expectRoundTrip(first, edited);
    const removed = applyChanges(edited, removePersonalStep(edited, 0, 'p', rules), {}, rules);
    const { summaries } = expectRoundTrip(edited, removed);
    expect(summaries).toContain('a supprimé « Apéritif » (mardi)');
  });

  it('valider une étape (suivi en temps réel)', () => {
    const t = makeTrip();
    const after = setStepStatus(t, 0, 'culture', 'done', '11:25');
    const { ops, summaries } = expectRoundTrip(t, after);
    expect(ops).toEqual([expect.objectContaining({ type: 'setStepDone', params: { stepId: 'culture', status: 'done', completedAt: '11:25' } })]);
    expect(summaries).toEqual(['a validé « Musée Paul-Dini » (mardi)']);
  });

  it('report d’une étape sur une autre journée, à la place d’une soirée libre', () => {
    const free = step('free', 'relax', '17:30', '19:00', null);
    const t = makeTrip([standardDay('2026-10-06'), { date: '2026-10-07', weatherAvailable: false, steps: [free] }]);
    const relax = t.days[0].steps[3];
    const proposal = {
      dayIndex: 0,
      day: recomputeTravel({ ...t.days[0], steps: t.days[0].steps.slice(0, 3) }, t, rules),
      changes: [{ kind: 'postponed', stepId: 'relax', step: relax, target: { dayIndex: 1, date: '2026-10-07', start: '17:30', end: '19:00', freeStepId: 'free' } }]
    };
    const after = applyChanges(t, proposal, {}, rules);
    const { ops, summaries } = expectRoundTrip(t, after);
    expect(ops.map((o) => o.type)).toContain('moveStep');
    expect(summaries).toContain('a déplacé « Jardin de la Garenne » au mercredi à 17:30');
  });

  it('modifier les hébergements (replanLodgings + Appliquer)', () => {
    const t = makeTrip();
    const hotel = { id: 'hotel', name: 'Hôtel du Parc', address: 'Place des Arts', ...at(-0.2), nights: ['2026-10-06', '2026-10-07'] };
    const { trip: next, proposal } = replanLodgings(t, [hotel], rules);
    const after = applyChanges(next, proposal, {}, rules);
    const { ops, summaries } = expectRoundTrip(t, after);
    expect(ops[0]).toMatchObject({ type: 'setLodging', params: { lodging: hotel } });
    expect(summaries[0]).toBe("a ajouté l'hébergement « Hôtel du Parc »");
    // Puis suppression de l'hébergement.
    const { trip: none, proposal: back } = replanLodgings(after, [], rules);
    expectRoundTrip(after, applyChanges(none, back, {}, rules));
  });

  it('version d’origine / version relue de la relecture IA', () => {
    const t = makeTrip();
    const original = t.days.map((d) => ({ ...d, steps: [...d.steps].reverse() }));
    const reviewed = { ...t, review: { status: 'applied', provider: 'mistral', model: 'm', appliedOps: [], rejectedOps: [], dayTitles: {}, summary: null, originalDays: original, originalCandidates: [near], reviewedAt: '2026-10-01T00:00:00.000Z' } };
    const shown = switchToOriginal(reviewed);
    const { ops } = expectRoundTrip(reviewed, shown);
    expect(ops.map((o) => o.type)).toEqual(['switchReview']);
    expectRoundTrip(shown, switchToReviewed(shown));
  });

  it('photos des lieux et de la destination', () => {
    const t = makeTrip();
    const image = { thumbUrl: 'https://upload.wikimedia.org/a.jpg', width: 4, height: 3, credit: { license: 'CC0', sourceUrl: 'https://commons.wikimedia.org/a' } };
    const after = {
      ...t,
      hero: image,
      destination: { ...t.destination, wikidata: 'Q1' },
      days: t.days.map((d) => ({ ...d, steps: d.steps.map((s) => (s.place?.id === 'museum' ? { ...s, place: { ...s.place, image } } : s)) })),
      candidates: t.candidates.map((p) => (p.id === 'near' ? { ...p, image } : p))
    };
    const { ops } = expectRoundTrip(t, after);
    expect(ops).toEqual([expect.objectContaining({ type: 'setImages', params: { images: { museum: image, near: image }, hero: image, destinationWikidata: 'Q1' } })]);
  });

  it('« Annuler » : les opérations inverses ramènent au séjour d’avant', () => {
    const t = makeTrip();
    const after = applyChanges(t, replanDay(t, 0, personal('p', '14:00', '16:00', { km: FRIEND_KM }), rules), {}, rules);
    expectRoundTrip(after, t);
  });

  it('renommer et supprimer', () => {
    const t = makeTrip();
    expect(expectRoundTrip(t, { ...t, title: 'Beaujolais' }).ops.map((o) => o.type)).toEqual(['renameTrip']);
    expect(diffTrips(t, { ...t, deleted: true }).ops.map((o) => o.type)).toEqual(['deleteTrip']);
  });

  it('les champs recalculés (trajets, départ) ne sont jamais envoyés', () => {
    const t = makeTrip();
    const after = applyChanges(t, replanDay(t, 0, personal('p', '14:00', '16:00', { km: FRIEND_KM }), rules), {}, rules);
    const json = JSON.stringify(diffTrips(t, after).ops);
    expect(json).not.toContain('travelFromPreviousMin');
    expect(json).not.toContain('returnTravelMin');
  });

  it('un changement sans opération est signalé', () => {
    const t = makeTrip();
    expect(diffTrips(t, { ...t, travelers: 5 }).unsupported).toEqual(['travelers']);
  });
});

describe('diffTrips + applyOps : deux appareils, deux étapes différentes', () => {
  it('les deux modifications sont conservées, quel que soit l’ordre d’arrivée', () => {
    const t = makeTrip();
    // Appareil 1 : horaire du musée. Appareil 2 : dîner libre le mercredi. Chacun part de la même version.
    const one = diffTrips(t, { ...t, days: t.days.map((d, i) => (i === 0 ? recomputeTravel(applyTiming(d, 0, { start: '09:30', end: '11:00' }), t, rules) : d)) }).ops;
    const two = diffTrips(t, replaceStepPlace(t, 1, 4, open, rules)).ops;
    const oneThenTwo = applyOps(applyOps(t, one, { rules }).trip, two, { rules }).trip;
    const twoThenOne = applyOps(applyOps(t, two, { rules }).trip, one, { rules }).trip;
    expect(oneThenTwo).toEqual(twoThenOne);
    expect(oneThenTwo.days[0].steps[0].start).toBe('09:30');
    expect(oneThenTwo.days[1].steps[4].place.id).toBe('open');
  });
});
