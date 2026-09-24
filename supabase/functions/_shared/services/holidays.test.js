import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHolidays, holidaysBetween, toHoliday } from './holidays.js';

const NAGER_IT = [
  { date: '2027-08-15', localName: 'Ferragosto', name: 'Assumption Day', countryCode: 'IT', global: true, counties: null },
  { date: '2027-01-01', localName: 'Capodanno', name: "New Year's Day", countryCode: 'IT', global: true, counties: null },
  { date: '2027-06-24', localName: 'San Giovanni', name: 'Saint John', countryCode: 'IT', global: false, counties: ['IT-FI'] }
];

describe('holidays', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('interroge Nager.Date et signale le 15 août en Italie', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(NAGER_IT)));
    const holidays = await fetchHolidays('it', 2027);
    expect(fetchMock.mock.calls[0][0]).toBe('https://date.nager.at/api/v3/PublicHolidays/2027/IT');
    expect(holidays).toContainEqual({ date: '2027-08-15', name: 'Assumption Day', localName: 'Ferragosto', global: true });
  });

  it('garde les régions d\'un jour férié local', () => {
    expect(toHoliday(NAGER_IT[2])).toEqual({ date: '2027-06-24', name: 'Saint John', localName: 'San Giovanni', global: false, regions: ['IT-FI'] });
  });

  it('renvoie une liste vide pour un pays inconnu de Nager.Date (204 ou 404)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await fetchHolidays('LI', 2027)).toEqual([]);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(await fetchHolidays('XX', 2027)).toEqual([]);
  });

  it('filtre et trie par dates', () => {
    const list = NAGER_IT.map(toHoliday);
    expect(holidaysBetween(list, '2027-06-01', '2027-08-31').map((h) => h.date)).toEqual(['2027-06-24', '2027-08-15']);
  });
});
