import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES } from '../domain/config/rules.js';
import { collectPlaces } from './collectPlaces.js';

// Ces tests portent sur le mode Overpass (rules.osm.source), les tuiles sur osmTiles.test.js.
const OVERPASS_RULES = { ...RULES, osm: { ...RULES.osm, source: 'overpass' } };

const POINT = { lat: 45.99, lon: 4.73 };
const monument = { id: 'merimee:PA1', name: 'Église Notre-Dame', category: 'monument', lat: 45.988, lon: 4.718, source: 'monuments', certified: true, indoor: true };
const osmDuplicate = { type: 'way', id: 9, center: { lat: 45.98801, lon: 4.71801 }, tags: { historic: 'ruins', name: 'Eglise Notre-Dame' } };
const restaurant = { type: 'node', id: 1, lat: 45.99, lon: 4.72, tags: { amenity: 'restaurant', name: 'Le Bouchon', cuisine: 'regional' } };

function provider({ heritageFails = false } = {}) {
  return {
    code: 'test',
    heritage: vi.fn(async () => [
      heritageFails ? { name: 'monuments', status: 'failed', message: 'upstream 500' } : { name: 'monuments', status: 'ok', data: [monument] },
      { name: 'museums', status: 'cache', data: [] }
    ]),
    terroir: vi.fn(async () => ({ name: 'terroir', status: 'ok', data: [{ name: 'Beaujolais', local: true }] }))
  };
}

const memoryCache = () => ({ lookup: vi.fn(async () => undefined), set: vi.fn(async () => {}) });

describe('collectPlaces', () => {
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

  const ctx = () => ({ rules: OVERPASS_RULES, lang: 'fr', cache: memoryCache() });

  it('fusionne les sources, dédoublonne et indique l\'état de chacune', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ elements: [osmDuplicate, restaurant] })));
    const result = await collectPlaces(provider(), POINT, 20, { lunch: 'both' }, ctx());
    expect(result.places.map((p) => p.id)).toEqual(['merimee:PA1', 'osm:node/1']);
    expect(result.appellations).toEqual([{ name: 'Beaujolais', local: true }]);
    expect(result.sources).toEqual([
      { name: 'monuments', status: 'ok' },
      { name: 'museums', status: 'cache' },
      { name: 'osm', status: 'ok', durationMs: expect.any(Number), source: 'overpass' },
      { name: 'terroir', status: 'ok' }
    ]);
  });

  it('un 429 d\'Overpass : une seule requête, les autres sources répondent', async () => {
    fetchMock.mockResolvedValue(new Response('Too Many Requests', { status: 429 }));
    const result = await collectPlaces(provider(), POINT, 20, { lunch: 'both' }, ctx());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.sources).toContainEqual({ name: 'osm', status: 'failed', message: 'upstream 429', durationMs: expect.any(Number), source: 'overpass' });
    expect(result.places.map((p) => p.id)).toEqual(['merimee:PA1']);
    expect(result.appellations).toHaveLength(1);
  });

  it('répond même si une source du fournisseur échoue', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ elements: [restaurant] })));
    const result = await collectPlaces(provider({ heritageFails: true }), POINT, 20, { lunch: 'both' }, ctx());
    expect(result.sources[0]).toEqual({ name: 'monuments', status: 'failed', message: 'upstream 500' });
    expect(result.places.map((p) => p.id)).toEqual(['osm:node/1']);
  });

  it('ne cherche pas de restaurants quand le déjeuner se fait au marché', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ elements: [] })));
    await collectPlaces(provider(), POINT, 20, { lunch: 'market' }, ctx());
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get('data')).not.toContain('restaurant');
  });

  it('cherche les restaurants pour le dîner, même avec un déjeuner au marché', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ elements: [] })));
    await collectPlaces(provider(), POINT, 20, { lunch: 'market', dinner: 'restaurant' }, ctx());
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get('data')).toContain('restaurant');
  });

  it('progression réelle : une source ralentie volontairement termine son étape en dernier', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ elements: [restaurant] })));
    const slow = provider();
    // Patrimoine ralenti de 150 ms : son étape ne peut finir qu'à sa réponse.
    slow.heritage = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve([{ name: 'monuments', status: 'ok', data: [monument] }]), 150)));
    const t0 = Date.now();
    const events = [];
    await collectPlaces(slow, POINT, 20, { lunch: 'both' }, ctx(), (step, status) => events.push({ step, status, at: Date.now() - t0 }));
    expect(events.map((e) => e.step)).toEqual(['places', 'restaurants', 'heritage']);
    expect(events.find((e) => e.step === 'heritage').at).toBeGreaterThanOrEqual(140);
    expect(events.find((e) => e.step === 'places').at).toBeLessThan(140);
  });

  it('progression : sans restaurants (déjeuner au marché), pas d’étape restaurants ; source en échec signalée', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    const events = [];
    await collectPlaces(provider({ heritageFails: true }), POINT, 20, { lunch: 'market' }, ctx(), (step, status) => events.push(`${step}:${status}`));
    expect(events.sort()).toEqual(['heritage:done', 'places:failed']);
  });
});
