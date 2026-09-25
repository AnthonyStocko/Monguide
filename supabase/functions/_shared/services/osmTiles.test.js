import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { featureToEntry } from '../../../../scripts/osm-tiles/features.js';
import { RULES } from '../domain/config/rules.js';
import { distanceKm } from '../domain/geo.js';
import { tileIdForPoint } from '../domain/osmGrid.js';
import { osmElementToPlace, osmHeritageElementToPlace } from './osmMapping.js';
import { osmHeritageFallback, osmPlacesSource } from './osmSource.js';
import { entryToElement, fetchOsmTilePlaces, loadTilesIndex, resetOsmTilesMemory } from './osmTiles.js';

const LYON = { lat: 45.76, lon: 4.84 };
const CELL = 0.2;

/** Éléments au format Overpass ("out center tags"), comme osm.js les reçoit. */
const ELEMENTS = [
  { type: 'node', id: 1, lat: 45.7601, lon: 4.8401, tags: { amenity: 'restaurant', name: 'Le Bouchon', cuisine: 'regional;french', opening_hours: 'Mo-Sa 12:00-14:00', 'contact:phone': '+33 4', wheelchair: 'yes', 'diet:vegetarian': 'yes', website: 'https://b.fr', wikidata: 'Q42' } },
  { type: 'node', id: 2, lat: 45.77, lon: 4.85, tags: { amenity: 'restaurant', name: 'Chez A', 'name:en': 'At A', description: 'Petit bistrot.' } },
  { type: 'way', id: 3, center: { lat: 45.765, lon: 4.83 }, tags: { amenity: 'marketplace', covered: 'yes', name: 'Halles Paul Bocuse' } },
  { type: 'node', id: 4, lat: 45.75, lon: 4.83, tags: { shop: 'farm', name: 'Ferme B' } },
  { type: 'relation', id: 5, center: { lat: 45.78, lon: 4.855 }, tags: { leisure: 'park', name: 'Parc de la Tête d’Or' } },
  { type: 'way', id: 6, center: { lat: 45.66, lon: 4.95 }, tags: { boundary: 'protected_area', name: 'Réserve' } },
  { type: 'node', id: 7, lat: 45.762, lon: 4.822, tags: { tourism: 'viewpoint', name: 'Fourvière' } },
  { type: 'node', id: 8, lat: 45.761, lon: 4.83, tags: { historic: 'wayside_cross', name: 'Croix' } },
  { type: 'way', id: 9, center: { lat: 45.763, lon: 4.831 }, tags: { man_made: 'lavoir', name: 'Lavoir du bourg' } },
  { type: 'node', id: 10, lat: 45.764, lon: 4.832, tags: { historic: 'ruins', name: 'Tour' } }
];

/** Même objet, tel qu'osmium l'exporte (GeoJSON) : position = point sur la surface, déjà connu ici. */
const toFeature = (el) => ({
  type: 'Feature',
  id: `${el.type[0]}${el.id}`,
  geometry: { type: 'Point', coordinates: [el.lon ?? el.center.lon, el.lat ?? el.center.lat] },
  properties: el.tags
});

/** Magasin en mémoire : tuiles gzip + manifeste + pointeur, lectures comptées. */
function memoryStore(entriesByCountry, { dataDate = '2026-09-24', extra = {} } = {}) {
  const files = new Map();
  const countries = {};
  for (const [code, entries] of Object.entries(entriesByCountry)) {
    const path = `${dataDate}/${code}/${CELL}`;
    const tiles = new Map();
    for (const e of entries) {
      const id = tileIdForPoint(e[4], e[5], CELL);
      if (!tiles.has(id)) tiles.set(id, []);
      tiles.get(id).push(e);
    }
    for (const [tile, places] of tiles) files.set(`${path}/${tile}.json.gz`, gzipSync(JSON.stringify({ v: 1, dataDate, tile, places })));
    countries[code] = { path, tiles: [...tiles.keys()], counts: {}, total: entries.length };
  }
  files.set(`${dataDate}/manifest.json`, JSON.stringify({ v: 1, dataDate, cellDeg: CELL, countries }));
  files.set('current.json', JSON.stringify({ dataDate, manifest: `${dataDate}/manifest.json`, previous: null }));
  for (const [k, v] of Object.entries(extra)) files.set(k, v);
  const reads = [];
  return {
    files,
    reads,
    read: vi.fn(async (path) => {
      reads.push(path);
      if (!files.has(path)) throw Object.assign(new Error('not found'), { upstreamStatus: 404 });
      return new Blob([files.get(path)]);
    })
  };
}

const FR = ELEMENTS.map((el) => featureToEntry(toFeature(el), { heritageFallback: false }));
const memoryCache = () => ({ lookup: vi.fn(async () => undefined), set: vi.fn(async () => {}) });

