import { describe, expect, it } from 'vitest';
import { buildManifest, buildPointer, checkCountry, countryStatuses, storageCeilingMessage, storagePlan, summaryMarkdown } from './manifest.js';

const CHECKS = { maxDropRatio: 0.2, minCountForDropCheck: 100, maxFileBytes: 50 * 1024 * 1024 };

const result = (overrides = {}) => ({
  path: '2026-10-03/FR/0.2',
  format: 2,
  extract: 'europe/france',
  extractDate: '2026-10-03T20:21:20Z',
  counts: { restaurant: 89000, small_heritage: 110000, museum: 50 },
  total: 199050,
  tiles: ['225_21'],
  files: 1,
  bytes: 100,
  maxFileBytes: 100,
  maxFile: '2026-10-03/FR/0.2/225_21.json.gz',
  ...overrides
});

/** Manifeste en service : France en v1 (ancienne génération), Belgique en v2. */
const PREVIOUS = {
  v: 2,
  dataDate: '2026-09-24',
  cellDeg: 0.2,
  countries: {
    BE: { path: '2026-09-24/BE/0.2', format: 2, dataDate: '2026-09-24', total: 30000, counts: { restaurant: 12000 }, bytes: 1000, files: 10, tiles: ['253_21'], previousPath: '2026-08-03/BE/0.2' },
    FR: { path: '2026-09-24/FR/0.2', extractDate: '2026-09-24T20:21:20Z', total: 200000, counts: { restaurant: 90000, small_heritage: 110000, museum: 90 }, bytes: 7782490, files: 1811, tiles: ['225_21'] }
  }
};

describe('checkCountry', () => {
  const check = (r, previous, minRestaurants = 60000) => checkCountry({ code: 'FR', result: r, previous, minRestaurants, checks: CHECKS });

  it('accepte une version comparable à la précédente du pays', () => {
    expect(check(result(), PREVIOUS.countries.FR)).toEqual([]);
  });

  it('refuse une baisse de plus de 20 % du total ou d’une catégorie assez fournie', () => {
    expect(check(result({ total: 150000 }), PREVIOUS.countries.FR)).toEqual(['FR : 150000 lieux contre 200000 dans sa version précédente (baisse de 25 %).']);
    expect(check(result({ counts: { restaurant: 70000, small_heritage: 129000, museum: 10 }, total: 199010 }), PREVIOUS.countries.FR)).toEqual([
      'FR : restaurant 70000 contre 90000 dans sa version précédente (baisse de 22 %).'
    ]);
  });

  it('premier import : seuil minimum de restaurants, et lui seul', () => {
    expect(check(result({ counts: { restaurant: 5000 } }), undefined)).toEqual(['FR : 5000 restaurants pour un premier import, minimum attendu 60000.']);
    expect(check(result(), undefined)).toEqual([]);
    // Avec une version précédente, le seuil ne s'applique plus : seule la baisse compte.
    expect(check(result({ counts: { restaurant: 50000 } }), { total: 60000, counts: { restaurant: 55000 } })).toEqual([]);
  });

  it('refuse un fichier trop gros', () => {
    expect(check(result({ maxFileBytes: CHECKS.maxFileBytes }), PREVIOUS.countries.FR)[0]).toMatch(/limite 52428800/);
  });
});

describe('buildManifest', () => {
  it('manifeste v2 : dossier, date des données, lieux, cases et dossier précédent du pays regénéré', () => {
    const m = buildManifest({ version: '2026-10-03', cellDeg: 0.2, results: { FR: result() }, previous: PREVIOUS });
    expect(m).toMatchObject({ v: 2, dataDate: '2026-10-03', cellDeg: 0.2 });
    expect(m.countries.FR).toEqual({
      path: '2026-10-03/FR/0.2',
      format: 2,
      dataDate: '2026-10-03',
      extract: 'europe/france',
      extractDate: '2026-10-03T20:21:20Z',
      total: 199050,
      counts: result().counts,
      files: 1,
      bytes: 100,
      tiles: ['225_21'],
      previousPath: '2026-09-24/FR/0.2'
    });
  });

  it('un pays non regénéré (non demandé ou en échec) garde son entrée et son dossier', () => {
    const m = buildManifest({ version: '2026-10-03', cellDeg: 0.2, results: { FR: result() }, previous: PREVIOUS });
    expect(Object.keys(m.countries)).toEqual(['BE', 'FR']);
    expect(m.countries.BE).toBe(PREVIOUS.countries.BE);
  });

  it('regénérer la même version garde le dossier précédent connu', () => {
    const m = buildManifest({ version: '2026-09-24', cellDeg: 0.2, results: { BE: result({ path: '2026-09-24/BE/0.2' }) }, previous: PREVIOUS });
    expect(m.countries.BE.previousPath).toBe('2026-08-03/BE/0.2');
  });

  it('premier import d’un pays : pas de dossier précédent', () => {
    const m = buildManifest({ version: '2026-10-03', cellDeg: 0.2, results: { LU: result({ path: '2026-10-03/LU/0.2' }) }, previous: PREVIOUS });
    expect(m.countries.LU.previousPath).toBeNull();
  });

  it('un pays retiré de la configuration sort du manifeste', () => {
    const m = buildManifest({ version: '2026-10-03', cellDeg: 0.2, results: { FR: result() }, previous: PREVIOUS, configured: ['FR', 'LU'] });
    expect(Object.keys(m.countries)).toEqual(['FR']);
  });

  it('refuse de mélanger deux pas de grille', () => {
    expect(() => buildManifest({ version: '2026-10-03', cellDeg: 0.1, results: { FR: result() }, previous: PREVIOUS })).toThrow(/BE/);
  });
});

