import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../migrations.js';
import { bistro, dayWithDinner, garden, museum, park, place, rules, standardDay, trip as fixtureTrip } from '../testing/dayFixture.js';
import { applyOps } from './applyOps.js';
import { weekday } from './summaries.js';

/** Séjour de test en schemaVersion courante (journées avec identifiant). */
// Deuxième journée : identifiants d'étapes distincts (culture2…), dîner « dinner ».
const secondDay = () => {
  const d = dayWithDinner('2026-10-07');
  return { ...d, steps: d.steps.map((s) => (s.id === 'dinner' ? s : { ...s, id: `${s.id}2` })) };
};
const makeTrip = (days = [standardDay('2026-10-06'), secondDay()], candidates = [bistro]) => migrate(fixtureTrip(days, candidates)).trip;
const op = (type, params) => ({ opId: crypto.randomUUID(), type, params });
const day = (t, i) => t.days[i];
const stepOf = (t, id) => t.days.flatMap((d) => d.steps).find((s) => s.id === id);
const ids = (d) => d.steps.map((s) => s.id);
const run = (t, ops, ctx = {}) => applyOps(t, ops, { rules, ...ctx });

describe('applyOps : chaque opération', () => {
  it('addStep : après une étape, en tête, ou à sa place horaire si l’étape de référence a disparu', () => {
    const t = makeTrip();
    const extra = { id: 'new', type: 'relax', start: '16:10', end: '16:40', place: park, indoor: false, status: 'planned', customTime: true, locked: false, badges: [] };
    const r = run(t, [op('addStep', { dayId: day(t, 0).id, step: extra, afterStepId: 'outdoor' })]);
    expect(ids(day(r.trip, 0))).toEqual(['culture', 'lunch', 'outdoor', 'new', 'relax']);
    expect(r.summaries[0].text).toBe('a ajouté « Parc Vermorel » (mardi)');

    expect(ids(day(run(t, [op('addStep', { dayId: day(t, 0).id, step: { ...extra, start: '09:00', end: '09:30' }, afterStepId: null })]).trip, 0))[0]).toBe('new');
    const fallback = run(t, [op('addStep', { dayId: day(t, 0).id, step: extra, afterStepId: 'disparue' })]);
    expect(ids(day(fallback.trip, 0))).toEqual(['culture', 'lunch', 'outdoor', 'new', 'relax']);
  });

  it('addStep : journée disparue -> TARGET_GONE ; étape déjà présente -> EXISTS', () => {
    const t = makeTrip();
    const s = { ...stepOf(t, 'culture') };
    const a = op('addStep', { dayId: 'pas-de-jour', step: { ...s, id: 'x' }, afterStepId: null });
    const b = op('addStep', { dayId: day(t, 0).id, step: s, afterStepId: null });
    expect(run(t, [a, b]).rejected).toEqual([
      { opId: a.opId, code: 'TARGET_GONE' },
      { opId: b.opId, code: 'EXISTS' }
    ]);
  });

  it('removeStep : retire l’étape et recalcule les trajets de la journée ; étape disparue -> TARGET_GONE', () => {
    const t = makeTrip();
    const r = run(t, [op('removeStep', { stepId: 'lunch' })]);
    expect(ids(day(r.trip, 0))).toEqual(['culture', 'outdoor', 'relax']);
    // Parc rejoint depuis le musée (1,52 km) et non plus depuis le restaurant (1,22 km).
    expect(stepOf(r.trip, 'outdoor').travelFromPreviousMin).toBeGreaterThan(stepOf(run(t, [op('setStepTime', { stepId: 'outdoor', start: '14:30', end: '16:00' })]).trip, 'outdoor').travelFromPreviousMin);
    expect(r.summaries[0].text).toBe('a supprimé « Le Bouchon » (mardi)');
    const gone = op('removeStep', { stepId: 'disparue' });
    expect(run(t, [gone]).rejected).toEqual([{ opId: gone.opId, code: 'TARGET_GONE' }]);
  });

  it('moveStep : même journée (autre horaire) ou autre journée', () => {
    const t = makeTrip();
    const same = run(t, [op('moveStep', { stepId: 'dinner', toDayId: day(t, 1).id, afterStepId: 'relax2', start: '20:00', end: '21:30' })]);
    expect(stepOf(same.trip, 'dinner')).toMatchObject({ start: '20:00', end: '21:30' });
    expect(same.summaries[0].text).toBe('a déplacé « Le Bistrot du soir » à 20:00 (mercredi)');

    const other = run(t, [op('moveStep', { stepId: 'relax', toDayId: day(t, 1).id, afterStepId: 'outdoor2', start: '17:30', end: '19:00', customTime: false })]);
    expect(ids(day(other.trip, 0))).toEqual(['culture', 'lunch', 'outdoor']);
    expect(ids(day(other.trip, 1))).toEqual(['culture2', 'lunch2', 'outdoor2', 'relax', 'relax2', 'dinner']);
    expect(other.summaries[0].text).toBe('a déplacé « Jardin de la Garenne » au mercredi à 17:30');
  });

  it('moveStep : étape ou journée disparue -> TARGET_GONE', () => {
    const t = makeTrip();
    const a = op('moveStep', { stepId: 'disparue', toDayId: day(t, 1).id, afterStepId: null, start: '10:00', end: '11:00' });
    const b = op('moveStep', { stepId: 'culture', toDayId: 'pas-de-jour', afterStepId: null, start: '10:00', end: '11:00' });
    expect(run(t, [a, b]).rejected.map((x) => x.code)).toEqual(['TARGET_GONE', 'TARGET_GONE']);
  });

  it('setStepTime : horaire et horaire choisi ; étape disparue -> TARGET_GONE', () => {
    const t = makeTrip();
    const r = run(t, [op('setStepTime', { stepId: 'culture', start: '10:30', end: '12:00', customTime: true })]);
    expect(stepOf(r.trip, 'culture')).toMatchObject({ start: '10:30', end: '12:00', customTime: true });
    expect(r.summaries[0].text).toBe("a changé l'horaire de « Musée Paul-Dini » : 10:30–12:00 (mardi)");
    const gone = op('setStepTime', { stepId: 'disparue', start: '10:30', end: '12:00' });
    expect(run(t, [gone]).rejected).toEqual([{ opId: gone.opId, code: 'TARGET_GONE' }]);
  });

  it('setStepTime : horaire à cheval sur minuit gardé tel quel', () => {
    const t = makeTrip();
    const r = run(t, [op('setStepTime', { stepId: 'dinner', start: '23:30', end: '00:30', customTime: true })]);
    expect(r.rejected).toEqual([]);
    expect(stepOf(r.trip, 'dinner')).toMatchObject({ start: '23:30', end: '00:30' });
    expect(r.summaries[0].text).toBe("a changé l'horaire de « Le Bistrot du soir » : 23:30–00:30 (mercredi)");
    // Heure impossible : refusée.
    expect(run(t, [op('setStepTime', { stepId: 'dinner', start: '24:30', end: '01:00' })]).rejected[0].code).toBe('INVALID');
  });

  it('replaceStep : autre lieu (suggestion météo, remplacement) ou dîner libre ; trajets recalculés', () => {
    const t = makeTrip();
    const far = place('far', 'museum', 6, { name: 'Musée lointain' });
    const r = run(t, [op('replaceStep', { stepId: 'outdoor', place: far })]);
    expect(stepOf(r.trip, 'outdoor').place.id).toBe('far');
    expect(stepOf(r.trip, 'outdoor').travelFromPreviousMin).toBeGreaterThan(stepOf(t, 'outdoor').travelFromPreviousMin ?? 0);
    expect(r.summaries[0].text).toBe('a remplacé « Parc Vermorel » par « Musée lointain » (mardi)');

    const free = run(t, [op('replaceStep', { stepId: 'dinner', place: null })]);
    expect(stepOf(free.trip, 'dinner')).not.toHaveProperty('place');
    expect(free.summaries[0].text).toBe('a remplacé « Le Bistrot du soir » par « Soirée libre » (mercredi)');
    const back = run(free.trip, [op('replaceStep', { stepId: 'dinner', place: bistro })]);
    expect(back.summaries[0].text).toBe('a choisi « Le Bistrot du soir » (mercredi)');
  });

  it('setStepDone : validée (heure du séjour), passée, remise à faire', () => {
    const t = makeTrip();
    const done = run(t, [op('setStepDone', { stepId: 'culture', status: 'done', completedAt: '11:20' })]);
    expect(stepOf(done.trip, 'culture')).toMatchObject({ status: 'done', completedAt: '11:20' });
    expect(done.summaries[0].text).toBe('a validé « Musée Paul-Dini » (mardi)');
    const planned = run(done.trip, [op('setStepDone', { stepId: 'culture', status: 'planned' })]);
    expect(stepOf(planned.trip, 'culture')).not.toHaveProperty('completedAt');
    expect(planned.summaries[0].text).toBe('a remis « Musée Paul-Dini » à faire (mardi)');
    expect(run(t, [op('setStepDone', { stepId: 'lunch', status: 'skipped', completedAt: '12:00' })]).summaries[0].text).toBe('a passé « Le Bouchon » (mardi)');
    expect(run(t, [op('setStepDone', { stepId: 'disparue', status: 'done' })]).rejected[0].code).toBe('TARGET_GONE');
  });

  it('updateStep : champs permis seulement ; historique pour ce que l’utilisateur voit', () => {
    const t = makeTrip();
    const r = run(t, [op('updateStep', { stepId: 'relax', set: { note: 'Prendre un pull' } }), op('updateStep', { stepId: 'culture', set: { badges: ['weather_adapted'] } })]);
    expect(stepOf(r.trip, 'relax').note).toBe('Prendre un pull');
    expect(r.summaries.map((s) => s.text)).toEqual(['a modifié « Jardin de la Garenne » (mardi)']);
    const unset = run(r.trip, [op('updateStep', { stepId: 'relax', unset: ['note'] })]);
    expect(stepOf(unset.trip, 'relax')).not.toHaveProperty('note');
    expect(run(t, [op('updateStep', { stepId: 'relax', set: { start: '08:00' } })]).rejected[0].code).toBe('INVALID');
  });

  it('setDayWeather, setDayLodging, setLodging, removeLodging', () => {
    const t = makeTrip();
    const lodging = { id: 'hotel', name: 'Hôtel du Centre', address: '1 place', lat: museum.lat, lon: museum.lon, nights: ['2026-10-06'] };
    const r = run(t, [
      op('setDayWeather', { dayId: day(t, 0).id, weatherAvailable: true, weather: { 10: 20 } }),
      op('setLodging', { lodging }),
      op('setDayLodging', { dayId: day(t, 0).id, startLodgingId: null, endLodgingId: 'hotel' })
    ]);
    expect(day(r.trip, 0)).toMatchObject({ weatherAvailable: true, weather: { 10: 20 }, endLodgingId: 'hotel' });
    expect(day(r.trip, 0).returnTravelMin).toBeGreaterThan(0);
    expect(r.summaries.map((s) => s.text)).toEqual(["a ajouté l'hébergement « Hôtel du Centre »"]);
    const removed = run(r.trip, [op('removeLodging', { lodgingId: 'hotel' }), op('removeLodging', { lodgingId: 'hotel' })]);
    expect(removed.trip.lodgings).toEqual([]);
    expect(removed.rejected.map((x) => x.code)).toEqual(['TARGET_GONE']);
  });

  it('updateCandidates et setImages', () => {
    const t = makeTrip();
    const image = { thumbUrl: 'https://upload.wikimedia.org/x.jpg', width: 4, height: 3, credit: { license: 'CC0', sourceUrl: 'https://commons.wikimedia.org/x' } };
    const r = run(t, [op('updateCandidates', { remove: ['bistro'], add: [garden] }), op('setImages', { images: { museum: image }, destinationWikidata: 'Q1' })]);
    expect(r.trip.candidates.map((p) => p.id)).toEqual(['garden']);
    expect(stepOf(r.trip, 'culture').place.image).toEqual(image);
    expect(r.trip.destination.wikidata).toBe('Q1');
    expect(r.summaries).toEqual([]);
  });

  it('renameTrip et deleteTrip réservés à l’owner ; switchReview interdite dans un séjour partagé', () => {
    const t = makeTrip();
    const rename = op('renameTrip', { title: 'Week-end' });
    const del = op('deleteTrip', {});
    const review = op('switchReview', { to: 'original' });
    expect(run(t, [rename, del, review], { role: 'editor', memberCount: 3 }).rejected).toEqual([
      { opId: rename.opId, code: 'FORBIDDEN' },
      { opId: del.opId, code: 'FORBIDDEN' },
      { opId: review.opId, code: 'SHARED_TRIP' }
    ]);
    const owner = run(t, [rename], { role: 'owner', memberCount: 3 });
    expect(owner.trip.title).toBe('Week-end');
    expect(owner.summaries[0].text).toBe('a renommé le séjour en « Week-end »');
    expect(run(t, [del], { role: 'owner' }).trip.deleted).toBe(true);
  });

  it('createTrip seulement si le séjour n’existe pas ; rien sur un séjour supprimé', () => {
    const t = makeTrip();
    expect(run(null, [op('createTrip', { trip: t })]).trip).toEqual({ ...t, deleted: false });
    expect(run(t, [op('createTrip', { trip: t })]).rejected[0].code).toBe('EXISTS');
    expect(run({ ...t, deleted: true }, [op('removeStep', { stepId: 'culture' })]).rejected[0].code).toBe('TRIP_DELETED');
  });

  it('opération mal formée -> INVALID, les autres opérations du lot sont appliquées', () => {
    const t = makeTrip();
    const r = run(t, [{ opId: 'pas-un-uuid', type: 'removeStep', params: { stepId: 'culture' } }, { opId: crypto.randomUUID(), type: 'inconnue', params: {} }, op('removeStep', { stepId: 'lunch' })]);
    expect(r.rejected.map((x) => x.code)).toEqual(['INVALID', 'INVALID']);
    expect(ids(day(r.trip, 0))).toEqual(['culture', 'outdoor', 'relax']);
  });
});