beforeEach(() => {
  resetOsmTilesMemory();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function places(store, point = LYON, radiusKm = 10, options = {}) {
  const rules = options.rules ?? RULES;
  const index = await loadTilesIndex(rules, store);
  const stats = { tilesRead: 0 };
  const result = await fetchOsmTilePlaces(point, radiusKm, { rules, lang: options.lang ?? 'fr', includeRestaurants: options.includeRestaurants ?? true, index, store, stats });
  return { result, stats };
}

describe('comparaison avec Overpass', () => {
  it.each(['fr', 'en'])('donne les mêmes Place qu’osmElementToPlace sur les éléments Overpass (%s)', async (lang) => {
    const expected = ELEMENTS.map((el) => osmElementToPlace(el, { lang, regionalCuisines: RULES.places.regionalCuisines }));
    const { result } = await places(memoryStore({ FR }), LYON, 30, { lang });
    const byId = new Map(result.map((p) => [p.id, p]));
    for (const place of expected) expect(byId.get(place.id), place.id).toEqual(place);
    expect(result).toHaveLength(expected.length);
  });

  it('redonne les musées et monuments du repli comme osmHeritageElementToPlace', () => {
    const els = [
      { type: 'way', id: 20, center: { lat: 38.7, lon: -9.1 }, tags: { heritage: '2', historic: 'castle', name: 'Castelo', wikidata: 'Q5' } },
      { type: 'node', id: 21, lat: 38.71, lon: -9.14, tags: { tourism: 'museum', name: 'Museu', building: 'yes' } }
    ];
    for (const el of els) {
      const entry = featureToEntry(toFeature(el), { heritageFallback: true });
      expect(osmHeritageElementToPlace(entryToElement(entry), { lang: 'fr' })).toEqual(osmHeritageElementToPlace(el, { lang: 'fr' }));
    }
  });
});

describe('fetchOsmTilePlaces', () => {
  it('ne lit que les cases du cercle présentes dans le manifeste, et trie par distance', async () => {
    const store = memoryStore({ FR });
    const { result, stats } = await places(store, LYON, 10);
    const tileReads = store.reads.filter((p) => p.endsWith('.json.gz'));
    expect(stats.tilesRead).toBe(tileReads.length);
    expect(tileReads.every((p) => store.files.has(p))).toBe(true);
    const d = result.map((p) => distanceKm(LYON, p));
    expect([...d].sort((a, b) => a - b)).toEqual(d);
    expect(result.map((p) => p.id)).not.toContain('osm:way/6'); // réserve à ~14 km
  });

  it('limite les restaurants à leur rayon réduit, et les omet pour un déjeuner au marché', async () => {
    const far = featureToEntry(toFeature({ type: 'node', id: 30, lat: 45.86, lon: 4.84, tags: { amenity: 'restaurant', name: 'Loin' } }), { heritageFallback: false });
    const { result } = await places(memoryStore({ FR: [...FR, far] }), LYON, 20);
    expect(result.map((p) => p.id)).not.toContain('osm:node/30'); // 11 km > restaurantRadiusKm (10)
    const noFood = await places(memoryStore({ FR }), LYON, 20, { includeRestaurants: false });
    expect(noFood.result.some((p) => p.category === 'restaurant')).toBe(false);
  });

  it('applique les plafonds par groupe en gardant les plus proches', async () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      featureToEntry(toFeature({ type: 'node', id: 1000 + i, lat: 45.76 + i * 0.0005, lon: 4.84, tags: { amenity: 'restaurant', name: `R${i}` } }), { heritageFallback: false })
    );
    const { result } = await places(memoryStore({ FR: many }), LYON, 10);
    expect(result).toHaveLength(RULES.osm.limits.food);
    expect(result.at(-1).name).toBe(`R${RULES.osm.limits.food - 1}`);
  });

  it('garde les lieux sans nom de rules.osm.unnamedTypes sous un nom générique traduit', async () => {
    const unnamed = [
      featureToEntry(toFeature({ type: 'node', id: 40, lat: 45.761, lon: 4.841, tags: { tourism: 'viewpoint' } }), { heritageFallback: false }),
      featureToEntry(toFeature({ type: 'node', id: 41, lat: 45.761, lon: 4.842, tags: { historic: 'wayside_cross' } }), { heritageFallback: false }),
      featureToEntry(toFeature({ type: 'node', id: 42, lat: 45.761, lon: 4.843, tags: { amenity: 'lavoir' } }), { heritageFallback: false })
    ];
    const fr = (await places(memoryStore({ FR: unnamed }))).result;
    expect(fr.map((p) => [p.id, p.name, p.unnamed])).toEqual([
      ['osm:node/40', 'Point de vue', true],
      ['osm:node/42', 'Lavoir', true]
    ]);
    resetOsmTilesMemory();
    const en = (await places(memoryStore({ FR: unnamed }), LYON, 10, { lang: 'en' })).result;
    expect(en.map((p) => p.name)).toEqual(['Viewpoint', 'Wash house']);
  });

  it('lit les cases frontalières de chaque pays couvert, sans doublon', async () => {
    const shared = FR[0];
    const { result, stats } = await places(memoryStore({ FR, CH: [shared] }), LYON, 10);
    expect(result.filter((p) => p.id === 'osm:node/1')).toHaveLength(1);
    expect(stats.tilesRead).toBeGreaterThan(1);
  });
});

