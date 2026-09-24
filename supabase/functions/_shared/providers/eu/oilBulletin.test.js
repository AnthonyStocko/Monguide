import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { excelSerialToDate, readFirstSheet } from '../../services/xlsx.js';
import { parseEcbRates, parseOilBulletin, toFuelRows } from './oilBulletin.js';

// Vrais fichiers téléchargés le 2026-09-24 (bulletin du 2026-09-21, taux BCE du 2026-09-23).
const WOB = new Uint8Array(readFileSync(new URL('./fixtures/wob-2026-09-21.xlsx', import.meta.url)));
const ECB = readFileSync(new URL('./fixtures/ecb-2026-09-23.xml', import.meta.url), 'utf8');

describe('xlsx', () => {
  it('lit la première feuille du bulletin (textes partagés et nombres)', async () => {
    const rows = await readFirstSheet(WOB);
    expect(rows[0][0]).toBe('in EUR');
    expect(rows[1][0]).toBe(46286);
    expect(rows.find((r) => r[0] === 'Austria')[1]).toBeCloseTo(1008.9, 5);
  });

  it('convertit un numéro de série Excel en date', () => {
    expect(excelSerialToDate(46286)).toBe('2026-09-21');
    expect(excelSerialToDate(45658)).toBe('2025-01-01');
  });
});

describe('parseOilBulletin', () => {
  it('lit la date et les prix par litre des 27 pays', async () => {
    const { bulletinDate, prices } = await parseOilBulletin(WOB);
    expect(bulletinDate).toBe('2026-09-21');
    expect(new Set(prices.map((p) => p.country)).size).toBe(27);
    expect(prices).toContainEqual({ country: 'PL', fuel: 'sp95', eurPerLitre: 1.062 });
    expect(prices).toContainEqual({ country: 'PL', fuel: 'diesel', eurPerLitre: 1.269 });
    // L\'Autriche ne publie pas de prix GPL : aucune ligne inventée.
    expect(prices.some((p) => p.country === 'AT' && p.fuel === 'lpg')).toBe(false);
  });
});

describe('parseEcbRates / toFuelRows', () => {
  it('lit les taux BCE', () => {
    const ecb = parseEcbRates(ECB);
    expect(ecb.date).toBe('2026-09-23');
    expect(ecb.rates.PLN).toBe(4.3765);
    expect(ecb.rates.EUR).toBe(1);
  });

  it('convertit les prix dans la monnaie du pays (złoty pour la Pologne)', async () => {
    const rows = toFuelRows(await parseOilBulletin(WOB), parseEcbRates(ECB));
    const pl = rows.find((r) => r.country_code === 'PL' && r.fuel === 'sp95');
    expect(pl).toEqual({
      country_code: 'PL',
      fuel: 'sp95',
      price: 4.648,
      currency: 'PLN',
      price_eur: 1.062,
      bulletin_date: '2026-09-21',
      exchange_rate_date: '2026-09-23'
    });
    const pt = rows.find((r) => r.country_code === 'PT' && r.fuel === 'diesel');
    expect(pt).toMatchObject({ currency: 'EUR', price: pt.price_eur });
  });

  it('refuse un fichier au format inattendu', async () => {
    await expect(parseOilBulletin(new Uint8Array([1, 2, 3]))).rejects.toThrow(TypeError);
    expect(() => parseEcbRates('<xml/>')).toThrow(TypeError);
  });
});
