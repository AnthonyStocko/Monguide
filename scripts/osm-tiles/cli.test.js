import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * cli.js finalize de bout en bout, sur des fichiers de travail simulés (ce
 * que run.sh prépare) : critères de validation du Bloc C.
 */

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.js');

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
};

/** France en service, telle que publiée le 2026-09-24 (entrée v1). */
const FR_V1 = { path: '2026-09-24/FR/0.2', extract: 'europe/france', extractDate: '2026-09-24T20:21:20Z', total: 261886, counts: { restaurant: 89493 }, files: 2, bytes: 3000, tiles: ['225_21', '228_24'] };

/**
 * Prépare un répertoire de travail : pays générés (results + tuiles),
 * échecs des étapes shell, version en service et contenu du bucket.
 */
function workdir({ version, built = {}, failures = {}, current = null, manifest = null, objects = [] }) {
  const work = mkdtempSync(join(tmpdir(), 'osm-finalize-'));
  dirs.push(work);
  const out = join(work, 'out');
  mkdirSync(out, { recursive: true });
  for (const [code, r] of Object.entries(built)) {
    const path = `${version}/${code}/0.2`;
    for (const tile of r.tiles) {
      mkdirSync(join(out, path), { recursive: true });
      writeFileSync(join(out, path, `${tile}.json.gz`), Buffer.alloc(r.tileBytes ?? 1000));
    }
    const result = { path, format: 2, extract: `europe/${code}`, extractDate: `${version}T20:00:00Z`, counts: r.counts, total: r.total, tiles: r.tiles, files: r.tiles.length, bytes: r.tiles.length * (r.tileBytes ?? 1000), maxFileBytes: r.tileBytes ?? 1000, maxFile: `${path}/${r.tiles[0]}.json.gz` };
    writeJson(join(out, 'results', `${code}.json`), result);
  }
  for (const [code, reason] of Object.entries(failures)) {
    mkdirSync(join(work, 'failures'), { recursive: true });
    writeFileSync(join(work, 'failures', `${code}.txt`), reason);
  }
  if (current) writeJson(join(work, 'current.json'), current);
  if (manifest) writeJson(join(work, 'manifest.json'), manifest);
  writeJson(join(work, 'objects.json'), objects);
  return work;
}

function finalize(work, { version, maxStorageMb } = {}) {
  const args = [CLI, 'finalize', '--out', join(work, 'out'), '--version', version, '--failures', join(work, 'failures'), '--objects', join(work, 'objects.json')];
  if (existsSync(join(work, 'current.json'))) args.push('--current', join(work, 'current.json'));
  if (existsSync(join(work, 'manifest.json'))) args.push('--previous-manifest', join(work, 'manifest.json'));
  if (maxStorageMb) args.push('--max-storage-mb', String(maxStorageMb));
  const githubOutput = join(work, 'github-output.txt');
  const summaryFile = join(work, 'summary.md');
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: githubOutput, GITHUB_STEP_SUMMARY: summaryFile } });
  const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
  const json = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
  return {
    status: run.status,
    stderr: run.stderr,
    output: read(githubOutput),
    summary: read(summaryFile),
    manifest: json(join(work, 'out', version, 'manifest.json')),
    pointer: json(join(work, 'out', 'current.json')),
    deletions: read(join(work, 'out', 'delete.txt')),
    failed: read(join(work, 'out', 'failed.txt')),
    tilesOnDisk: (code) => existsSync(join(work, 'out', version, code))
  };
}

const IN_SERVICE = {
  current: { dataDate: '2026-09-24', manifest: '2026-09-24/manifest.json', previous: null },
  manifest: { v: 1, dataDate: '2026-09-24', cellDeg: 0.2, countries: { FR: FR_V1 } },
  objects: [
    { Key: 'current.json', Size: 90 },
    { Key: '2026-09-24/manifest.json', Size: 400 },
    { Key: '2026-09-24/FR/0.2/225_21.json.gz', Size: 1500 },
    { Key: '2026-09-24/FR/0.2/228_24.json.gz', Size: 1500 }
  ]
};

