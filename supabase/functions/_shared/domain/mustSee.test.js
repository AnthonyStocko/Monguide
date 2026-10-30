import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { destinationPoint } from './geo.js';
import { openOn, planMustSees, selectMustSees } from './mustSee.js';

const BRUSSELS = { lat: 50.8483, lon: 4.3498 };
const at = (id, km, bearing, notoriety, extra = {}) => ({
  id,
  name: id,
  category: 'monument',
  ...destinationPoint(BRUSSELS, km, bearing),
  source: 'wikidata',
  certified: true,
  indoor: null,
  notoriety,
  ...extra
});
const DATES_3 = ['2026-12-11', '2026-12-12', '2026-12-13'];
const ctx = (dates = DATES_3) => ({ anchors: [BRUSSELS], radiusKm: 3, dates, countryCode: 'BE' });

describe('selectMustSees', () => {
  const pool = Array.from({ length: 14 }, (_, i) => at(`p${i}`, 0.2 + i * 0.1, i * 25, 90 - i * 3));

  it('jours × perDay lieux, entre min et max, les plus connus d’abord', () => {
    expect(selectMustSees(pool, ctx(['2026-12-11']), RULES)).toHaveLength(RULES.notoriety.mustSee.min);
    expect(selectMustSees(pool, ctx(DATES_3.slice(0, 2)), RULES)).toHaveLength(6);
    expect(selectMustSees(pool, ctx(), RULES).map((p) => p.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
    const week = ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', ...DATES_3];
    expect(selectMustSees(pool, ctx(week), RULES)).toHaveLength(RULES.notoriety.mustSee.max);
  });

  it('écarte les lieux trop peu connus, trop loin du logement, ou fermés pendant tout le séjour', () => {
    const lowScore = at('obscure', 0.2, 0, RULES.notoriety.mustSee.minScore - 1);
    const far = at('far', 6, 0, 99);
    // Ouvert le lundi seulement : fermé du vendredi au dimanche.
    const mondayOnly = at('monday', 0.3, 0, 99, { category: 'museum', indoor: true, openingHours: 'Mo 10:00-17:00' });
    const chosen = selectMustSees([lowScore, far, mondayOnly, at('ok', 0.4, 0, 70)], ctx(), RULES).map((p) => p.id);
    expect(chosen).toEqual(['ok']);
    expect(openOn(mondayOnly, '2026-12-14', 'BE')).toBe(true);
    expect(openOn(mondayOnly, '2026-12-11', 'BE')).toBe(false);
    expect(openOn(at('unknown', 0.3, 0, 99), '2026-12-11', 'BE')).toBe(true); // horaires inconnus : ouvert
  });
});

describe('planMustSees', () => {
  it('répartit les lieux sur les jours, les coups d’œil à part', () => {
    const mustSees = [at('a', 0.3, 0, 95), at('b', 0.4, 90, 90), at('c', 0.5, 180, 85), at('g', 0.5, 270, 80, { glance: true }), at('d', 0.6, 45, 75)];
    const { days, unplaced } = planMustSees(mustSees, { dates: DATES_3, weather: [], countryCode: 'BE' }, RULES);
    expect(unplaced).toEqual([]);
    expect(days.map((d) => d.filter((p) => !p.glance).length).sort()).toEqual([1, 1, 2]);
    // Le 4e lieu rejoint le jour dont l'incontournable est le plus proche (b, à 90°).
    expect(days.find((d) => d.some((p) => p.id === 'd')).map((p) => p.id)).toContain('b');
    expect(days.flat().map((p) => p.id).sort()).toEqual(['a', 'b', 'c', 'd', 'g']);
    // Le coup d'œil ne compte pas dans les visites : il va au premier jour, le moins chargé en coups d'œil.
    expect(days[0].some((p) => p.id === 'g')).toBe(true);
  });

  it('place un lieu en plein air un jour sans pluie, un lieu couvert n’importe quel jour', () => {
    const rainy = Object.fromEntries(['10', '11', '12', '13', '14', '15', '16', '17'].map((h) => [h, 90]));
    const dry = Object.fromEntries(['10', '11', '12', '13', '14', '15', '16', '17'].map((h) => [h, 5]));
    const indoor = at('cathedral', 0.3, 0, 95, { indoor: true });
    const outdoor = at('square', 0.3, 90, 90, { indoor: false });
    const { days } = planMustSees([indoor, outdoor], { dates: DATES_3.slice(0, 2), weather: [dry, rainy], countryCode: 'BE' }, RULES);
    expect(days[0].map((p) => p.id)).toEqual(['cathedral']);
    // Les deux jours ont autant de visites : le plein air va au jour sec, quitte à partager le jour 1.
    const { days: again } = planMustSees([outdoor], { dates: DATES_3.slice(0, 2), weather: [rainy, dry], countryCode: 'BE' }, RULES);
    expect(again[1].map((p) => p.id)).toEqual(['square']);
  });

  it('respecte le nombre maximal de visites par jour', () => {
    const many = Array.from({ length: 5 }, (_, i) => at(`m${i}`, 0.3, i * 60, 90 - i));
    const { days, unplaced } = planMustSees(many, { dates: ['2026-12-11'], weather: [], countryCode: 'BE' }, RULES);
    expect(days[0]).toHaveLength(RULES.notoriety.mustSee.maxVisitsPerDay);
    expect(unplaced).toHaveLength(5 - RULES.notoriety.mustSee.maxVisitsPerDay);
  });
});