describe('caches en mémoire', () => {
  it('ne relit ni le pointeur, ni le manifeste, ni les tuiles au deuxième appel', async () => {
    const store = memoryStore({ FR });
    await places(store);
    const first = store.reads.length;
    await places(store);
    expect(store.reads.length).toBe(first);
  });

  it('lit une seule fois une tuile demandée deux fois en parallèle', async () => {
    const store = memoryStore({ FR });
    await Promise.all([places(store), places(store)]);
    expect(new Set(store.reads).size).toBe(store.reads.length);
  });

  it('relit current.json après son délai', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-01T00:00:00Z') });
    try {
      const store = memoryStore({ FR });
      await loadTilesIndex(RULES, store);
      vi.setSystemTime(Date.now() + RULES.osm.tiles.pointerTtlSec * 1000 + 1);
      await loadTilesIndex(RULES, store);
      expect(store.reads.filter((p) => p === 'current.json')).toHaveLength(2);
      expect(store.reads.filter((p) => p.endsWith('manifest.json'))).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('supprime les tuiles les moins récemment lues au-delà du plafond', async () => {
    const rules = { ...RULES, osm: { ...RULES.osm, tiles: { ...RULES.osm.tiles, memoryCacheMb: 0.0001 } } };
    const PARIS = { lat: 48.857, lon: 2.352 };
    const paris = featureToEntry(toFeature({ type: 'node', id: 50, lat: PARIS.lat, lon: PARIS.lon, tags: { amenity: 'restaurant', name: 'P' } }), { heritageFallback: false });
    const store = memoryStore({ FR: [FR[0], paris] });
    const lyonTile = `2026-09-24/FR/${CELL}/${tileIdForPoint(FR[0][4], FR[0][5], CELL)}.json.gz`;
    await places(store, LYON, 1, { rules });
    await places(store, PARIS, 1, { rules }); // tuile de Paris lue : celle de Lyon sort du cache
    await places(store, LYON, 1, { rules });
    expect(store.reads.filter((p) => p === lyonTile)).toHaveLength(2);
  });
});

describe('osmPlacesSource (sélection de la source)', () => {
  const ctx = (store, rules = RULES, countryCode = 'FR') => ({ rules, lang: 'fr', countryCode, cache: memoryCache(), tileStore: store });

  it('tuiles : aucun appel à Overpass, date des données et tuiles lues dans sources', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const c = ctx(memoryStore({ FR }));
    const outcome = await osmPlacesSource(LYON, 10, true, c);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ name: 'osm', status: 'ok', source: 'tiles', dataDate: '2026-09-24', durationMs: expect.any(Number) });
    expect(outcome.tilesRead).toBeGreaterThan(0);
    expect(outcome.data.length).toBeGreaterThan(0);
    // Date des données dans la clé du cache partagé.
    expect(c.cache.set.mock.calls[0][0]).toContain('2026-09-24');
    expect(c.cache.set.mock.calls[0][1]).toBe('osm-tiles');
  });

  it('pointeur reçu avec la configuration : current.json n’est pas relu, le cache partagé suffit', async () => {
    const store = memoryStore({ FR });
    const c = { ...ctx(store), osmPointer: { dataDate: '2026-09-24', manifest: '2026-09-24/manifest.json' } };
    c.cache.lookup = vi.fn(async () => ({ value: [{ id: 'osm:node/1' }], fresh: true }));
    const outcome = await osmPlacesSource(LYON, 10, true, c);
    expect(outcome).toMatchObject({ status: 'cache', dataDate: '2026-09-24', data: [{ id: 'osm:node/1' }] });
    expect(store.reads).not.toContain('current.json');
    expect(c.cache.lookup.mock.calls[0][0]).toContain('2026-09-24');
  });

  it('garde la réponse en mémoire : pas de cache partagé au deuxième appel', async () => {
    const c = ctx(memoryStore({ FR }));
    const first = await osmPlacesSource(LYON, 10, true, c);
    const second = await osmPlacesSource(LYON, 10, true, c);
    expect(second).toMatchObject({ status: 'cache', tilesRead: 0, dataDate: '2026-09-24' });
    expect(second.data).toEqual(first.data);
    expect(c.cache.lookup).toHaveBeenCalledTimes(1);
  });

  it('écrit le cache partagé après la réponse avec EdgeRuntime.waitUntil', async () => {
    const waitUntil = vi.fn();
    vi.stubGlobal('EdgeRuntime', { waitUntil });
    const c = ctx(memoryStore({ FR }));
    let release;
    c.cache.set = vi.fn(() => new Promise((resolve) => (release = resolve)));
    const outcome = await osmPlacesSource(LYON, 10, true, c); // n'attend pas l'écriture
    expect(outcome.status).toBe('ok');
    expect(waitUntil).toHaveBeenCalledTimes(1);
    release();
  });

  it('tuiles illisibles : copie expirée du cache partagé, sinon "failed"', async () => {
    const store = memoryStore({ FR });
    await loadTilesIndex(RULES, store);
    for (const path of [...store.files.keys()]) if (path.endsWith('.gz')) store.files.delete(path);
    const c = ctx(store);
    c.cache.lookup = vi.fn(async () => ({ value: [{ id: 'osm:node/1' }], fresh: false }));
    expect(await osmPlacesSource(LYON, 10, true, c)).toMatchObject({ status: 'cache', message: 'stale', data: [{ id: 'osm:node/1' }] });
    c.cache.lookup = vi.fn(async () => undefined);
    expect(await osmPlacesSource(LYON, 9, true, c)).toMatchObject({ status: 'failed', message: 'upstream 404', source: 'tiles' });
  });

  it('pays non importé : "failed" avec le message not_covered, sans lire de tuile', async () => {
    const store = memoryStore({ FR });
    const outcome = await osmPlacesSource({ lat: 38.72, lon: -9.14 }, 10, true, ctx(store, RULES, 'PT'));
    expect(outcome).toMatchObject({ name: 'osm', status: 'failed', message: 'not_covered', source: 'tiles', dataDate: '2026-09-24' });
    expect(store.reads.some((p) => p.endsWith('.gz'))).toBe(false);
  });

  it('bucket sans version en service : "failed", la génération continue', async () => {
    const store = memoryStore({ FR });
    store.files.delete('current.json');
    const outcome = await osmPlacesSource(LYON, 10, true, ctx(store));
    expect(outcome).toMatchObject({ name: 'osm', status: 'failed', message: 'upstream 404', source: 'tiles' });
  });

  it('"off" : aucune lecture ; valeur inconnue : tuiles', async () => {
    const store = memoryStore({ FR });
    const off = await osmPlacesSource(LYON, 10, true, ctx(store, { ...RULES, osm: { ...RULES.osm, source: 'off' } }));
    expect(off).toEqual({ name: 'osm', status: 'failed', message: 'disabled', source: 'off' });
    expect(store.read).not.toHaveBeenCalled();
    const unknown = await osmPlacesSource(LYON, 10, true, ctx(store, { ...RULES, osm: { ...RULES.osm, source: 'autre' } }));
    expect(unknown.source).toBe('tiles');
  });

  it('repli du patrimoine par les tuiles, échec immédiat hors couverture', async () => {
    const pt = [
      featureToEntry(toFeature({ type: 'way', id: 20, center: { lat: 38.72, lon: -9.14 }, tags: { heritage: '2', historic: 'castle', name: 'Castelo' } }), { heritageFallback: true }),
      featureToEntry(toFeature({ type: 'node', id: 21, lat: 38.721, lon: -9.141, tags: { tourism: 'museum', name: 'Museu' } }), { heritageFallback: true })
    ];
    const params = { lat: 38.72, lon: -9.14, radius: 10, lang: 'fr' };
    const ok = await osmHeritageFallback({ lat: 38.72, lon: -9.14 }, 10, params, ctx(memoryStore({ PT: pt }), RULES, 'PT'));
    expect(ok.status).toBe('ok');
    expect(ok.data.monuments.map((p) => p.id)).toEqual(['osm:way/20']);
    expect(ok.data.museums.map((p) => p.id)).toEqual(['osm:node/21']);
    resetOsmTilesMemory();
    const missing = await osmHeritageFallback({ lat: 38.72, lon: -9.14 }, 10, params, ctx(memoryStore({ FR }), RULES, 'PT'));
    expect(missing).toEqual({ name: 'heritage-osm', status: 'failed', message: 'not_covered' });
    const off = await osmHeritageFallback({ lat: 38.72, lon: -9.14 }, 10, params, ctx(memoryStore({ PT: pt }), { ...RULES, osm: { ...RULES.osm, source: 'off' } }, 'PT'));
    expect(off).toBeNull();
  });
});
