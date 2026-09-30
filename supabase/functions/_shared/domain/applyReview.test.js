import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyReview, fixedSignature, plainText, reviewReasons, switchToOriginal, switchToReviewed } from './applyReview.js';
import { buildReviewRequest } from './buildReviewRequest.js';
import { checkDayInvariants } from './checkDayInvariants.js';
import { isFixed, isPersonal } from './stepTiming.js';
import { buildDay, HOURS, rawStep } from './testing/randomDay.js';
import { garden, park, personal, place, restaurant, rules, standardDay, trip } from './testing/dayFixture.js';

const NOW = '2026-09-30T10:00:00.000Z';
const ok = (operations, extra = {}) => ({ ok: true, provider: 'mistral', model: 'mistral-small-latest', json: { operations, dayTitles: {}, summary: 'Résumé.', ...extra } });
const run = (t, response) => applyReview(t, response, rules, { now: NOW });
const byId = (day, id) => day.steps.find((s) => s.id === id);

/** Deux jours types, réserve : musée, restaurant du soir seulement, restaurant ouvert le midi, parc. */
function sample() {
  const eveningOnly = place('evening', 'restaurant', 0.35, { name: 'Le Soir', food: { regional: false, openingHours: 'Mo-Su 19:00-22:00' } });
  const noon = place('noon', 'restaurant', 0.4, { name: 'Le Midi', food: { regional: false, openingHours: 'Mo-Su 11:30-15:00' } });
  const museum2 = place('museum2', 'museum', 0.2, { name: 'Musée 2' });
  const park2 = place('park2', 'park', 1.6, { name: 'Parc 2' });
  const day2 = standardDay('2026-10-07');
  day2.steps = day2.steps.map((s) => ({ ...s, id: `d2-${s.id}`, place: s.place && { ...s.place, id: `d2-${s.place.id}` } }));
  return trip([standardDay('2026-10-06'), day2], [eveningOnly, noon, museum2, park2]);
}

