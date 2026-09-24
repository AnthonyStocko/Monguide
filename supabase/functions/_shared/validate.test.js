import { describe, expect, it } from 'vitest';
import { readDate, readEnum, readJsonBody, readNumber, readPoint, readString, readTimeZone } from './validate.js';

const bad = (fn) => expect(fn).toThrow(expect.objectContaining({ status: 400, code: 'invalid_input' }));

describe('validate', () => {
  it('lit les nombres, y compris en chaîne, avec bornes', () => {
    expect(readNumber('45.99', 'lat')).toBe(45.99);
    expect(readNumber(20, 'radiusKm', { min: 1, max: 50 })).toBe(20);
    bad(() => readNumber('', 'lat'));
    bad(() => readNumber('abc', 'lat'));
    bad(() => readNumber(51, 'radiusKm', { min: 1, max: 50 }));
  });

  it('lit une position valide', () => {
    expect(readPoint('45.99', '4.72')).toEqual({ lat: 45.99, lon: 4.72 });
    bad(() => readPoint(91, 0));
    bad(() => readPoint(0, -181));
  });

  it('lit une valeur parmi une liste, avec valeur par défaut', () => {
    expect(readEnum('en', 'lang', ['fr', 'en'])).toBe('en');
    expect(readEnum(undefined, 'lang', ['fr', 'en'], 'fr')).toBe('fr');
    bad(() => readEnum('de', 'lang', ['fr', 'en']));
  });

  it('lit une chaîne de longueur bornée', () => {
    expect(readString('  Villefranche ', 'q', { min: 3 })).toBe('Villefranche');
    bad(() => readString('Vi', 'q', { min: 3 }));
    bad(() => readString(null, 'q'));
  });

  it('lit une date et un fuseau', () => {
    expect(readDate('2026-10-06', 'startDate')).toBe('2026-10-06');
    bad(() => readDate('2026-02-30', 'startDate'));
    expect(readTimeZone('Europe/Paris')).toBe('Europe/Paris');
    bad(() => readTimeZone('Europe/Nowhere'));
  });

  it('lit un corps JSON objet', async () => {
    const req = (body) => new Request('https://x/', { method: 'POST', body });
    expect(await readJsonBody(req('{"a":1}'))).toEqual({ a: 1 });
    await expect(readJsonBody(req('[1]'))).rejects.toMatchObject({ status: 400 });
    await expect(readJsonBody(req('nope'))).rejects.toMatchObject({ status: 400 });
  });
});
