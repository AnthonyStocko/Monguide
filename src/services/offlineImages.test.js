import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stockage, réglages et réseau en mémoire.
const db = new Map();
const prefs = new Map();
let connection = 'wifi';
vi.mock('./storage.js', () => ({
  get: async (k, fallback = null) => (db.has(k) ? db.get(k) : fallback),
  set: async (k, v) => void db.set(k, v),
  remove: async (k) => void db.delete(k),
  keys: async () => [...db.keys()]
}));
vi.mock('./settings.js', () => ({
  SETTINGS_KEYS: { imagesWifiOnly: 'imagesWifiOnly' },
  get: async (k, fallback = null) => (prefs.has(k) ? prefs.get(k) : fallback),
  set: async (k, v) => void prefs.set(k, v)
}));
vi.mock('./network.js', () => ({ connectionType: async () => connection }));

const { deleteTripPhotos, photosOfTrip, saveTripPhotos, tripImagesStatus } = await import('./offlineImages.js');

const url = (n) => `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${n}.jpg/500px-${n}.jpg`;
const image = (n, width = 500, height = 300) => ({ thumbUrl: url(n), width, height, credit: { license: 'CC0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:x' } });
const trip = (id, images, hero) => ({
  id,
  hero,
  days: [{ steps: images.map((img, i) => ({ id: `s${i}`, place: { id: `p${i}`, image: img } })) }]
});
/** Faux fetch : taille du fichier selon son adresse (1000 octets par défaut). */
const fetchSized = (sizes) => vi.fn(async (u) => ({ ok: true, blob: async () => ({ size: sizes[u] ?? 1000 }) }));

beforeEach(() => {
  db.clear();
  prefs.clear();
  connection = 'wifi';
});

describe('photosOfTrip', () => {
  it('destination puis lieux, sans doublon ni domaine étranger', () => {
    const t = trip('t', [image('a'), image('a'), { ...image('x'), thumbUrl: 'https://example.org/x.jpg' }, null], image('hero'));
    expect(photosOfTrip(t).map((p) => p.url)).toEqual([url('hero'), url('a')]);
  });
});

describe('saveTripPhotos', () => {
  it('enregistre tout en Wi-Fi', async () => {
    const record = await saveTripPhotos(trip('t', [image('a'), image('b')]), { fetchImpl: fetchSized({}) });
    expect(record).toMatchObject({ status: 'done', bytes: 2000 });
    expect(db.get(`img:${url('a')}`).size).toBe(1000);
  });

  it('au-delà du plafond, les plus petites d’abord', async () => {
    const t = trip('t', [image('big', 1000, 1000), image('small', 100, 100), image('mid', 500, 500)]);
    const fetchImpl = fetchSized({ [url('big')]: 3000, [url('small')]: 1000, [url('mid')]: 1500 });
    const record = await saveTripPhotos(t, { fetchImpl, budgetBytes: 3000 });
    expect(record.status).toBe('budget');
    expect(record.urls).toEqual([url('small'), url('mid')]);
    expect(fetchImpl.mock.calls.map(([u]) => u)).toEqual([url('small'), url('mid'), url('big')]);
  });

  it('données mobiles et Wi-Fi uniquement (par défaut) : rien téléchargé, statut wifi_only', async () => {
    connection = 'cellular';
    const fetchImpl = fetchSized({});
    expect(await saveTripPhotos(trip('t', [image('a')]), { fetchImpl })).toMatchObject({ status: 'wifi_only', urls: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('connexion de type inconnu : traitée comme hors Wi-Fi', async () => {
    connection = 'unknown';
    expect(await saveTripPhotos(trip('t', [image('a')]), { fetchImpl: fetchSized({}) })).toMatchObject({ status: 'wifi_only' });
  });

  it('données mobiles, réglage désactivé : téléchargé', async () => {
    connection = 'cellular';
    prefs.set('imagesWifiOnly', false);
    expect(await saveTripPhotos(trip('t', [image('a')]), { fetchImpl: fetchSized({}) })).toMatchObject({ status: 'done' });
  });

  it('données mobiles mais tout est déjà enregistré : statut done (pas de message)', async () => {
    await saveTripPhotos(trip('t', [image('a')]), { fetchImpl: fetchSized({}) });
    connection = 'cellular';
    expect(await saveTripPhotos(trip('t', [image('a')]), { fetchImpl: fetchSized({}) })).toMatchObject({ status: 'done' });
  });

  it('échec réseau : statut partial, le reste est enregistré', async () => {
    const fetchImpl = vi.fn(async (u) => (u === url('a') ? { ok: false, status: 404 } : { ok: true, blob: async () => ({ size: 10 }) }));
    expect(await saveTripPhotos(trip('t', [image('a'), image('b')]), { fetchImpl })).toMatchObject({ status: 'partial', urls: [url('b')] });
  });
});

describe('deleteTripPhotos', () => {
  it('supprime les photos du séjour, sauf celles qu’un autre séjour utilise', async () => {
    await saveTripPhotos(trip('t1', [image('a'), image('shared')]), { fetchImpl: fetchSized({}) });
    await saveTripPhotos(trip('t2', [image('shared')]), { fetchImpl: fetchSized({}) });
    await deleteTripPhotos('t1');
    expect(db.has(`img:${url('a')}`)).toBe(false);
    expect(db.has(`img:${url('shared')}`)).toBe(true);
    expect(await tripImagesStatus('t1')).toBeNull();
  });
});
