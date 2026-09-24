import { describe, expect, it } from 'vitest';
import { RULES } from './rules.js';
import { flattenRules } from './mergeRules.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

describe('RULES', () => {
  it('ne contient que des nombres positifs, des heures "HH:mm", des chaînes ou des listes', () => {
    for (const [path, value] of Object.entries(flattenRules(RULES))) {
      if (typeof value === 'number') expect(value, path).toBeGreaterThan(0);
      else if (Array.isArray(value)) expect(value.length, path).toBeGreaterThan(0);
      else expect(typeof value, path).toBe('string');
      if (/time|start|end|latest|departure|culture|lunch|outdoor|relax/i.test(path) && typeof value === 'string') {
        expect(value, path).toMatch(HHMM);
      }
    }
  });

  it('a un gabarit de journée dans l\'ordre chronologique', () => {
    const t = RULES.dayTemplate;
    const order = [t.departure, t.culture, t.lunch, t.outdoor, t.relax].map(toMin);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('place le déjeuner du gabarit dans la plage du déjeuner', () => {
    const lunch = toMin(RULES.dayTemplate.lunch);
    expect(lunch).toBeGreaterThanOrEqual(toMin(RULES.lunchWindow.start));
    expect(lunch).toBeLessThanOrEqual(toMin(RULES.lunchWindow.end));
  });

  it('a des durées minimales inférieures ou égales aux durées conseillées', () => {
    for (const d of Object.values(RULES.durations)) {
      expect(d.minimumMin).toBeLessThanOrEqual(d.recommendedMin);
    }
  });

  it('limite la requête Overpass à 200 résultats', () => {
    expect(Object.values(RULES.osm.limits).reduce((a, b) => a + b, 0)).toBe(200);
  });

  it('reprend les valeurs du cahier des charges', () => {
    expect(RULES.travel.detourFactor).toBe(1.3);
    expect(RULES.travel.maxTravelMin).toBe(45);
    expect(RULES.weather.rainThresholdPct).toBe(50);
    expect(RULES.schedule).toEqual({ lastStepLatestStart: '19:00', lateEnd: '21:00' });
    expect(RULES.places.dedupDistanceM).toBe(50);
    expect(RULES.lodging.farFactor).toBe(1.5);
    expect(RULES.notifications).toEqual({ eveningSummaryTime: '19:00', reminderLeadMin: 60 });
    expect(RULES.ui.undoDelaySec).toBe(10);
    expect(RULES.storage.localCacheMaxMb).toBe(20);
    expect(RULES.rateLimits.generatePerWindow).toBe(30);
    expect(RULES.rateLimits.otherPerWindow).toBe(600);
    expect(RULES.cacheTtlSec.config).toBe(300);
    expect(RULES.cacheTtlSec.geocode).toBe(30 * 24 * 3600);
    expect(RULES.places.regionalCuisines).toEqual(['regional', 'french']);
    expect(RULES.osm.timeoutSec).toBe(8);
    expect(RULES.wikidata).toEqual({ timeoutSec: 15, limit: 300 });
    expect(RULES.cacheTtlSec.wikidata).toBe(7 * 24 * 3600);
    expect(RULES.cacheTtlSec.holidays).toBe(30 * 24 * 3600);
    expect(RULES.geocode).toMatchObject({ minChars: 3, debounceMs: 300 });
  });
});
