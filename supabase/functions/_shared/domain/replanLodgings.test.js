import { describe, expect, it } from 'vitest';
import { applyChanges } from './applyChanges.js';
import { checkDayInvariants } from './checkDayInvariants.js';
import { replanLodgings } from './replanLodgings.js';
import { travelMinutes } from './travel.js';
import { at, museum, place, rules, standardDay, step, trip } from './testing/dayFixture.js';

const twoDays = (candidates = []) => {
  const d2 = standardDay('2026-10-07');
  d2.steps = d2.steps.map((s) => ({ ...s, id: `d2-${s.id}`, place: { ...s.place, id: `d2-${s.place.id}` } }));
  return trip([standardDay('2026-10-06'), d2], candidates);
};
const hotel = { id: 'hotel', name: 'Hôtel du Parc', address: 'Place des Arts', ...at(-0.2), nights: ['2026-10-06'] };

describe('replanLodgings', () => {
  it('ajout d\'un hébergement à un séjour qui n\'en avait pas : départ conseillé pour chaque journée concernée', () => {
    const t = twoDays();
    const { trip: next, proposal } = replanLodgings(t, [hotel], rules);
    const leg = travelMinutes(hotel, museum, 'walk', rules);
    expect(proposal.changes).toEqual([
      { kind: 'departure', stepId: 'departure:2026-10-06', dayIndex: 0, date: '2026-10-06', from: null, to: `09:${String(60 - leg).padStart(2, '0')}`, lodgingName: 'Hôtel du Parc' },
      expect.objectContaining({ kind: 'departure', dayIndex: 1, from: null, lodgingName: 'Hôtel du Parc' })
    ]);
    const applied = applyChanges(next, proposal, {}, rules);
    expect(applied.lodgings).toEqual([hotel]);
    expect(applied.days[0]).toMatchObject({ startLodgingId: 'hotel', endLodgingId: 'hotel', departure: { travelMin: leg } });
    expect(applied.days[0].returnTravelMin).toBeGreaterThan(0);
    for (const d of applied.days) expect(checkDayInvariants(d, { trip: applied, mode: 'walk' }, rules)).toEqual([]);
  });

  it('journées inchangées : aucune proposition', () => {
    const t = { ...twoDays(), lodgings: [hotel] };
    t.days = t.days.map((d) => ({ ...d, startLodgingId: 'hotel', endLodgingId: 'hotel' }));
    expect(replanLodgings(t, [hotel], rules).proposal.changes).toEqual([]);
  });

  it('suppression de l\'hébergement : départ et retour retirés', () => {
    const withHotel = applyChanges(...Object.values(replanLodgings(twoDays(), [hotel], rules)), {}, rules);
    const { trip: next, proposal } = replanLodgings(withHotel, [], rules);
    expect(proposal.changes[0]).toMatchObject({ kind: 'departure', from: expect.any(String), to: null, lodgingName: null });
    const applied = applyChanges(next, proposal, {}, rules);
    expect(applied.days[0].departure).toBeUndefined();
    expect(applied.days[0].startLodgingId).toBeUndefined();
  });

  it('première étape à plus de 45 min de l\'hébergement : lieu plus proche proposé', () => {
    // Hôtel à 3,5 km du musée (55 min à pied) ; musée de remplacement à 2,2 km, à moins de 45 min de l'hôtel et du déjeuner.
    const far = { ...hotel, ...at(-3.5) };
    const nearMuseum = place('near', 'museum', -2.2, { name: 'Musée proche' });
    const { proposal } = replanLodgings(twoDays([nearMuseum]), [far], rules);
    expect(proposal.changes.find((c) => c.kind === 'replaced')).toMatchObject({ stepId: 'culture', reason: 'TRAVEL', name: 'Musée proche', dayIndex: 0 });
    expect(step).toBeDefined();
  });
});
