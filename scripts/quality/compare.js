// Rapport avant / après du Prompt 10.0 (Phase E) : compare deux générations des séjours de
// référence (reference-trips.js) avec les mesures de metrics.js :
//   node --use-system-ca scripts/quality/compare.js <dossier avant> <dossier après> [<rapport.md>]
// Dossiers dans scripts/quality/results/ (ex. 2026-10-30 et 2026-10-30-local-phaseE). Libellés
// Wikidata (langue des libellés affichés) relus sur wikidata.org. Rapport Markdown, par défaut
// docs/quality-report-10.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tripMetrics } from './metrics.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [beforeDir, afterDir, out = join(root, 'docs', 'quality-report-10.md')] = process.argv.slice(2);
if (!beforeDir || !afterDir) {
  console.log('Usage : node --use-system-ca scripts/quality/compare.js <dossier avant> <dossier après> [<rapport.md>]');
  process.exit(1);
}
const TRIPS = ['bruxelles', 'lyon', 'villefranche', 'colmar', 'barcelone'];
/** Bruxelles : lieux attendus (Bloc 0). */
const BRUSSELS_EXPECTED = ['Q215429', 'Q1491935', 'Q152072', 'Q1865794'];
const UA = { 'User-Agent': 'MonGuide-quality/1.0 (monguide.app@outlook.com)' };

const load = (dir, id) => JSON.parse(readFileSync(join(root, 'scripts', 'quality', 'results', dir, `${id}.json`), 'utf8'));
const qidOf = (p) => p?.wikidata ?? (p?.id?.startsWith('wikidata:') ? p.id.slice(9) : null);

async function wikidataLabels(qids) {
  const out = {};
  const list = [...new Set(qids)];
  for (let i = 0; i < list.length; i += 50) {
    const params = new URLSearchParams({ action: 'wbgetentities', format: 'json', ids: list.slice(i, i + 50).join('|'), props: 'labels', languages: 'fr|en|nl|de|es|ca' });
    const json = await (await fetch(`https://www.wikidata.org/w/api.php?${params}`, { headers: UA })).json();
    for (const [id, e] of Object.entries(json.entities ?? {})) out[id] = Object.fromEntries(Object.entries(e.labels ?? {}).map(([l, v]) => [l, v.value]));
  }
  return out;
}

const sum = (days, key) => days.reduce((n, d) => n + d[key], 0);
const verdict = (before, after, better) => (after === before ? '=' : better(after, before) ? 'mieux' : 'moins bien');
const lower = (a, b) => a < b;
const higher = (a, b) => a > b;

const rows = [];
const lines = [
  '# Séjours de référence : avant / après le Prompt 10.0',
  '',
  `Avant : \`${beforeDir}\` (production avant le Prompt 10.0). Après : \`${afterDir}\`. Généré par \`scripts/quality/compare.js\` le ${new Date().toISOString().slice(0, 10)}.`,
  '',
  'Mesures (`scripts/quality/metrics.js`) : incontournables présents (ceux du séjour « après », plus, à Bruxelles, Grand-Place, Galeries royales Saint-Hubert, Manneken-Pis et Mont des Arts) ; étapes au libellé générique ; libellés ni français ni anglais alors qu’une version française ou anglaise existe ; temps morts (total des écarts de plus de 30 min, et écart le plus long, par jour) ; repas manquants ; visites en extérieur finies après le coucher du soleil − 30 min.',
  ''
];

