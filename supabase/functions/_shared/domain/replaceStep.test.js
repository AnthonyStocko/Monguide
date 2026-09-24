import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { destinationPoint } from './geo.js';
import { alternativesFor, replaceStepPlace, usedPlaceIds } from './replaceStep.js';

const HOME = { lat: 45.99, lon: 4.72 };
const p = (id, category, km, extra = {}) => ({ id, name: id, category, ...destinationPoint(HOME, km, 45), indoor: category === 'museum' || category === 'restaurant', certified: false, ...extra });

function trip() {
  return {
    mode: 'walk',
    lunch: 'both',
    lodgings: [],
    days: [
      {
        date: '2026-10-06',
        steps: [
          { id: 's1', type: 'culture', place: p('museum-used', 'museum', 0.2), start: '10:00', end: '11:30', badges: [] },
          { id: 's2', type: 'lunch', place: p('resto-used', 'restaurant', 0.3), start: '12:30', end: '13:45', badges: ['hours_unconfirmed'] },
          { id: 's3', type: 'outdoor', place: p('park-used', 'park', 0.5), start: '14:30', end: '16:00', badges: [] }
        ]
      }
    ],
    candidates: [p('museum-far', 'museum', 5), p('museum-near', 'museum', 0.4), p('monument-mid', 'monument', 1), p('museum-3', 'museum', 3), p('resto-2', 'restaurant', 0.4), p('market-1', 'market', 2), p('park-2', 'park', 1)]
  };
}

describe('alternativesFor', () => {
  it('propose les 3 meilleurs candidats du créneau, les plus proches d\'abord, jamais un lieu utilisé', () => {
    expect(alternativesFor(trip(), 0, 0).map((x) => x.id)).toEqual(['museum-near', 'monument-mid', 'museum-3']);
  });

  it('pause déjeuner en mode "Les deux" : propose d\'abord l\'autre type', () => {
    expect(alternativesFor(trip(), 0, 1).map((x) => x.id)).toEqual(['market-1', 'resto-2']);
  });

  it('ajoute les lieux supplémentaires du serveur ("Plus de choix") sans doublon', () => {
    const extra = [p('museum-new', 'museum', 0.25), p('museum-near', 'museum', 0.4), p('museum-used', 'museum', 0.2)];
    expect(alternativesFor(trip(), 0, 0, { extraPlaces: extra, limit: 5 }).map((x) => x.id)).toEqual(['museum-new', 'museum-near', 'monument-mid', 'museum-3', 'museum-far']);
  });
});

describe('replaceStepPlace', () => {
  it('échange le lieu, remet l\'ancien dans la réserve et recalcule les trajets', () => {
    const t = trip();
    const next = replaceStepPlace(t, 0, 1, t.candidates.find((c) => c.id === 'market-1'), RULES);
    expect(next.days[0].steps[1]).toMatchObject({ place: { id: 'market-1' }, indoor: false, badges: [] });
    expect(next.candidates.map((c) => c.id)).toContain('resto-used');
    expect(next.candidates.map((c) => c.id)).not.toContain('market-1');
    expect(usedPlaceIds(next).has('market-1')).toBe(true);
    expect(next.days[0].steps[1].travelFromPreviousMin).toBeGreaterThan(0);
    expect(t.days[0].steps[1].place.id).toBe('resto-used'); // séjour d'origine intact
  });
});
