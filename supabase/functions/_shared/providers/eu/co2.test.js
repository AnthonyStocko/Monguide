import { describe, expect, it } from 'vitest';
import { SUPPORTED_COUNTRIES } from '../../domain/config/countries.js';
import { ELECTRICITY_G_CO2_PER_KWH, co2FactorsFor } from './co2.js';

describe('co2FactorsFor', () => {
  it('donne à la voiture les mêmes facteurs partout', () => {
    expect(co2FactorsFor('PL').car).toEqual(co2FactorsFor('PT').car);
    expect(co2FactorsFor('PL').car.diesel).toBe(3.1);
  });

  it('calcule un facteur transports en commun propre au pays', () => {
    expect(co2FactorsFor('PL').transitKgPerPkm).toBe(0.059);
    expect(co2FactorsFor('NO').transitKgPerPkm).toBe(0.003);
    expect(co2FactorsFor('PL').transitKgPerPkm).toBeGreaterThan(co2FactorsFor('PT').transitKgPerPkm);
  });

  it('utilise la moyenne européenne pour un pays manquant (Liechtenstein)', () => {
    expect(co2FactorsFor('LI').electricity).toEqual({ gPerKwh: 209, year: 2025, euAverage: true });
    expect(co2FactorsFor('PL').electricity.euAverage).toBe(false);
  });

  it('couvre tous les pays pris en charge sauf le Liechtenstein', () => {
    const missing = Object.keys(SUPPORTED_COUNTRIES).filter((c) => !ELECTRICITY_G_CO2_PER_KWH[c]);
    expect(missing).toEqual(['LI']);
  });
});