for (const id of TRIPS) {
  let before;
  let after;
  try {
    before = load(beforeDir, id);
    after = load(afterDir, id);
  } catch {
    lines.push(`## ${id}`, '', 'Résultats absents.', '');
    continue;
  }
  const steps = (t) => t.days.flatMap((d) => d.steps).filter((s) => s.place);
  const reservePlaces = (t) => (t.candidates ?? []).filter((p) => p.category !== 'restaurant');
  const labels = await wikidataLabels([...steps(before.trip).map((s) => s.place), ...steps(after.trip).map((s) => s.place), ...reservePlaces(before.trip), ...reservePlaces(after.trip)].map(qidOf).filter(Boolean));
  const mustSee = [...new Set([...steps(after.trip).filter((s) => s.badges?.includes('must_see')).map((s) => qidOf(s.place)).filter(Boolean), ...(id === 'bruxelles' ? BRUSSELS_EXPECTED : [])])];
  const options = { mustSee, labelsOf: (p) => labels[qidOf(p)] };
  const b = tripMetrics(before.trip, options);
  const a = tripMetrics(after.trip, options);
  const measures = [
    ['Incontournables présents', `${b.mustSee.length} / ${mustSee.length}`, `${a.mustSee.length} / ${mustSee.length}`, verdict(b.mustSee.length, a.mustSee.length, higher)],
    ['Étapes au libellé générique', b.genericLabels.length, a.genericLabels.length, verdict(b.genericLabels.length, a.genericLabels.length, lower)],
    ['Libellés dans une langue non voulue', b.unwantedLanguage.length, a.unwantedLanguage.length, verdict(b.unwantedLanguage.length, a.unwantedLanguage.length, lower)],
    ['Temps morts (min, total du séjour)', sum(b.days, 'deadMin'), sum(a.days, 'deadMin'), verdict(sum(b.days, 'deadMin'), sum(a.days, 'deadMin'), lower)],
    ['Plus long écart d’une journée (min)', Math.max(...b.days.map((d) => d.maxGapMin)), Math.max(...a.days.map((d) => d.maxGapMin)), verdict(Math.max(...b.days.map((d) => d.maxGapMin)), Math.max(...a.days.map((d) => d.maxGapMin)), lower)],
    ['Réserve : lieux au libellé générique', b.reserveGeneric.length, a.reserveGeneric.length, verdict(b.reserveGeneric.length, a.reserveGeneric.length, lower)],
    ['Réserve : libellés dans une langue non voulue', b.reserveUnwanted.length, a.reserveUnwanted.length, verdict(b.reserveUnwanted.length, a.reserveUnwanted.length, lower)],
    ['Repas manquants', b.missingMeals, a.missingMeals, verdict(b.missingMeals, a.missingMeals, lower)],
    ['Visites en extérieur après la nuit', sum(b.days.map((d) => ({ n: d.outdoorAfterDark.length })), 'n'), sum(a.days.map((d) => ({ n: d.outdoorAfterDark.length })), 'n'), verdict(sum(b.days.map((d) => ({ n: d.outdoorAfterDark.length })), 'n'), sum(a.days.map((d) => ({ n: d.outdoorAfterDark.length })), 'n'), lower)],
    ['Visites (total)', sum(b.days, 'visits'), sum(a.days, 'visits'), verdict(sum(b.days, 'visits'), sum(a.days, 'visits'), higher)]
  ];
  rows.push({ id, measures });
  lines.push(`## ${after.trip.destination.name} (${after.trip.startDate} → ${after.trip.endDate})`, '', '| Mesure | Avant | Après | |', '|---|---|---|---|');
  for (const [name, x, y, v] of measures) lines.push(`| ${name} | ${x} | ${y} | ${v} |`);
  lines.push('', '| Jour | Temps morts avant | après | Visites avant | après | Extérieur après la nuit (avant) |', '|---|---|---|---|---|---|');
  a.days.forEach((d, i) => lines.push(`| ${d.date} | ${b.days[i]?.deadMin ?? '—'} min | ${d.deadMin} min | ${b.days[i]?.visits ?? '—'} | ${d.visits} | ${b.days[i]?.outdoorAfterDark.join(', ') || '—'} |`));
  if (b.reserveGeneric.length) lines.push('', `Réserve avant, libellés génériques (extrait) : ${b.reserveGeneric.slice(0, 12).join(', ')}.`);
  if (b.reserveUnwanted.length) lines.push('', `Réserve avant, langue non voulue : ${b.reserveUnwanted.slice(0, 12).join(', ')}.`);
  if (b.genericLabels.length) lines.push('', `Libellés génériques avant : ${b.genericLabels.join(', ')}.`);
  if (b.unwantedLanguage.length) lines.push('', `Libellés dans une langue non voulue avant : ${b.unwantedLanguage.join(', ')}.`);
  if (a.genericLabels.length || a.unwantedLanguage.length) lines.push('', `Après : ${[...a.genericLabels, ...a.unwantedLanguage].join(', ')}.`);
  lines.push('');
}

lines.splice(6, 0, '## Synthèse', '', '| Séjour | Mieux | = | Moins bien |', '|---|---|---|---|', ...rows.map((r) => `| ${r.id} | ${r.measures.filter((m) => m[3] === 'mieux').length} | ${r.measures.filter((m) => m[3] === '=').length} | ${r.measures.filter((m) => m[3] === 'moins bien').map((m) => m[0]).join(', ') || 0} |`), '');
writeFileSync(out, lines.join('\n'));
console.log(`Rapport : ${out}`);
for (const r of rows) console.log(r.id, r.measures.map((m) => `${m[0]}: ${m[1]} -> ${m[2]} (${m[3]})`).join(' | '));
