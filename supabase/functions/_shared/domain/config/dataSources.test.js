import { describe, expect, it } from 'vitest';
import { EU_MEMBERS } from './countries.js';
import { DATA_SOURCES, sourcesFor } from './dataSources.js';

const ids = (list) => list.map((s) => s.id);

describe('sourcesFor', () => {
  it('France : sources françaises, carburants seulement en voiture', () => {
    expect(ids(sourcesFor('FR', 'walk', EU_MEMBERS))).toEqual(['osm', 'photon', 'openMeteo', 'nagerDate', 'ademe', 'culture', 'inao']);
    expect(ids(sourcesFor('FR', 'car', EU_MEMBERS))).toContain('fuelFr');
  });

  it('hors de France : Wikidata, Ember ; Bulletin pétrolier pour les seuls pays de l\'UE', () => {
    expect(ids(sourcesFor('PT', 'car', EU_MEMBERS))).toEqual(expect.arrayContaining(['wikidata', 'ember', 'oilBulletin', 'ecb']));
    expect(ids(sourcesFor('CH', 'car', EU_MEMBERS))).not.toContain('oilBulletin');
    expect(ids(sourcesFor('PT', 'walk', EU_MEMBERS))).not.toContain('culture');
  });

  it('chaque source a un nom, un titulaire, une licence et une adresse', () => {
    for (const s of DATA_SOURCES) expect(s.name && s.holder && s.license && s.url.startsWith('https://')).toBeTruthy();
  });
});
