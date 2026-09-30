import { describe, expect, it } from 'vitest';
import { mergePlaces } from './listCandidates.js';
import { pagePlaces } from './pagePlaces.js';
import { C, place, rules } from './testing/dayFixture.js';

// 45 parcs et 5 musées, de plus en plus loin de C.
const places = [...Array.from({ length: 45 }, (_, i) => place(`park-${String(i).padStart(2, '0')}`, 'park', 0.1 * (i + 1))), ...Array.from({ length: 5 }, (_, i) => place(`museum-${i}`, 'museum', 0.05 * (i + 1)))];

describe('pagePlaces', () => {
  it('filtre par catégories, du plus proche au plus loin, par pages de 20', () => {
    const first = pagePlaces(places, { point: C, categories: ['park'] }, rules);
    expect(first.places).toHaveLength(20);
    expect(first.places[0].id).toBe('park-00');
    expect(first).toMatchObject({ total: 45, nextOffset: 20 });
    expect(pagePlaces(places, { point: C, categories: ['park'], offset: 40 }, rules)).toMatchObject({ total: 45, nextOffset: null });
    expect(pagePlaces(places, { point: C, categories: ['park'], offset: 40 }, rules).places).toHaveLength(5);
  });

  it('sans catégories : toutes ; au-delà de la fin : page vide', () => {
    expect(pagePlaces(places, { point: C }, rules).places[0].id).toBe('museum-0');
    expect(pagePlaces(places, { point: C, offset: 100 }, rules)).toEqual({ places: [], total: 50, nextOffset: null });
  });

  it('« Plus de résultats » page après page : aucun doublon, aucun oubli', () => {
    let shown = [];
    let offset = 0;
    while (offset !== null) {
      const page = pagePlaces(places, { point: C, categories: ['park', 'museum'], offset }, rules);
      shown = mergePlaces(shown, page.places);
      offset = page.nextOffset;
    }
    expect(shown).toHaveLength(50);
    expect(new Set(shown.map((p) => p.id)).size).toBe(50);
  });
});
