import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, eachDate, isValidDate, isValidTimeZone, todayIn } from './dates.js';

describe('isValidDate', () => {
  it('reconnaît les dates calendaires valides', () => {
    expect(isValidDate('2026-09-24')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
  });

  it('refuse les dates impossibles ou mal formées', () => {
    for (const v of ['2026-02-30', '2026-13-01', '2026-9-24', '24/09/2026', '', null, 20260924]) {
      expect(isValidDate(v)).toBe(false);
    }
  });
});

describe('addDays / daysBetween / eachDate', () => {
  it('ajoute des jours en franchissant mois, années et changements d\'heure', () => {
    expect(addDays('2026-09-24', 12)).toBe('2026-10-06');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('compte les jours entre deux dates', () => {
    expect(daysBetween('2026-09-24', '2026-10-09')).toBe(15);
    expect(daysBetween('2026-10-09', '2026-09-24')).toBe(-15);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('liste les dates bornes incluses', () => {
    expect(eachDate('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(eachDate('2026-10-02', '2026-10-01')).toEqual([]);
  });

  it('rejette une date invalide', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
  });
});

describe('todayIn', () => {
  it('donne la date dans le fuseau demandé, pas celui de l\'appareil', () => {
    const instant = new Date('2026-09-24T23:30:00Z');
    expect(todayIn('Europe/Paris', instant)).toBe('2026-09-25');
    expect(todayIn('Europe/London', instant)).toBe('2026-09-25');
    expect(todayIn('Atlantic/Azores', instant)).toBe('2026-09-24');
  });
});

describe('isValidTimeZone', () => {
  it('reconnaît les fuseaux IANA', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});
