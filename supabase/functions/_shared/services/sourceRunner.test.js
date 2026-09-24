import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalError } from '../errors.js';
import { runSource } from './sourceRunner.js';

function memoryCache(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    lookup: vi.fn(async (key) => store.get(key)),
    set: vi.fn(async (key, _source, value) => {
      store.set(key, { value, fresh: true });
    })
  };
}

const base = { name: 'osm', cacheSource: 'osm', params: { lat: 45.9865, lon: 4.7266, radius: 20 }, ttlSec: 60 };
const KEY = 'osm:lat=45.99&lon=4.73&radius=20';

describe('runSource', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('appelle la source et met le résultat en cache (status ok)', async () => {
    const cache = memoryCache();
    const fetcher = vi.fn().mockResolvedValue(['a']);
    expect(await runSource({ ...base, fetcher, cache })).toEqual({ name: 'osm', status: 'ok', durationMs: expect.any(Number), data: ['a'] });
    expect(cache.set).toHaveBeenCalledWith(KEY, 'osm', ['a'], 60);
  });

  it('sert un second appel identique depuis le cache (status cache) sans rappeler la source', async () => {
    const cache = memoryCache();
    const fetcher = vi.fn().mockResolvedValue(['a']);
    await runSource({ ...base, fetcher, cache });
    const second = await runSource({ ...base, params: { lat: 45.9871, lon: 4.7259, radius: 20 }, fetcher, cache });
    expect(second).toEqual({ name: 'osm', status: 'cache', data: ['a'] });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('resservit une copie expirée si la source échoue (status cache, stale)', async () => {
    const cache = memoryCache({ [KEY]: { value: ['old'], fresh: false } });
    const fetcher = vi.fn().mockRejectedValue(new ExternalError('overpass', 429, false));
    expect(await runSource({ ...base, fetcher, cache })).toEqual({ name: 'osm', status: 'cache', message: 'stale', durationMs: expect.any(Number), data: ['old'] });
  });

  it('signale l\'échec sans lever d\'exception quand rien n\'est en cache', async () => {
    const cache = memoryCache();
    const fetcher = vi.fn().mockRejectedValue(new ExternalError('overpass', 504, false));
    expect(await runSource({ ...base, fetcher, cache })).toEqual({ name: 'osm', status: 'failed', message: 'upstream 504', durationMs: expect.any(Number) });
  });

  it('joint la requête envoyée, pour le diagnostic', async () => {
    const out = await runSource({ ...base, query: 'SELECT 1', fetcher: vi.fn().mockResolvedValue([]), cache: memoryCache() });
    expect(out.query).toBe('SELECT 1');
  });

  it('fonctionne même si le cache est en panne', async () => {
    const cache = { lookup: vi.fn().mockRejectedValue(new Error('db')), set: vi.fn().mockRejectedValue(new Error('db')) };
    const fetcher = vi.fn().mockResolvedValue(['a']);
    expect(await runSource({ ...base, fetcher, cache })).toMatchObject({ name: 'osm', status: 'ok', data: ['a'] });
  });
});
