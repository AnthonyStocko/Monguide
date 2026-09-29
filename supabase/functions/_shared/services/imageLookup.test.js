import { describe, expect, it } from 'vitest';
import { RULES } from '../domain/config/rules.js';
import { cacheKey } from '../cacheKey.js';
import { lookupImages } from './imageLookup.js';

const IMAGE = {
  thumbUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/K.jpg/500px-K.jpg',
  width: 500,
  height: 667,
  credit: { author: 'Andrzej Harassek', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:K.jpg' }
};

/** Cache en mémoire au format de cache.js (lookupMany / setMany). */
function memoryCache(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    lookupMany: async (keys) => new Map(keys.filter((k) => store.has(k)).map((k) => [k, store.get(k)])),
    setMany: async (entries) => entries.forEach(({ key, value }) => store.set(key, { value, fresh: true }))
  };
}

/** Faux Wikimedia : Q2983916 a une photo acceptée, Q1 n'a pas de P18. */
function wikimedia({ fail = false } = {}) {
  let calls = 0;
  const fetchJson = async (url) => {
    calls += 1;
    if (fail) throw new Error('wikimedia down');
    const u = new URL(url);
    if (u.hostname === 'www.wikidata.org') {
      const titles = u.searchParams.get('titles').split('|');
      return { query: { pages: titles.map((title) => ({ title, pageprops: title === 'Q2983916' ? { page_image_free: 'K.jpg' } : {} })) } };
    }
    return {
      query: {
        pages: [
          {
            title: 'File:K.jpg',
            imageinfo: [
              {
                thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/38/K.jpg/500px-K.jpg?utm_source=x',
                width: 1200,
                height: 1600,
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:K.jpg',
                extmetadata: {
                  Artist: { value: '<a href="x">Andrzej Harassek</a>' },
                  LicenseShortName: { value: 'CC BY-SA 3.0' },
                  LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/3.0' },
                  License: { value: 'cc-by-sa-3.0' }
                }
              }
            ]
          }
        ]
      }
    };
  };
  return { fetchJson, calls: () => calls };
}

describe('lookupImages', () => {
  it('photo et "pas d’image", toutes deux mises en cache ; le second appel ne sort pas', async () => {
    const cache = memoryCache();
    const net = wikimedia();
    const first = await lookupImages({ qids: ['Q2983916', 'Q1'], width: 400 }, { cache, rules: RULES, fetchJson: net.fetchJson });
    expect(first.images).toEqual({ Q2983916: IMAGE, Q1: null });
    expect(net.calls()).toBe(2);
    expect(cache.store.get(cacheKey('images', { qid: 'Q1', width: 400 })).value).toEqual({ image: null });

    const second = await lookupImages({ qids: ['Q2983916', 'Q1'], width: 400 }, { cache, rules: RULES, fetchJson: net.fetchJson });
    expect(second.images).toEqual(first.images);
    expect(net.calls()).toBe(2);
  });

  it('cache par largeur', async () => {
    const cache = memoryCache({ [cacheKey('images', { qid: 'Q2983916', width: 800 })]: { value: { image: IMAGE }, fresh: true } });
    const net = wikimedia();
    await lookupImages({ qids: ['Q2983916'], width: 400 }, { cache, rules: RULES, fetchJson: net.fetchJson });
    expect(net.calls()).toBe(2);
  });

  it('Wikimedia en panne : identifiants omis, ou copie expirée si elle existe', async () => {
    const cache = memoryCache({ [cacheKey('images', { qid: 'Q1', width: 400 })]: { value: { image: IMAGE }, fresh: false } });
    const res = await lookupImages({ qids: ['Q1', 'Q2'], width: 400 }, { cache, rules: RULES, fetchJson: wikimedia({ fail: true }).fetchJson });
    expect(res.images).toEqual({ Q1: IMAGE });
  });

  it('destination : identifiant de la ville trouvé, mis en cache, sa photo dans images', async () => {
    const cache = memoryCache();
    const city = { name: 'Villefranche-sur-Saône', countryCode: 'FR', lat: 45.99, lon: 4.72 };
    const fetchJson = async (url) => {
      const u = new URL(url);
      if (u.searchParams.get('action') === 'wbsearchentities') return { search: [{ id: 'Q2983916' }] };
      if (u.searchParams.get('prop') === 'coordinates') return { query: { pages: [{ title: 'Q2983916', coordinates: [{ lat: 45.99, lon: 4.72, primary: true }] }] } };
      return wikimedia().fetchJson(url);
    };
    const res = await lookupImages({ qids: [], width: 800, destination: city }, { cache, rules: RULES, fetchJson });
    expect(res.destination).toEqual({ wikidata: 'Q2983916' });
    expect(res.images.Q2983916).toMatchObject({ width: 500 });
    expect([...cache.store.keys()].some((k) => k.startsWith('images-city:'))).toBe(true);
  });

  it('destination : Wikidata en panne, champ omis', async () => {
    const res = await lookupImages(
      { qids: [], width: 800, destination: { name: 'X', countryCode: 'FR', lat: 1, lon: 1 } },
      { cache: memoryCache(), rules: RULES, fetchJson: wikimedia({ fail: true }).fetchJson }
    );
    expect(res).toEqual({ images: {} });
  });
});
