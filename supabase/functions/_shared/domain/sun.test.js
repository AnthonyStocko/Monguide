import { describe, expect, it } from 'vitest';
import { sunTimes } from './sun.js';
import { toMinutes } from './time.js';

const near = (actual, expected, toleranceMin = 4) => expect(Math.abs(toMinutes(actual) - toMinutes(expected))).toBeLessThanOrEqual(toleranceMin);

describe('sunTimes', () => {
  it('Bruxelles en décembre : nuit vers 16:40', () => {
    const { sunrise, sunset } = sunTimes('2026-12-11', { lat: 50.85, lon: 4.35 }, 'Europe/Brussels');
    near(sunset, '16:39');
    near(sunrise, '08:36');
  });

  it('Lyon en mai : coucher vers 21:00 (heure d’été)', () => {
    near(sunTimes('2027-05-14', { lat: 45.76, lon: 4.83 }, 'Europe/Paris').sunset, '21:01');
  });

  it('Barcelone en juillet et Athènes en hiver, dans leur fuseau', () => {
    near(sunTimes('2027-07-10', { lat: 41.38, lon: 2.18 }, 'Europe/Madrid').sunset, '21:28');
    near(sunTimes('2026-12-21', { lat: 37.98, lon: 23.73 }, 'Europe/Athens').sunset, '17:10');
  });

  it('nuit polaire : pas de coucher', () => {
    expect(sunTimes('2026-12-21', { lat: 78.22, lon: 15.65 }, 'Arctic/Longyearbyen').sunset).toBeNull();
  });
});