describe('buildPointer', () => {
  it('pointe vers la nouvelle version et garde la précédente', () => {
    expect(buildPointer('2026-10-03', { dataDate: '2026-09-24', previous: '2026-08-01' })).toEqual({ dataDate: '2026-10-03', manifest: '2026-10-03/manifest.json', previous: '2026-09-24' });
  });

  it('regénérer la même version garde sa précédente', () => {
    expect(buildPointer('2026-09-24', { dataDate: '2026-09-24', previous: '2026-08-01' }).previous).toBe('2026-08-01');
    expect(buildPointer('2026-09-24', null).previous).toBeNull();
  });
});

describe('storagePlan', () => {
  const tile = (folder, n, size) => ({ Key: `${folder}/${n}.json.gz`, Size: size });
  const OBJECTS = [
    { Key: 'current.json', Size: 100 },
    { Key: '2026-08-03/manifest.json', Size: 500 },
    { Key: '2026-09-24/manifest.json', Size: 500 },
    tile('2026-08-03/BE/0.2', '253_21', 900),
    tile('2026-08-03/FR/0.2', '225_21', 7000), // FR d'août : plus référencé
    tile('2026-09-24/BE/0.2', '253_21', 1000),
    tile('2026-09-24/FR/0.2', '225_21', 8000),
    { Key: 'LISEZMOI.txt', Size: 10 } // fichier inconnu : jamais touché
  ];

  it('garde le dossier en service et le précédent de chaque pays, supprime les autres', () => {
    const manifest = buildManifest({ version: '2026-10-03', cellDeg: 0.2, results: { FR: result() }, previous: PREVIOUS });
    const pointer = buildPointer('2026-10-03', { dataDate: '2026-09-24', previous: '2026-08-03' });
    const newFiles = [tile('2026-10-03/FR/0.2', '225_21', 8100), { Key: '2026-10-03/manifest.json', Size: 600 }, { Key: 'current.json', Size: 110 }];
    const plan = storagePlan({ objects: OBJECTS, newFiles, manifest, pointer, keptPrevious: PREVIOUS });
    // BE non regénérée : 09-24 en service et 08-03 (sa précédente) gardées. FR : 10-03 et 09-24.
    expect(plan.deletions).toEqual(['2026-08-03/FR/0.2/', '2026-08-03/manifest.json']);
    expect(plan.totalBytes).toBe(110 + 500 + 900 + 1000 + 8000 + 10 + 8100 + 600);
    expect(plan.byCountry).toEqual([
      { code: 'FR', bytes: 16100 },
      { code: 'BE', bytes: 1900 }
    ]);
  });

  it('sans le manifeste de la version précédente, ne supprime rien', () => {
    const manifest = buildManifest({ version: '2026-09-24', cellDeg: 0.2, results: { FR: result({ path: '2026-09-24/FR/0.2' }) }, previous: PREVIOUS });
    const pointer = buildPointer('2026-09-24', { dataDate: '2026-09-24', previous: '2026-08-03' });
    expect(storagePlan({ objects: OBJECTS, newFiles: [], manifest, pointer, keptPrevious: undefined }).deletions).toEqual([]);
  });

  it('première publication : bucket vide', () => {
    const manifest = buildManifest({ version: '2026-10-03', cellDeg: 0.2, results: { FR: result() }, previous: null });
    const plan = storagePlan({ objects: [], newFiles: [tile('2026-10-03/FR/0.2', '225_21', 50)], manifest, pointer: buildPointer('2026-10-03', null), keptPrevious: null });
    expect(plan).toEqual({ totalBytes: 50, byCountry: [{ code: 'FR', bytes: 50 }], deletions: [] });
  });
});

