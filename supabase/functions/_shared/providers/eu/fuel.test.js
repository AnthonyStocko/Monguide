import { describe, expect, it, vi } from 'vitest';
import { fromBulletinRows, fuel } from './fuel.js';

const ROWS = [
  { country_code: 'PL', fuel: 'sp95', price: 4.648, currency: 'PLN', bulletin_date: '2026-09-21' },
  { country_code: 'PL', fuel: 'diesel', price: 5.554, currency: 'PLN', bulletin_date: '2026-09-21' },
  { country_code: 'PL', fuel: 'sp95', price: 4.5, currency: 'PLN', bulletin_date: '2026-09-14' }
];
const ctx = (countryCode, latest = vi.fn(async () => ROWS)) => ({ countryCode, fuelStore: { latest } });

describe('fuel (eu)', () => {
  it('Pologne : dernier bulletin, en złotys, non estimé', async () => {
    const out = await fuel({ lat: 50.06, lon: 19.94 }, 20, ctx('PL'));
    expect(out).toEqual({
      name: 'fuel',
      status: 'ok',
      data: {
        currency: 'PLN',
        prices: { sp95: { average: 4.648 }, diesel: { average: 5.554 } },
        date: '2026-09-21',
        source: 'European Commission, Weekly Oil Bulletin',
        estimate: false
      }
    });
  });

  it('Royaume-Uni : estimation fixe en livres, avec source et date', async () => {
    const latest = vi.fn();
    const out = await fuel({ lat: 55.95, lon: -3.19 }, 20, ctx('GB', latest));
    expect(out.data).toMatchObject({ currency: 'GBP', estimate: true, date: '2026-09-21' });
    expect(out.data.source).toContain('gov.uk');
    expect(latest).not.toHaveBeenCalled();
  });

  it('Suisse : pas de prix inventé', async () => {
    expect(await fuel({ lat: 46.2, lon: 6.1 }, 20, ctx('CH'))).toEqual({ name: 'fuel', status: 'failed', message: 'no_data' });
  });

  it('bulletin absent ou table indisponible : échec propre', async () => {
    expect((await fuel({}, 20, ctx('PT', vi.fn(async () => [])))).status).toBe('failed');
    const out = await fuel({}, 20, ctx('PT', vi.fn(async () => { throw new Error('db'); })));
    expect(out).toEqual({ name: 'fuel', status: 'failed', message: 'store_unavailable' });
  });

  it('ignore les anciens bulletins', () => {
    expect(fromBulletinRows(ROWS).prices.sp95.average).toBe(4.648);
    expect(fromBulletinRows([])).toBeNull();
  });
});
