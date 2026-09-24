import { describe, expect, it } from 'vitest';
import { appellationsFor, departmentOfCommune, indexInaoCsv, splitCsvLine } from './terroir.js';

const CSV = [
  'CI;Département;Commune;Art;"Aire géographique";IDA',
  '69092;RHONE;Gleizé;;"Beaujolais";1234',
  '69092;RHONE;Gleizé;;"Coteaux du Lyonnais";99',
  '69264;RHONE;Villefranche-sur-Saône;;"Beaujolais";1234',
  '69264;RHONE;Villefranche-sur-Saône;;"Beaujolais";1234',
  '01001;AIN;Abergement-Clémenciat;(L\');"Crème de Bresse";2339',
  '2A004;CORSE-DU-SUD;Ajaccio;;"Brocciu";10',
  ''
].join('\r\n');

describe('splitCsvLine', () => {
  it('gère les guillemets et les guillemets doublés', () => {
    expect(splitCsvLine('a;"b;c";"d ""e""";')).toEqual(['a', 'b;c', 'd "e"', '']);
  });
});

describe('departmentOfCommune', () => {
  it('extrait le département, y compris Corse et outre-mer', () => {
    expect(departmentOfCommune('69264')).toBe('69');
    expect(departmentOfCommune('2A004')).toBe('2A');
    expect(departmentOfCommune('97411')).toBe('974');
  });
});

describe('indexInaoCsv', () => {
  it('indexe les appellations par département et commune, sans doublon', () => {
    expect(indexInaoCsv(CSV)).toEqual({
      69: { 69092: ['Beaujolais', 'Coteaux du Lyonnais'], 69264: ['Beaujolais'] },
      '01': { '01001': ['Crème de Bresse'] },
      '2A': { '2A004': ['Brocciu'] }
    });
  });

  it('refuse un fichier au format inattendu', () => {
    expect(() => indexInaoCsv('a;b\n1;2')).toThrow(TypeError);
  });
});

describe('appellationsFor', () => {
  it('place les appellations de la commune de destination en premier, sans doublon', () => {
    const byCommune = { 69264: ['Beaujolais'], 69092: ['Beaujolais', 'Coteaux du Lyonnais'], '01001': ['Crème de Bresse'] };
    expect(appellationsFor({ local: '69264', codes: ['69264', '69092', '01001'] }, byCommune)).toEqual([
      { name: 'Beaujolais', local: true },
      { name: 'Coteaux du Lyonnais', local: false },
      { name: 'Crème de Bresse', local: false }
    ]);
  });

  it('fonctionne sans commune de destination connue', () => {
    expect(appellationsFor({ local: null, codes: ['69092'] }, { 69092: ['Beaujolais'] })).toEqual([{ name: 'Beaujolais', local: false }]);
  });
});
