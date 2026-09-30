// Évaluation de la relecture par l'assistant IA sur 12 séjours types (docs/ai-review.md, Bloc G) :
//   AI_API_KEY_<FOURNISSEUR>=… node --use-system-ca scripts/ai-eval/run.mjs
// Fournisseur et modèle : ceux d'app_config en production (fonction config, adresse et clé
// publique de .env), comme l'application ; sans accès : règles par défaut. Surcharges
// ponctuelles : --provider <nom> --model <modèle>. Aucune modification de code pour changer
// de fournisseur. Relecture forcée (ai.enabled, consentement) ; quotas en mémoire.
// Écrit scripts/ai-eval/results/<date>-<fournisseur>.json et -manuel.md (vérification guidée
// des envies), et le tableau du README (entre les marqueurs ai-eval) si au moins une relecture
// a répondu (--no-readme pour ne pas y toucher).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { complete } from '../../supabase/functions/_shared/ai/complete.js';
import { reviewTrip } from '../../supabase/functions/_shared/ai/reviewTrip.js';
import { AI_PROVIDERS } from '../../supabase/functions/_shared/ai/providers/index.js';
import { PROMPT_VERSIONS } from '../../supabase/functions/_shared/ai/prompts/index.js';
import { RULES } from '../../supabase/functions/_shared/domain/config/rules.js';
import { mergeRules } from '../../supabase/functions/_shared/domain/config/mergeRules.js';
import { addDays, eachDate } from '../../supabase/functions/_shared/domain/dates.js';
import { generateTrip } from '../../supabase/functions/_shared/domain/generateTrip.js';
import { API_VERSION } from '../../supabase/functions/_shared/domain/version.js';
import { EVAL_FIXTURES, fixturePlaces, fixtureWeather } from './fixtures.js';
import { degradation, summarize, THRESHOLDS, travelMinutes, tripVariety, wishHints } from './metrics.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
// Journaux JSON du serveur masqués (seul le bilan est affiché).
const print = console.log.bind(console);
console.log = (...a) => (String(a[0]).startsWith('{') ? undefined : print(...a));
console.warn = () => {};

/** Règles effectives en production (fonction config), comme l'application. */
async function productionRules() {
  try {
    const env = Object.fromEntries(
      readFileSync(join(root, '.env'), 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^\w+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
    );
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/config`, {
      headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`, 'x-monguide-api': String(API_VERSION), 'x-monguide-app': pkg.version },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { rules } = await res.json();
    return { rules, source: 'app_config (production)' };
  } catch (err) {
    return { rules: RULES, source: `règles par défaut (configuration de production illisible : ${err.message})` };
  }
}

const { rules: prod, source } = await productionRules();
const provider = arg('provider') ?? prod.ai.provider;
const model = arg('model') ?? prod.ai.model;
const rules = mergeRules(prod, { ai: { enabled: true, provider, model } }).rules;
const resolvedModel = model || AI_PROVIDERS[provider]?.defaultModel || '?';
const secret = AI_PROVIDERS[provider]?.secretName;
print(`Fournisseur : ${provider}, modèle : ${resolvedModel} (${source}${arg('provider') || arg('model') ? ', surchargé en ligne de commande' : ''})`);
if (secret && !process.env[secret]) print(`Attention : ${secret} non défini, les relectures seront sautées (raison « error »).`);

const store = { reserve: async () => true, addTokens: async () => {} };
const rows = [];
const manual = [];

for (const f of EVAL_FIXTURES) {
  const endDate = addDays(f.startDate, f.days - 1);
  const base = {
    schemaVersion: 2, id: `eval-${f.id}`, title: f.destination.name, createdAt: 'x', updatedAt: 'x', deleted: false,
    destination: f.destination, timezone: f.timezone, currency: 'EUR', startDate: f.startDate, endDate, travelers: 2,
    mode: f.mode, ...(f.mode === 'car' ? { fuelType: 'diesel' } : {}), profile: f.profile, lunch: f.lunch, dinner: 'restaurant',
    prefs: { vegetarian: false, wheelchair: false }, lodgings: [], days: [], candidates: [], ...(f.wishes ? { params: { wishes: f.wishes } } : {})
  };
  let seq = 0;
  const { trip: before } = generateTrip({ trip: base, places: fixturePlaces(f), weatherDays: fixtureWeather(f, eachDate(f.startDate, endDate)), makeId: () => `${f.id}-${(seq += 1)}` }, rules);

  let call = null;
  const completeFn = async (request, ctx) => {
    const r = await complete(request, { ...ctx, getSecret: (k) => process.env[k] });
    call = r;
    return r;
  };
  const started = Date.now();
  const after = await reviewTrip(before, { rules, language: 'fr', consent: true, wishes: f.wishes, client: async () => 'eval', usageStore: store, completeFn });
  const r = after.review;
  const attempted = call !== null;
  const row = {
    id: f.id,
    label: f.label,
    wishes: f.wishes ?? null,
    status: r.status,
    reason: r.reason ?? null,
    proposed: r.appliedOps.length + r.rejectedOps.length,
    applied: r.appliedOps.length,
    rejected: r.rejectedOps.length,
    rejections: r.rejectedOps.map((o) => o.rejection),
    varietyBefore: tripVariety(before),
    varietyAfter: tripVariety(after),
    travelBefore: travelMinutes(before),
    travelAfter: travelMinutes(after),
    walking: f.mode === 'walk',
    degraded: degradation(before, after, rules),
    // Durée d'une vraie interrogation du modèle (réponse, délai dépassé, JSON invalide) ; pas d'un refus immédiat.
    durationMs: attempted && (call.ok || call.reason === 'timeout' || call.reason === 'invalid_json') ? (call.durationMs ?? Date.now() - started) : null,
    tokens: call?.ok ? call.usage.input + call.usage.output : 0,
    summary: r.summary,
    appliedOps: r.appliedOps.map(({ op, reason, nameA, nameB, fromName, toName, name, newStart }) => ({ op, reason, nameA, nameB, fromName, toName, name, newStart }))
  };
  rows.push(row);
  print(`${f.id.padEnd(14)} ${r.status}${r.reason ? ` (${r.reason})` : ''} : ${row.applied} appliquée(s), ${row.rejected} refusée(s), variété ${row.varietyBefore} -> ${row.varietyAfter}, trajets ${row.travelBefore} -> ${row.travelAfter} min${row.durationMs !== null ? `, ${row.durationMs} ms` : ''}`);
  if (f.wishes) manual.push({ f, row, hints: wishHints(f.wishes, before, after) });
}

