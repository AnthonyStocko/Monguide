import { describe, expect, it } from 'vitest';
import { RULES } from '../config/rules.js';
import { applyPlaceQuality, isClosed, placeVerdict } from './exclusions.js';

const TODAY = '2026-10-30';
const place = (name, signals, extra = {}) => ({ id: `wikidata:${name}`, name, category: 'museum', lat: 50.85, lon: 4.35, source: 'wikidata', certified: true, indoor: true, signals, ...extra });

describe('lieux fermés ou disparus', () => {
  it('un lieu Wikidata avec une date de fermeture passée (P3999, P576) est exclu', () => {
    const closed = place('Ancien musée', { sitelinks: 12, closures: ['2011-01-31T00:00:00Z'] });
    expect(placeVerdict(closed, 60, RULES, { today: TODAY })).toEqual({ action: 'exclude', reason: 'closed' });
    const { places, excluded } = applyPlaceQuality([closed, place('Musée ouvert', { sitelinks: 12 })], RULES, { today: TODAY });
    expect(places.map((p) => p.name)).toEqual(['Musée ouvert']);
    expect(excluded).toEqual([{ id: 'wikidata:Ancien musée', name: 'Ancien musée', reason: 'closed' }]);
  });

  it('fermeture annoncée pour plus tard : gardé ; date inconnue : exclu', () => {
    expect(isClosed({ closures: ['2027-06-30T00:00:00Z'] }, TODAY)).toBe(false);
    expect(isClosed({ closures: ['http://www.wikidata.org/.well-known/genid/abc'] }, TODAY)).toBe(true);
    expect(isClosed({ closures: ['-0300-01-01T00:00:00Z'] }, TODAY)).toBe(true);
    expect(isClosed({ closures: [`${TODAY}T00:00:00Z`] }, TODAY)).toBe(true);
  });

  it('état d’usage (P5817) : fermé, désaffecté ou démoli exclu ; rouvert l’emporte sur une date ancienne', () => {
    expect(isClosed({ states: ['Q104664889'] }, TODAY)).toBe(true); // fermé définitivement
    expect(isClosed({ states: ['Q11639308'] }, TODAY)).toBe(true); // désaffecté
    expect(isClosed({ states: ['Q55653430'] }, TODAY)).toBe(true); // temporairement fermé
    expect(isClosed({ states: ['Q55654238'], closures: ['1990-01-01T00:00:00Z'] }, TODAY)).toBe(false); // en fonctionnement
    expect(isClosed({ states: ['Q56557159'] }, TODAY)).toBe(false); // en ruine : se visite
  });

  it('monument protégé : la date concerne l’usage d’origine, il se visite encore ; un musée fermé reste exclu', () => {
    const chartreuse = { sitelinks: 10, closures: ['1750-01-01T00:00:00Z'], designations: ['Q10387684'] };
    expect(isClosed(chartreuse, TODAY, { category: 'monument' })).toBe(false); // église Saint-Bruno (Lyon)
    expect(isClosed({ ...chartreuse, states: ['Q56556915'] }, TODAY, { category: 'monument' })).toBe(true); // démoli
    expect(isClosed({ closures: ['1965-01-01T00:00:00Z'] }, TODAY, { category: 'monument' })).toBe(true); // sans désignation
    expect(isClosed({ closures: ['2017-11-27T00:00:00Z'], designations: ['Q2065736'] }, TODAY, { category: 'museum' })).toBe(true);
  });

  it('tags OSM de fermeture : écarté, quelle que soit la catégorie', () => {
    const resto = { id: 'osm:node/1', name: 'Le Fermé', category: 'restaurant', lat: 1, lon: 1, source: 'osm', certified: false, indoor: true, signals: { osmClosed: true } };
    expect(placeVerdict(resto, 0, RULES, { today: TODAY })).toEqual({ action: 'exclude', reason: 'closed' });
  });

  it('élément dont tous les articles sont des redirections (lieu fusionné ou disparu) : exclu ; articles en partie redirigés non comptés', () => {
    // « Museum voor moderne en hedendaagse kunst » (Bruxelles) : son seul article redirige vers KANAL.
    const redirected = place('Museum voor moderne en hedendaagse kunst', { sitelinks: 1, redirects: 1, types: ['Q33506'] });
    expect(placeVerdict(redirected, 0, RULES, { today: TODAY })).toEqual({ action: 'exclude', reason: 'redirect_only' });
    const { places } = applyPlaceQuality([place('Musée', { sitelinks: 10, redirects: 4 })], RULES, { today: TODAY });
    expect(places[0].sitelinks).toBe(6);
  });
});