describe('applyReview : cas précis', () => {
  it('échange valide : le parc et le jardin échangent leurs plages', () => {
    const t = sample();
    const r = run(t, ok([{ op: 'swap', stepA: 'outdoor', stepB: 'relax', reason: 'Le jardin avant le parc.' }]));
    expect(r.review).toMatchObject({ status: 'applied', provider: 'mistral', rejectedOps: [], appliedOps: [{ op: 'swap', dayIndex: 0, stepA: 'outdoor', stepB: 'relax', reason: 'Le jardin avant le parc.' }] });
    expect(byId(r.days[0], 'relax')).toMatchObject({ start: '14:30', end: '16:00', place: { id: garden.id } });
    expect(byId(r.days[0], 'outdoor')).toMatchObject({ start: '17:30', end: '19:00', place: { id: park.id } });
    expect(r.days[0].steps.map((s) => s.id)).toEqual(['culture', 'lunch', 'relax', 'outdoor']);
    expect(checkDayInvariants(r.days[0], { trip: r, mode: r.mode }, rules)).toEqual([]);
  });

  it('remplacement par un restaurant fermé sur la plage : rejeté ; ouvert : appliqué', () => {
    const t = sample();
    const closed = run(t, ok([{ op: 'replace', step: 'lunch', candidate: 'evening', reason: 'x' }]));
    expect(closed.review).toMatchObject({ status: 'unchanged', rejectedOps: [{ index: 0, op: 'replace', rejection: 'closed' }], originalDays: null });
    expect(closed.days).toEqual(t.days);
    const open = run(t, ok([{ op: 'replace', step: 'lunch', candidate: 'noon', reason: 'Plus proche.' }]));
    expect(byId(open.days[0], 'lunch').place.id).toBe('noon');
    // L'ancien lieu retourne dans la réserve, le nouveau en sort.
    expect(open.candidates.map((p) => p.id)).toContain(restaurant.id);
    expect(open.candidates.map((p) => p.id)).not.toContain('noon');
  });

  it('étape verrouillée (personnelle ou horaire choisi) : rejetée, jamais modifiée', () => {
    const t = sample();
    t.days[0].steps.splice(2, 0, personal('p', '14:00', '14:20', { km: 0.3 }));
    t.days[0].steps[3] = { ...t.days[0].steps[3], start: '14:30' };
    t.days[0].steps[0] = { ...t.days[0].steps[0], customTime: true };
    const r = run(t, ok([
      { op: 'shift', step: 'p', newStart: '15:00', reason: 'x' },
      { op: 'replace', step: 'culture', candidate: 'museum2', reason: 'x' },
      { op: 'swap', stepA: 'culture', stepB: 'outdoor', reason: 'x' }
    ]));
    expect(r.review.rejectedOps.map((o) => o.rejection)).toEqual(['locked_step', 'locked_step', 'locked_step']);
    expect(r.days).toEqual(t.days);
  });

  it('identifiant inventé (étape ou candidat) : rejeté', () => {
    const r = run(sample(), ok([
      { op: 'replace', step: 'tour-eiffel', candidate: 'noon', reason: 'x' },
      { op: 'replace', step: 'lunch', candidate: 'osm:node/42', reason: 'x' },
      { op: 'swap', stepA: 'outdoor', stepB: 'nowhere', reason: 'x' }
    ]));
    expect(r.review.rejectedOps.map((o) => o.rejection)).toEqual(['unknown_step', 'unknown_candidate', 'unknown_step']);
  });

  it('réponse vide : status "unchanged", titres et résumé gardés, pas de copie des jours', () => {
    const t = sample();
    const r = run(t, ok([], { dayTitles: { '2026-10-06': 'Vieille ville', '2026-12-25': 'Noël' }, summary: 'Un séjour équilibré.' }));
    expect(r.review).toEqual({
      status: 'unchanged', provider: 'mistral', model: 'mistral-small-latest', reviewedAt: NOW,
      appliedOps: [], rejectedOps: [], dayTitles: { '2026-10-06': 'Vieille ville' }, summary: 'Un séjour équilibré.', originalDays: null
    });
    expect(r.days).toEqual(t.days);
  });

  it('pas de relecture (délai, quota…) : status "skipped" avec la raison, planning inchangé', () => {
    const t = sample();
    const r = run(t, { ok: false, reason: 'timeout' });
    expect(r.review).toMatchObject({ status: 'skipped', reason: 'timeout', appliedOps: [], originalDays: null });
    expect(r.days).toEqual(t.days);
    expect(run(t, { ok: true, json: { operations: 'non' } }).review).toMatchObject({ status: 'skipped', reason: 'invalid_json' });
  });

  it('autres refus : candidat déjà utilisé, type incompatible, repas contre visite, jours différents, même étape', () => {
    const t = sample();
    t.candidates.push({ ...park, id: 'd2-park' });
    const r = run(t, ok([
      { op: 'replace', step: 'outdoor', candidate: 'd2-park', reason: 'x' },
      { op: 'replace', step: 'culture', candidate: 'noon', reason: 'x' },
      { op: 'swap', stepA: 'lunch', stepB: 'outdoor', reason: 'x' },
      { op: 'swap', stepA: 'outdoor', stepB: 'd2-relax', reason: 'x' },
      { op: 'swap', stepA: 'outdoor', stepB: 'outdoor', reason: 'x' },
      { op: 'teleport', step: 'outdoor', reason: 'x' }
    ]));
    expect(r.review.rejectedOps.map((o) => o.rejection)).toEqual(['candidate_used', 'candidate_type', 'meal_mismatch', 'different_days', 'same_step', 'malformed']);
  });

  it('décalage : appliqué s\'il tient ; refusé s\'il chevauche, finit trop tard ou si l\'heure est mal formée', () => {
    const t = sample();
    const r = run(t, ok([
      { op: 'shift', step: 'outdoor', newStart: '14:45', reason: 'Moins de hâte.' },
      { op: 'shift', step: 'relax', newStart: '15:00', reason: 'x' },
      { op: 'shift', step: 'relax', newStart: '20:30', reason: 'x' },
      { op: 'shift', step: 'relax', newStart: '25:00', reason: 'x' }
    ]));
    expect(byId(r.days[0], 'outdoor')).toMatchObject({ start: '14:45', end: '16:15' });
    expect(r.review.rejectedOps.map((o) => o.rejection)).toEqual(['overlap', 'late', 'invalid_time']);
  });

  it('au plus rules.ai.maxOpsPerTrip opérations examinées', () => {
    const ops = Array.from({ length: rules.ai.maxOpsPerTrip + 2 }, () => ({ op: 'teleport' }));
    const r = run(sample(), ok(ops));
    expect(r.review.rejectedOps.filter((o) => o.rejection === 'max_ops')).toHaveLength(2);
  });

  it('textes bruts : sans HTML ni lien, longueurs vérifiées', () => {
    expect(plainText('<b>Parc</b> <a href="https://x.io">ici</a> www.pub.com', 40)).toBe('Parc ici');
    expect(plainText('x'.repeat(41), 40)).toBeNull();
    expect(plainText('<script>', 40)).toBeNull();
    const r = run(sample(), ok([], { dayTitles: { '2026-10-06': '<i>Vieille ville</i>', '2026-10-07': 'x'.repeat(41) }, summary: 'Voir https://evil.example.com' }));
    expect(r.review.dayTitles).toEqual({ '2026-10-06': 'Vieille ville' });
    expect(r.review.summary).toBe('Voir');
  });

  it('alias du résumé (buildReviewRequest) résolus vers les vrais identifiants', () => {
    const t = sample();
    const request = buildReviewRequest(t, { language: 'fr' }, rules);
    const outdoor = Object.keys(request.ids.steps).find((a) => request.ids.steps[a] === 'outdoor');
    const relax = Object.keys(request.ids.steps).find((a) => request.ids.steps[a] === 'relax');
    const r = run(t, { ...ok([{ op: 'swap', stepA: outdoor, stepB: relax, reason: 'x' }]), ids: request.ids });
    expect(r.review.appliedOps[0]).toMatchObject({ stepA: 'outdoor', stepB: 'relax' });
    // Un vrai identifiant n'est pas accepté quand des alias sont attendus.
    expect(run(t, { ...ok([{ op: 'swap', stepA: 'outdoor', stepB: 'relax', reason: 'x' }]), ids: request.ids }).review.rejectedOps[0].rejection).toBe('unknown_step');
  });

  it('version d\'origine puis version relue : exactement les plannings (et réserves) de chacune', () => {
    const t = sample();
    const r = run(t, ok([
      { op: 'swap', stepA: 'outdoor', stepB: 'relax', reason: 'Le jardin d\'abord.' },
      { op: 'replace', step: 'lunch', candidate: 'noon', reason: 'Plus proche.' },
      { op: 'shift', step: 'd2-outdoor', newStart: '14:40', reason: 'Moins de hâte.' }
    ]));
    expect(r.review.appliedOps).toHaveLength(3);
    expect(r.review.appliedOps[1]).toMatchObject({ fromName: 'Le Bouchon', toName: 'Le Midi' });
    const back = switchToOriginal(r);
    expect(back.days).toEqual(t.days);
    expect(back.candidates).toEqual(t.candidates);
    expect(back.review).toMatchObject({ status: 'reverted', originalDays: t.days });
    expect(switchToOriginal(back)).toBe(back);
    expect(reviewReasons(back).size).toBe(0);
    const again = switchToReviewed(back);
    expect(again.days).toEqual(r.days);
    expect(again.candidates).toEqual(r.candidates);
    expect(again.review).toEqual(r.review);
    expect(switchToReviewed(again)).toBe(again);
    // Plusieurs allers-retours : toujours exact.
    expect(switchToReviewed(switchToOriginal(switchToReviewed(switchToOriginal(r)))).days).toEqual(r.days);
    // L'original n'est jamais modifié.
    expect(t.days[0].steps.map((s) => s.id)).toEqual(['culture', 'lunch', 'outdoor', 'relax']);
  });

  it('raisons par étape modifiée (version relue seulement)', () => {
    const r = run(sample(), ok([
      { op: 'swap', stepA: 'outdoor', stepB: 'relax', reason: 'Le jardin d\'abord.' },
      { op: 'shift', step: 'd2-outdoor', newStart: '14:40', reason: 'Moins de hâte.' }
    ]));
    expect([...reviewReasons(r)]).toEqual([
      ['outdoor', 'Le jardin d\'abord.'],
      ['relax', 'Le jardin d\'abord.'],
      ['d2-outdoor', 'Moins de hâte.']
    ]);
    expect(reviewReasons(run(sample(), ok([]))).size).toBe(0);
  });
});

