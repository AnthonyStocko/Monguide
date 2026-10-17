import { describe, expect, it } from 'vitest';
import { hasReviewLinks, reviewLinks } from './reviewLinks.js';

const restaurant = (patch = {}) => ({
  id: 'osm:node/1',
  name: 'Daniel et Denise',
  category: 'restaurant',
  lat: 45.7578912,
  lon: 4.8320149,
  source: 'osm',
  certified: false,
  indoor: true,
  food: { regional: true },
  ...patch
});

const query = (url) => new URL(url).searchParams.get('query');
const q = (url) => new URL(url).searchParams.get('q');

describe('reviewLinks', () => {
  it('nom, rue et ville : requête Google « nom, rue, ville », Tripadvisor « nom ville » sur tripadvisor.fr', () => {
    const links = reviewLinks(restaurant(), 'fr', { city: 'Lyon', street: '156 rue de Créqui' });
    expect(links.google).toBe('https://www.google.com/maps/search/?api=1&query=Daniel%20et%20Denise%2C%20156%20rue%20de%20Cr%C3%A9qui%2C%20Lyon');
    expect(query(links.google)).toBe('Daniel et Denise, 156 rue de Créqui, Lyon');
    expect(links.tripadvisor).toBe('https://www.tripadvisor.fr/Search?q=Daniel%20et%20Denise%20Lyon');
    expect(links.website).toBeUndefined();
  });

  it('restaurant sans adresse : « nom, ville »', () => {
    expect(query(reviewLinks(restaurant(), 'fr', { city: 'Lyon' }).google)).toBe('Daniel et Denise, Lyon');
  });

  it('restaurant sans ville : nom suivi des coordonnées arrondies à 5 décimales ; Tripadvisor sur le nom seul', () => {
    const links = reviewLinks(restaurant(), 'fr');
    expect(query(links.google)).toBe('Daniel et Denise 45.75789,4.83201');
    expect(q(links.tripadvisor)).toBe('Daniel et Denise');
    expect(query(reviewLinks(restaurant(), 'fr', { city: '  ' }).google)).toBe('Daniel et Denise 45.75789,4.83201');
  });

  it('« & » et apostrophe encodés : la requête n’est pas coupée', () => {
    const links = reviewLinks(restaurant({ name: "L'Ami & Co" }), 'fr', { city: "Villefranche-sur-Saône" });
    expect(links.google).toContain('query=L\'Ami%20%26%20Co%2C%20Villefranche-sur-Sa%C3%B4ne');
    expect(new URL(links.google).searchParams.get('api')).toBe('1');
    expect(query(links.google)).toBe("L'Ami & Co, Villefranche-sur-Saône");
    expect(q(links.tripadvisor)).toBe("L'Ami & Co Villefranche-sur-Saône");
  });

  it('nom en grec : caractères non latins encodés en UTF-8', () => {
    const links = reviewLinks(restaurant({ name: 'Ταβέρνα Ψαράς', names: { fr: 'Taverne Psaras' } }), 'en', { city: 'Athènes' });
    expect(links.google).toContain('%CE%A4%CE%B1%CE%B2');
    expect(query(links.google)).toBe('Ταβέρνα Ψαράς, Athènes');
    expect(links.tripadvisor.startsWith('https://www.tripadvisor.com/Search?q=')).toBe(true);
    expect(q(links.tripadvisor)).toBe('Ταβέρνα Ψαράς Athènes');
  });

  it('nom d’origine (name), jamais la traduction (names)', () => {
    const links = reviewLinks(restaurant({ name: 'Restaurante Casa Lucio', names: { fr: 'Restaurant Casa Lucio' } }), 'fr', { city: 'Madrid' });
    expect(query(links.google)).toBe('Restaurante Casa Lucio, Madrid');
  });

  it('domaine Tripadvisor selon la langue de l’interface', () => {
    expect(reviewLinks(restaurant(), 'fr-FR').tripadvisor).toMatch(/^https:\/\/www\.tripadvisor\.fr\//);
    expect(reviewLinks(restaurant(), 'en').tripadvisor).toMatch(/^https:\/\/www\.tripadvisor\.com\//);
    expect(reviewLinks(restaurant(), undefined).tripadvisor).toMatch(/^https:\/\/www\.tripadvisor\.com\//);
  });

  it('site web : gardé s’il commence par http:// ou https://, ignoré sinon', () => {
    expect(reviewLinks(restaurant({ food: { regional: false, website: 'https://www.danieletdenise.fr/' } }), 'fr').website).toBe('https://www.danieletdenise.fr/');
    expect(reviewLinks(restaurant({ food: { regional: false, website: 'HTTP://exemple.org' } }), 'fr').website).toBe('HTTP://exemple.org');
    expect(reviewLinks(restaurant({ url: 'http://exemple.org/menu' }), 'fr').website).toBe('http://exemple.org/menu');
    for (const website of ['www.exemple.org', 'javascript:alert(1)', 'ftp://exemple.org', 'https://', 'https://a b.org', '']) {
      expect(reviewLinks(restaurant({ food: { regional: false, website } }), 'fr').website, website).toBeUndefined();
    }
  });
});

describe('hasReviewLinks', () => {
  it('restaurants nommés seulement : jamais un monument, un musée, une étape personnelle ou un restaurant sans nom', () => {
    expect(hasReviewLinks(restaurant())).toBe(true);
    expect(hasReviewLinks(restaurant({ category: 'monument' }))).toBe(false);
    expect(hasReviewLinks(restaurant({ category: 'museum' }))).toBe(false);
    expect(hasReviewLinks({ id: 'user:1', name: 'Chez Paul', category: 'personal', lat: 1, lon: 2, source: 'user' })).toBe(false);
    expect(hasReviewLinks(restaurant({ unnamed: true, name: 'Restaurant' }))).toBe(false);
    expect(hasReviewLinks(undefined)).toBe(false);
  });
});