describe('storageCeilingMessage', () => {
  it('indique le total, le plafond et les pays les plus volumineux', () => {
    const message = storageCeilingMessage({ totalBytes: 30 * 1048576, byCountry: [{ code: 'FR', bytes: 25 * 1048576 }, { code: 'BE', bytes: 5 * 1048576 }] }, 20 * 1048576);
    expect(message).toBe(
      'Plafond de stockage dépassé : 30.0 Mo après publication (versions conservées comprises), plafond 20.0 Mo. Pays les plus volumineux : FR 25.0 Mo, BE 5.0 Mo. Rien n’est publié.'.replace('’', "'")
    );
  });
});

describe('countryStatuses / summaryMarkdown', () => {
  const manifest = buildManifest({ version: '2026-10-03', cellDeg: 0.2, results: { FR: result() }, previous: PREVIOUS });
  const failures = { BE: ['BE : 100 lieux contre 30000 dans sa version précédente (baisse de 100 %).'], LU: ['LU : téléchargement en échec'] };

  it('mis à jour, en échec avec version conservée, en échec sans couverture, conservé', () => {
    const withIt = { ...manifest, countries: { ...manifest.countries, NL: { path: '2026-09-24/NL/0.2', dataDate: '2026-09-24', total: 5, bytes: 9, files: 1 } } };
    const statuses = countryStatuses({ manifest: withIt, previous: PREVIOUS, results: { FR: result(), BE: result({ path: '2026-10-03/BE/0.2' }) }, failures });
    expect(statuses.map((s) => [s.code, s.status, s.dataDate])).toEqual([
      ['BE', 'failed_kept', '2026-09-24'],
      ['FR', 'updated', '2026-10-03'],
      ['LU', 'failed_missing', null],
      ['NL', 'kept', '2026-09-24']
    ]);
  });

  it('pays retiré : statut « retiré » avec sa dernière version, dans le résumé', () => {
    const without = buildManifest({ version: '2026-10-03', cellDeg: 0.2, results: { FR: result() }, previous: PREVIOUS, configured: ['FR'] });
    const statuses = countryStatuses({ manifest: without, previous: PREVIOUS, results: { FR: result() }, failures: {} });
    expect(statuses.map((s) => [s.code, s.status, s.dataDate])).toEqual([
      ['BE', 'removed', '2026-09-24'],
      ['FR', 'updated', '2026-10-03']
    ]);
    const md = summaryMarkdown({ version: '2026-10-03', statuses, results: { FR: result() }, previous: PREVIOUS, plan: null, maxStorageBytes: 1, blocking: null, published: true });
    expect(md).toContain('| BE | 🗑 retiré (absent de countries.json) | 2026-09-24 | 30000 |');
    expect(md).toContain('tous les pays demandés sont à jour');
  });

  it('date des données d’une entrée v1 : tirée de extractDate', () => {
    const statuses = countryStatuses({ manifest: null, previous: PREVIOUS, results: {}, failures: {} });
    expect(statuses.find((s) => s.code === 'FR')).toMatchObject({ status: 'kept', dataDate: '2026-09-24', bytes: 7782490 });
  });

  it('plafond dépassé : les pays générés sont « non publiés »', () => {
    const statuses = countryStatuses({ manifest: null, previous: PREVIOUS, results: { FR: result() }, failures: {} });
    expect(statuses.find((s) => s.code === 'FR')).toMatchObject({ status: 'not_published', dataDate: '2026-10-03', bytes: 100 });
  });

  it('résumé : une ligne par pays avec statut, date des données et taille, puis les erreurs', () => {
    const statuses = countryStatuses({ manifest, previous: PREVIOUS, results: { FR: result() }, failures });
    const md = summaryMarkdown({ version: '2026-10-03', statuses, results: { FR: result() }, previous: PREVIOUS, plan: { totalBytes: 10 * 1048576, byCountry: [], deletions: ['a/'] }, maxStorageBytes: 200 * 1048576, blocking: null, published: true });
    expect(md).toContain('| BE | ❌ en échec : version précédente conservée | 2026-09-24 | 30000 | 0.0 Mo | 10 |');
    expect(md).toContain('| FR | ✅ mis à jour | 2026-10-03 | 199050 | 0.0 Mo | 1 |');
    expect(md).toContain('| LU | ❌ en échec : pays non couvert | — | — | — | — |');
    expect(md).toContain('avec des pays en échec');
    expect(md).toContain('Stockage après publication : 10.0 Mo (plafond 200.0 Mo)');
    expect(md).toContain('- ❌ LU : téléchargement en échec');
  });
});