describe('applyReview : tests aléatoires (fast-check)', () => {
  const opName = fc.constantFrom('swap', 'replace', 'shift', 'swap', 'replace', 'shift', 'delete', '', null);
  const time = fc.oneof(
    fc.integer({ min: 0, max: 23 * 60 + 59 }).map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`),
    fc.constantFrom('25:00', '9:30', 'midi', '', '23:99')
  );
  const scenario = fc.record({
    days: fc.array(fc.array(rawStep, { minLength: 1, maxLength: 6 }), { minLength: 1, maxLength: 3 }),
    candidates: fc.array(fc.record({ km: fc.integer({ min: -30, max: 30 }), cat: fc.constantFrom('museum', 'monument', 'restaurant', 'market', 'park', 'nature', 'viewpoint'), hours: fc.nat(HOURS.length - 1) }), { maxLength: 10 }),
    ops: fc.array(fc.record({ op: opName, a: fc.nat(40), b: fc.nat(40), c: fc.nat(20), t: time, junk: fc.boolean() }), { maxLength: 12 })
  });

  it('des centaines de réponses au hasard, même absurdes : invariants tenus, étapes fixes intactes, retour exact', () => {
    let applied = 0;
    fc.assert(
      fc.property(scenario, (sc) => {
        const days = sc.days.map((raws, i) => buildDay(raws, `d${i}-`, `2026-10-0${6 + i}`));
        const candidates = sc.candidates.map((c, i) => place(`cand-${i}`, c.cat, c.km / 10, c.cat === 'restaurant' ? { food: { regional: false, ...(HOURS[c.hours] ? { openingHours: HOURS[c.hours] } : {}) } } : HOURS[c.hours] ? { openingHours: HOURS[c.hours] } : {}));
        const t = trip(days, candidates);
        const stepIds = days.flatMap((d) => d.steps.map((s) => s.id));
        const pick = (list, n, junk) => (junk && n % 5 === 0 ? `inventé-${n}` : list[n % Math.max(1, list.length)]);
        const operations = sc.ops.map((o) => ({
          op: o.op,
          stepA: pick(stepIds, o.a, o.junk),
          stepB: pick(stepIds, o.b, o.junk),
          step: pick(stepIds, o.a, o.junk),
          candidate: pick(candidates.map((p) => p.id), o.c, o.junk),
          newStart: o.t,
          reason: o.junk ? '<b>html</b> https://x.io' : 'Motif.'
        }));
        const r = applyReview(t, { ok: true, json: { operations, dayTitles: {}, summary: 'x' } }, rules, { now: NOW });
        if (r.review.status === 'applied') applied += 1;

        for (const [i, day] of r.days.entries()) {
          expect(checkDayInvariants(day, { trip: r, mode: r.mode }, rules)).toEqual([]);
          // Étapes fixes : ni supprimées, ni déplacées, ni modifiées.
          for (const f of t.days[i].steps.filter((s) => isFixed(s) || isPersonal(s))) {
            expect(fixedSignature(day.steps.find((s) => s.id === f.id))).toBe(fixedSignature(f));
          }
          expect(day.steps.map((s) => s.id).sort()).toEqual(t.days[i].steps.map((s) => s.id).sort());
        }
        expect(r.review.appliedOps.length + r.review.rejectedOps.length).toBe(operations.length);
        const back = switchToOriginal(r);
        expect(back.days).toEqual(t.days);
        expect(back.candidates).toEqual(t.candidates);
        expect(switchToReviewed(back).days).toEqual(r.days);
      }),
      { numRuns: 500, seed: 20260930 }
    );
    // Les tests doivent aussi exercer des relectures réellement appliquées.
    expect(applied).toBeGreaterThan(20);
  });
});