describe('cli.js finalize', () => {
  it('lancement "BE" : publie la Belgique sans retraiter la France, servie à l’identique', () => {
    const work = workdir({ version: '2026-09-28', built: { BE: { total: 30000, counts: { restaurant: 12000 }, tiles: ['253_21'] } }, ...IN_SERVICE });
    const r = finalize(work, { version: '2026-09-28' });
    expect(r.status).toBe(0);
    expect(r.output).toContain('publish=true');
    expect(r.manifest.countries.FR).toEqual(FR_V1); // même dossier, même entrée
    expect(r.manifest.countries.BE).toMatchObject({ path: '2026-09-28/BE/0.2', format: 2, dataDate: '2026-09-28', previousPath: null, tiles: ['253_21'] });
    expect(r.pointer).toEqual({ dataDate: '2026-09-28', manifest: '2026-09-28/manifest.json', previous: '2026-09-24' });
    expect(r.deletions).toBe(''); // la France et son manifeste restent
    expect(r.failed).toBe('');
    expect(r.summary).toMatch(/\| BE \| ✅ mis à jour \| 2026-09-28 \| 30000 \|/);
    expect(r.summary).toMatch(/\| FR \| ➖ conservé \(non demandé\) \| 2026-09-24 \| 261886 \| 0\.0 Mo \| 2 \|/);
  });

  it('échec simulé sur la Belgique : ses données précédentes restent en service, la France est publiée', () => {
    const beBefore = { path: '2026-09-28/BE/0.2', format: 2, dataDate: '2026-09-28', extract: 'europe/belgium', extractDate: '2026-09-28T20:00:00Z', total: 30000, counts: { restaurant: 12000 }, files: 1, bytes: 1000, tiles: ['253_21'], previousPath: null };
    const work = workdir({
      version: '2026-10-03',
      built: {
        FR: { total: 262000, counts: { restaurant: 89600 }, tiles: ['225_21', '228_24'] },
        BE: { total: 40, counts: { restaurant: 12 }, tiles: ['253_21'] } // extrait tronqué
      },
      current: { dataDate: '2026-09-28', manifest: '2026-09-28/manifest.json', previous: '2026-09-24' },
      manifest: { v: 2, dataDate: '2026-09-28', cellDeg: 0.2, countries: { BE: beBefore, FR: FR_V1 } },
      objects: [...IN_SERVICE.objects, { Key: '2026-09-28/manifest.json', Size: 500 }, { Key: '2026-09-28/BE/0.2/253_21.json.gz', Size: 1000 }]
    });
    const r = finalize(work, { version: '2026-10-03' });
    expect(r.status).toBe(0); // publication ; le lancement échouera à l'étape « Pays en échec »
    expect(r.output).toContain('publish=true');
    expect(r.manifest.countries.BE).toEqual(beBefore);
    expect(r.manifest.countries.FR).toMatchObject({ path: '2026-10-03/FR/0.2', previousPath: '2026-09-24/FR/0.2' });
    expect(r.tilesOnDisk('BE')).toBe(false); // tuiles belges tronquées jamais envoyées
    expect(r.tilesOnDisk('FR')).toBe(true);
    expect(r.failed).toBe('BE\n');
    expect(r.stderr).toContain('BE : 40 lieux contre 30000 dans sa version précédente');
    expect(r.summary).toMatch(/\| BE \| ❌ en échec : version précédente conservée \| 2026-09-28 \|/);
    expect(r.summary).toMatch(/\| FR \| ✅ mis à jour \| 2026-10-03 \|/);
    // Dossiers gardés : FR 09-24 est la précédente de FR, BE 09-28 est en service.
    // Seul le manifeste du 09-24 part : la version précédente est désormais le 09-28.
    expect(r.deletions).toBe('2026-09-24/manifest.json\n');
  });

  it('pays jamais importé en échec au téléchargement : non couvert, les autres publiés', () => {
    const work = workdir({ version: '2026-09-28', built: { BE: { total: 30000, counts: { restaurant: 12000 }, tiles: ['253_21'] } }, failures: { LU: 'téléchargement, vérification MD5 ou filtrage de europe/luxembourg en échec' }, ...IN_SERVICE });
    const r = finalize(work, { version: '2026-09-28' });
    expect(r.output).toContain('publish=true');
    expect(r.manifest.countries).not.toHaveProperty('LU');
    expect(r.failed).toBe('LU\n');
    expect(r.summary).toContain('| LU | ❌ en échec : pays non couvert | — |');
  });

  it('premier import sous le seuil de restaurants : refusé', () => {
    const work = workdir({ version: '2026-09-28', built: { BE: { total: 3000, counts: { restaurant: 1200 }, tiles: ['253_21'] } }, ...IN_SERVICE });
    const r = finalize(work, { version: '2026-09-28' });
    expect(r.output).toContain('publish=false');
    expect(r.failed).toBe('BE\n');
    expect(r.stderr).toContain('BE : 1200 restaurants pour un premier import, minimum attendu 9000.');
    expect(r.pointer).toBeNull();
  });

  it('plafond volontairement abaissé : arrêt sans publier, avec les pays les plus volumineux', () => {
    const work = workdir({ version: '2026-09-28', built: { BE: { total: 30000, counts: { restaurant: 12000 }, tiles: ['253_21'], tileBytes: 2000 } }, ...IN_SERVICE });
    const r = finalize(work, { version: '2026-09-28', maxStorageMb: 0.004 });
    expect(r.status).toBe(1);
    expect(r.output).toContain('publish=false');
    expect(r.manifest).toBeNull();
    expect(r.pointer).toBeNull();
    expect(r.stderr).toContain('Plafond de stockage dépassé');
    expect(r.stderr).toContain('Pays les plus volumineux : FR 0.0 Mo, BE 0.0 Mo');
    expect(r.summary).toMatch(/\| BE \| ⏸ généré, non publié \| 2026-09-28 \|/);
  });
});
