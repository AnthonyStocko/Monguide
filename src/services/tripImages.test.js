import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = new Map();
let saved = null;
let current = null;
const getImages = vi.fn();
vi.mock('./storage.js', () => ({
  get: async (k, fallback = null) => (db.has(k) ? db.get(k) : fallback),
  set: async (k, v) => void db.set(k, v),
  remove: async (k) => void db.delete(k)
}));
vi.mock('./dataApi.js', () => ({ getImages: (...a) => getImages(...a) }));
vi.mock('./offlineImages.js', () => ({ saveTripPhotos: async () => ({ status: 'done', urls: [] }) }));
vi.mock('./tripsStore.js', () => ({
  loadTrip: async () => (current ? { trip: current, readOnly: false } : null),
  updateTrip: async (t) => {
    saved = t;
    current = t;
    return t;
  }
}));

const { applyTripImages, refreshTripPhotos, stepQids } = await import('./tripImages.js');

const IMG = (n) => ({
  thumbUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${n}.jpg/500px-${n}.jpg`,
  width: 500,
  height: 300,
  credit: { author: 'A', license: 'CC BY-SA 3.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:x' }
});
const baseTrip = () => ({
  id: 't1',
  destination: { name: 'Villefranche-sur-Saône', countryCode: 'FR', lat: 45.99, lon: 4.72, radiusKm: 10 },
  days: [
    {
      steps: [
        { id: 'a', place: { id: 'merimee:PA00118090', wikidata: 'Q2983916' } },
        { id: 'b', place: { id: 'musee:M1041', wikidata: 'Q16335746' } },
        { id: 'c' }
      ]
    }
  ],
  candidates: [{ id: 'x', wikidata: 'Q2983916' }]
});

beforeEach(() => {
  db.clear();
  saved = null;
  current = baseTrip();
  getImages.mockReset();
  getImages.mockImplementation(async ({ wikidataIds, destination }) =>
    destination
      ? { images: { Q208770: IMG('ville') }, destination: { wikidata: 'Q208770' } }
      : { images: Object.fromEntries(wikidataIds.map((q) => [q, q === 'Q2983916' ? IMG('collegiale') : null])) }
  );
});

describe('applyTripImages', () => {
  it('photo sur les étapes et les candidats du même lieu, photo et identifiant de la destination', () => {
    const { trip, changed } = applyTripImages(baseTrip(), { Q2983916: IMG('c'), Q16335746: null }, { wikidata: 'Q208770', image: IMG('v') });
    expect(changed).toBe(true);
    expect(trip.days[0].steps[0].place.image).toEqual(IMG('c'));
    expect(trip.days[0].steps[1].place.image).toBeUndefined();
    expect(trip.candidates[0].image).toEqual(IMG('c'));
    expect(trip.hero).toEqual(IMG('v'));
    expect(trip.destination.wikidata).toBe('Q208770');
  });

  it('refuse une photo sans crédit', () => {
    const { trip } = applyTripImages(baseTrip(), { Q2983916: { ...IMG('c'), credit: undefined } });
    expect(trip.days[0].steps[0].place.image).toBeUndefined();
  });

  it('rien de nouveau : même objet', () => {
    const t = baseTrip();
    expect(applyTripImages(t, {}, undefined)).toEqual({ trip: t, changed: false });
  });
});

describe('refreshTripPhotos', () => {
  it('lieux en 400 px, destination en 800 px ; séjour enregistré avec hero', async () => {
    await refreshTripPhotos('t1');
    expect(stepQids(baseTrip())).toEqual(['Q2983916', 'Q16335746']);
    expect(getImages).toHaveBeenCalledWith({ wikidataIds: ['Q2983916', 'Q16335746'], width: 400 });
    expect(getImages).toHaveBeenCalledWith(
      expect.objectContaining({ wikidataIds: [], width: 800, destination: expect.objectContaining({ name: 'Villefranche-sur-Saône' }) })
    );
    expect(saved.hero).toEqual(IMG('ville'));
    expect(saved.days[0].steps[0].place.image).toEqual(IMG('collegiale'));
  });

  it('second passage : rien n’est redemandé', async () => {
    await refreshTripPhotos('t1');
    getImages.mockClear();
    await refreshTripPhotos('t1');
    expect(getImages).not.toHaveBeenCalled();
  });

  it('identifiant non vérifié par le serveur : redemandé la fois suivante', async () => {
    getImages.mockImplementation(async ({ destination }) => (destination ? { images: {}, destination: { wikidata: null } } : { images: { Q2983916: null } }));
    await refreshTripPhotos('t1');
    getImages.mockClear();
    await refreshTripPhotos('t1');
    expect(getImages).toHaveBeenCalledWith({ wikidataIds: ['Q16335746'], width: 400 });
  });

  it('serveur injoignable : pas d’erreur, séjour inchangé, copie hors ligne tentée', async () => {
    getImages.mockRejectedValue(new Error('offline'));
    await expect(refreshTripPhotos('t1')).resolves.toMatchObject({ status: 'done' });
    expect(saved).toBeNull();
  });
});
