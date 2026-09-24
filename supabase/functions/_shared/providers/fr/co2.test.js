import { describe, expect, it } from 'vitest';
import fr from './index.js';
import { co2FactorsFr } from './co2.js';

describe('co2 (fr)', () => {
  it('donne les facteurs ADEME : voiture par carburant, transports en commun par passager-km', async () => {
    const f = co2FactorsFr();
    expect(f.car.diesel).toBe(3.1);
    expect(f.car.sp95).toBe(2.69);
    expect(f.transitKgPerPkm).toBe(0.00503);
    expect(await fr.co2Factors('FR')).toEqual(f);
  });
});
