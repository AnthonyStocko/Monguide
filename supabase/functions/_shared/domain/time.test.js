import { describe, expect, it } from 'vitest';
import { destinationLocalDate, fromMinutes, hoursCovered, toMinutes } from './time.js';

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
