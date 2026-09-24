import { afterEach, describe, expect, it } from 'vitest';
import { Settings } from 'luxon';
import { destinationLocalDate, fromMinutes, hoursCovered, nowInZone, slotToInstant, toMinutes } from './time.js';

describe('slotToInstant', () => {
  afterEach(() => {
    Settings.defaultZone = 'system';
  });

  it('convertit une heure de Lisbonne, Paris et Athènes en instant absolu', () => {
    expect(slotToInstant('2026-07-10', '10:00', 'Europe/Lisbon').toISOString()).toBe('2026-07-10T09:00:00.000Z');
    expect(slotToInstant('2026-07-10', '10:00', 'Europe/Paris').toISOString()).toBe('2026-07-10T08:00:00.000Z');
    expect(slotToInstant('2026-07-10', '10:00', 'Europe/Athens').toISOString()).toBe('2026-07-10T07:00:00.000Z');
    expect(slotToInstant('2026-01-10', '10:00', 'Europe/Lisbon').toISOString()).toBe('2026-01-10T10:00:00.000Z');
    expect(slotToInstant('2026-01-10', '10:00', 'Europe/Athens').toISOString()).toBe('2026-01-10T08:00:00.000Z');
  });

  it("passage à l'heure d'été : décalage appliqué, heure inexistante avancée d'une heure", () => {
    // 29 mars 2026 : 02:00 -> 03:00 à Paris.
    expect(slotToInstant('2026-03-28', '10:00', 'Europe/Paris').toISOString()).toBe('2026-03-28T09:00:00.000Z');
    expect(slotToInstant('2026-03-29', '10:00', 'Europe/Paris').toISOString()).toBe('2026-03-29T08:00:00.000Z');
    expect(slotToInstant('2026-03-29', '02:30', 'Europe/Paris').toISOString()).toBe('2026-03-29T01:30:00.000Z');
    // Lisbonne : 01:00 -> 02:00 ; Athènes : 03:00 -> 04:00.
    expect(slotToInstant('2026-03-29', '09:00', 'Europe/Lisbon').toISOString()).toBe('2026-03-29T08:00:00.000Z');
    expect(slotToInstant('2026-03-29', '09:00', 'Europe/Athens').toISOString()).toBe('2026-03-29T06:00:00.000Z');
  });

  it("passage à l'heure d'hiver : heure en double = première occurrence", () => {
    // 25 octobre 2026 : 03:00 -> 02:00 à Paris.
    expect(slotToInstant('2026-10-25', '02:30', 'Europe/Paris').toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(slotToInstant('2026-10-25', '10:00', 'Europe/Paris').toISOString()).toBe('2026-10-25T09:00:00.000Z');
    expect(slotToInstant('2026-10-24', '10:00', 'Europe/Paris').toISOString()).toBe('2026-10-24T08:00:00.000Z');
  });

  it('ne dépend pas du fuseau du téléphone (réglé sur New York ou Tokyo)', () => {
    for (const zone of ['America/New_York', 'Asia/Tokyo', 'UTC']) {
      Settings.defaultZone = zone;
      expect(slotToInstant('2026-07-10', '10:00', 'Europe/Paris').toISOString()).toBe('2026-07-10T08:00:00.000Z');
      expect(slotToInstant('2026-07-10', '10:00', 'Europe/Lisbon').toISOString()).toBe('2026-07-10T09:00:00.000Z');
    }
  });

  it('refuse une date, une heure ou un fuseau invalides', () => {
    expect(() => slotToInstant('2026-7-10', '10:00', 'Europe/Paris')).toThrow(RangeError);
    expect(() => slotToInstant('2026-07-10', '25:00', 'Europe/Paris')).toThrow(RangeError);
    expect(() => slotToInstant('2026-07-10', '10:00', 'Mars/Base')).toThrow(RangeError);
  });
});

describe('nowInZone', () => {
  afterEach(() => {
    Settings.defaultZone = 'system';
  });

  it("donne la date et l'heure de la destination, pas celles du téléphone", () => {
    Settings.defaultZone = 'America/New_York';
    const instant = Date.UTC(2026, 6, 10, 22, 30); // 18:30 à New York
    expect(nowInZone('Europe/Paris', instant)).toEqual({ date: '2026-07-11', time: '00:30' });
    expect(nowInZone('Europe/Lisbon', instant)).toEqual({ date: '2026-07-10', time: '23:30' });
    expect(nowInZone('Europe/Athens', instant)).toEqual({ date: '2026-07-11', time: '01:30' });
  });

  it("suit les changements d'heure", () => {
    expect(nowInZone('Europe/Paris', Date.UTC(2026, 2, 29, 0, 59))).toEqual({ date: '2026-03-29', time: '01:59' });
    expect(nowInZone('Europe/Paris', Date.UTC(2026, 2, 29, 1, 0))).toEqual({ date: '2026-03-29', time: '03:00' });
    expect(nowInZone('Europe/Paris', Date.UTC(2026, 9, 25, 0, 30))).toEqual({ date: '2026-10-25', time: '02:30' });
    expect(nowInZone('Europe/Paris', Date.UTC(2026, 9, 25, 1, 30))).toEqual({ date: '2026-10-25', time: '02:30' });
  });

  it('refuse un fuseau invalide', () => {
    expect(() => nowInZone('Mars/Base', 0)).toThrow(RangeError);
  });
});

describe('time', () => {
  it('convertit "HH:mm" en minutes et inversement', () => {
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('12:30')).toBe(750);
    expect(fromMinutes(750)).toBe('12:30');
    expect(fromMinutes(9 * 60 + 5)).toBe('09:05');
    expect(fromMinutes(2000)).toBe('23:59');
    expect(() => toMinutes('24:00')).toThrow(RangeError);
    expect(() => toMinutes('9:00')).toThrow(RangeError);
  });

  it('liste les heures pleines d\'un créneau', () => {
    expect(hoursCovered('14:30', '16:00')).toEqual(['14', '15']);
    expect(hoursCovered('10:00', '10:30')).toEqual(['10']);
    expect(hoursCovered('17:30', '18:15')).toEqual(['17', '18']);
  });

  it('construit un Date dont les champs LOCAUX sont l\'heure de la destination', () => {
    const d = destinationLocalDate('2026-10-05', '12:30');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 5, 12, 30]);
    expect(d.getDay()).toBe(1); // lundi, quel que soit le fuseau de l'environnement
  });
});