describe('applyOps : fuseau horaire du séjour', () => {
  const tz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tz;
  });

  it('le jour de la semaine des résumés suit la date du séjour, quel que soit le fuseau de la machine', () => {
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC']) {
      process.env.TZ = zone;
      expect(weekday('2026-10-10')).toBe('samedi');
      const t = makeTrip();
      expect(run(t, [op('setStepDone', { stepId: 'culture', status: 'done', completedAt: '23:50' })]).summaries[0].text).toBe('a validé « Musée Paul-Dini » (mardi)');
    }
  });

  it("l'heure de validation est gardée telle quelle (heure de la destination, jamais convertie)", () => {
    const t = { ...makeTrip(), timezone: 'Asia/Tokyo' };
    expect(stepOf(run(t, [op('setStepDone', { stepId: 'culture', status: 'done', completedAt: '00:05' })]).trip, 'culture').completedAt).toBe('00:05');
  });
});

describe('applyOps : modifications concurrentes', () => {
  it('deux lots sur des étapes différentes : même résultat dans un ordre ou dans l’autre', () => {
    const t = makeTrip();
    const a = [op('setStepTime', { stepId: 'culture', start: '09:30', end: '11:00', customTime: true }), op('setStepDone', { stepId: 'lunch', status: 'done', completedAt: '13:40' })];
    const b = [op('replaceStep', { stepId: 'dinner', place: null }), op('removeStep', { stepId: 'relax' }), op('updateStep', { stepId: 'outdoor', set: { note: 'Pique-nique' } })];
    const ab = run(run(t, a).trip, b).trip;
    const ba = run(run(t, b).trip, a).trip;
    expect(ab).toEqual(ba);
    expect(stepOf(ab, 'culture').start).toBe('09:30');
    expect(stepOf(ab, 'relax')).toBeUndefined();
  });

  it('deux lots sur la même étape : le dernier appliqué l’emporte', () => {
    const t = makeTrip();
    const first = [op('setStepTime', { stepId: 'culture', start: '09:30', end: '11:00' })];
    const last = [op('setStepTime', { stepId: 'culture', start: '10:15', end: '11:45' })];
    expect(stepOf(run(run(t, first).trip, last).trip, 'culture').start).toBe('10:15');
  });

  it('une étape supprimée par l’un : l’opération de l’autre sur cette étape est refusée, le reste de son lot est appliqué', () => {
    const t = makeTrip();
    const removed = run(t, [op('removeStep', { stepId: 'outdoor' })]).trip;
    const late = op('setStepTime', { stepId: 'outdoor', start: '15:00', end: '16:30' });
    const r = run(removed, [late, op('setStepDone', { stepId: 'culture', status: 'done', completedAt: '11:00' })]);
    expect(r.rejected).toEqual([{ opId: late.opId, code: 'TARGET_GONE' }]);
    expect(stepOf(r.trip, 'culture').status).toBe('done');
  });
});