const summary = summarize(rows);
const date = new Date().toISOString().slice(0, 10);
const tag = `${date}-${provider}-${resolvedModel.replace(/[^A-Za-z0-9.-]+/g, '_')}`;
const outDir = join(root, 'scripts', 'ai-eval', 'results');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${tag}.json`), `${JSON.stringify({ date, provider, model: resolvedModel, promptVersion: PROMPT_VERSIONS.review, source, summary, rows }, null, 2)}\n`);

// Vérification manuelle guidée des envies.
const md = [`# Envies : vérification manuelle (${date}, ${provider} / ${resolvedModel})`, '', 'Pour chaque séjour : lire les changements et le résumé, cocher si l\'envie est respectée ou si le résumé explique pourquoi elle ne l\'est pas.', ''];
for (const { f, row, hints } of manual) {
  md.push(`## ${f.label}`, '', `Envie : « ${f.wishes} » ; relecture : ${row.status}${row.reason ? ` (${row.reason})` : ''}`, '');
  for (const h of hints) md.push(`- ${h.label} : ${h.before} -> ${h.after}`);
  for (const op of row.appliedOps) md.push(`- ${op.op} : ${op.nameA ?? op.fromName ?? op.name ?? ''}${op.nameB ? ` / ${op.nameB}` : op.toName ? ` -> ${op.toName}` : op.newStart ? ` à ${op.newStart}` : ''} — ${op.reason ?? ''}`);
  md.push(`- Résumé : ${row.summary ?? '(aucun)'}`, '', '- [ ] Envie respectée, ou non-respect expliqué dans le résumé', '');
}
writeFileSync(join(outDir, `${tag}-manuel.md`), `${md.join('\n')}\n`);

// Tableau du README.
const yes = (ok) => (ok ? 'oui' : '**non**');
const lines = [
  `Évaluation du ${date} : fournisseur **${provider}**, modèle **${resolvedModel}**, consignes review.${PROMPT_VERSIONS.review} (${source}). Reproduire : \`node --use-system-ca scripts/ai-eval/run.mjs\` ; détail : \`scripts/ai-eval/results/${tag}.json\`, envies à vérifier : \`${tag}-manuel.md\`.`,
  '',
  '| Séjour | Envies | Relecture | Proposées | Appliquées | Rejetées (raisons) | Variété / jour | Trajets (min) | Durée | Jetons | Dégradé |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.label} | ${r.wishes ?? '—'} | ${r.status}${r.reason ? ` (${r.reason})` : ''} | ${r.proposed} | ${r.applied} | ${r.rejected}${r.rejections.length ? ` (${[...new Set(r.rejections)].join(', ')})` : ''} | ${r.varietyBefore} → ${r.varietyAfter} | ${r.travelBefore} → ${r.travelAfter}${r.walking ? ' (à pied)' : ''} | ${r.durationMs !== null ? `${(r.durationMs / 1000).toFixed(1)} s` : '—'} | ${r.tokens || '—'} | ${r.degraded.length ? `**oui** (${r.degraded.join(', ')})` : 'non'} |`),
  '',
  `**Seuils d'activation atteints : ${Object.values(summary.passes).every(Boolean) ? 'oui' : 'non'}** — opérations rejetées ${summary.rejectedPct} % (< ${THRESHOLDS.maxRejectedPct} % : ${yes(summary.passes.rejected)}), séjours dégradés ${summary.degraded} (${THRESHOLDS.maxDegraded} : ${yes(summary.passes.degraded)}), durée médiane ${summary.medianMs !== null ? `${(summary.medianMs / 1000).toFixed(1)} s` : '—'} (< ${THRESHOLDS.maxMedianMs / 1000} s : ${yes(summary.passes.duration)}), relectures abouties ${summary.answered}/${summary.trips}.`
];
print(`\n${lines.at(-1)}`);

if (!args.includes('--no-readme')) {
  if (!summary.answered) print('\nREADME non modifié : aucune relecture n\'a abouti (clé absente ou fournisseur indisponible).');
  else {
    const readme = join(root, 'README.md');
    const text = readFileSync(readme, 'utf8');
    const start = '<!-- ai-eval:start -->';
    const end = '<!-- ai-eval:end -->';
    if (!text.includes(start) || !text.includes(end)) print(`\nREADME non modifié : marqueurs ${start} / ${end} absents.`);
    else {
      const nl = text.includes('\r\n') ? '\r\n' : '\n';
      writeFileSync(readme, text.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}${nl}${lines.join(nl)}${nl}${end}`));
      print('\nTableau écrit dans le README.');
    }
  }
}
