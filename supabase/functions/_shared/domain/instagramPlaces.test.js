import { describe, expect, it } from 'vitest';
import { findInstagramPost, normalizeName, parseInstagramPlaces, postMatchesPlace } from './instagramPlaces.js';

const post = (over = {}) => ({ url: 'https://www.instagram.com/p/AAA111/', name: 'Mont-Saint-Michel', city: 'Le Mont-Saint-Michel', ...over });

describe('normalizeName', () => {
  it('ignore accents, majuscules, articles et tirets', () => {
    expect(normalizeName('Église Saint-Étienne')).toBe('eglise saint etienne');
    expect(normalizeName('LE Mont-Saint-Michel')).toBe('mont saint michel');
    expect(normalizeName("L'Abbaye de la Sainte-Trinité")).toBe('abbaye sainte trinite');
    expect(normalizeName('Cœur  de Lyon')).toBe('coeur lyon');
  });
  it('renvoie une chaîne vide pour une valeur inexploitable', () => {
    expect(normalizeName(undefined)).toBe('');
    expect(normalizeName('Le La')).toBe('');
  });
});

describe('postMatchesPlace', () => {
  const place = { id: 'osm:node/1', name: 'Le Mont Saint-Michel', lat: 48.636, lon: -1.511 };

  it('relie par nom normalisé et ville de la destination', () => {
    expect(postMatchesPlace(place, post(), 'le mont-saint-michel')).toBe(true);
    expect(postMatchesPlace({ name: 'MONT SAINT MICHEL' }, post(), 'Le Mont-Saint-Michel')).toBe(true);
  });
  it('refuse un nom identique dans une autre ville (homonyme)', () => {
    expect(postMatchesPlace(place, post(), 'Rennes')).toBe(false);
  });
  it('refuse un nom identique sans ville ni coordonnées pour confirmer', () => {
    expect(postMatchesPlace(place, post({ city: undefined }), 'Le Mont-Saint-Michel')).toBe(false);
  });
  it('avec des coordonnées, compare la distance plutôt que la ville', () => {
    const near = post({ lat: 48.637, lon: -1.51, city: 'Autre' });
    const far = post({ lat: 45.76, lon: 4.83 });
    expect(postMatchesPlace(place, near, 'Rennes')).toBe(true);
    expect(postMatchesPlace(place, far, 'Le Mont-Saint-Michel')).toBe(false);
  });
  it('un nom différent ne correspond jamais', () => {
    expect(postMatchesPlace({ ...place, name: 'Abbaye de Jumièges' }, post(), 'Le Mont-Saint-Michel')).toBe(false);
  });
  it('un identifiant commun suffit, même si les noms diffèrent', () => {
    expect(postMatchesPlace(place, post({ name: 'Autre nom', city: undefined, placeId: 'osm:node/1' }))).toBe(true);
    expect(postMatchesPlace({ id: 'merimee:PA1', name: 'X', wikidata: 'Q42' }, post({ name: 'Y', placeId: 'Q42' }))).toBe(true);
    expect(postMatchesPlace({ id: 'wikidata:Q42', name: 'X' }, post({ name: 'Y', placeId: 'wikidata:Q42' }))).toBe(true);
    expect(postMatchesPlace(place, post({ name: 'Autre nom', placeId: 'osm:node/2' }), 'Le Mont-Saint-Michel')).toBe(false);
  });
});

describe('findInstagramPost', () => {
  const place = { id: 'osm:node/1', name: 'Mont Saint-Michel' };
  it('renvoie le post le plus récent quand plusieurs correspondent', () => {
    const posts = [
      post({ url: 'https://www.instagram.com/p/OLD/', postedAt: '2026-10-01T10:00:00Z' }),
      post({ url: 'https://www.instagram.com/p/NEW/', postedAt: '2026-11-20T10:00:00Z' }),
      post({ url: 'https://www.instagram.com/p/MID/', postedAt: '2026-11-01T10:00:00Z' }),
      post({ url: 'https://www.instagram.com/p/UNDATED/' })
    ];
    expect(findInstagramPost(place, posts, 'Le Mont-Saint-Michel')).toBe('https://www.instagram.com/p/NEW/');
  });
  it('renvoie null sans correspondance, sans liste ou sans lieu', () => {
    expect(findInstagramPost(place, [], 'Le Mont-Saint-Michel')).toBeNull();
    expect(findInstagramPost(place, undefined)).toBeNull();
    expect(findInstagramPost(null, [post()])).toBeNull();
  });
});

describe('parseInstagramPlaces', () => {
  it('garde les posts valides et nettoie les champs', () => {
    const out = parseInstagramPlaces({ places: [{ ...post(), account: 'ot_mont', lat: 48.6, lon: -1.5, postedAt: '2026-11-20T10:00:00Z', secret: 'x' }] });
    expect(out).toEqual([{ url: 'https://www.instagram.com/p/AAA111/', name: 'Mont-Saint-Michel', city: 'Le Mont-Saint-Michel', account: 'ot_mont', lat: 48.6, lon: -1.5, postedAt: '2026-11-20T10:00:00Z' }]);
  });
  it("ignore une adresse qui n'est pas un post Instagram (javascript:, autre site, http)", () => {
    const bad = ['javascript:alert(1)', 'https://evil.example/p/AAA/', 'http://www.instagram.com/p/AAA/', 'https://instagram.com.evil.example/p/AAA/', 'https://www.instagram.com/ot_mont/'];
    expect(parseInstagramPlaces({ places: bad.map((url) => post({ url })) })).toEqual([]);
  });
  it('ne lève jamais d\'erreur sur une réponse inattendue', () => {
    for (const raw of [null, undefined, 'x', 42, {}, { places: 'x' }, { places: [null, 1, {}] }]) expect(parseInstagramPlaces(raw)).toEqual([]);
  });
  it('ignore des coordonnées invalides', () => {
    const [entry] = parseInstagramPlaces({ places: [post({ lat: 999, lon: 1 })] });
    expect(entry.lat).toBeUndefined();
  });
});
