// Essai réel des adaptateurs d'IA (_shared/ai) avec un petit schéma :
//   AI_API_KEY_MISTRAL=… AI_API_KEY_GEMINI=… node --use-system-ca scripts/ai/smoke.mjs [fournisseur…]
// Sans argument : tous les fournisseurs dont la clé est définie. Les clés ne sont lues que
// dans l'environnement (jamais dans un fichier du dépôt) et ne sont jamais affichées.
// Quotas : compteur en mémoire (aucune base).
import { complete } from '../../supabase/functions/_shared/ai/complete.js';
import { AI_PROVIDERS } from '../../supabase/functions/_shared/ai/providers/index.js';
import { mergeRules } from '../../supabase/functions/_shared/domain/config/mergeRules.js';
import { RULES } from '../../supabase/functions/_shared/domain/config/rules.js';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['city', 'country', 'sights'],
  properties: {
    city: { type: 'string' },
    country: { type: 'string', pattern: '^[A-Z]{2}$' },
    sights: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } }
  }
};
const REQUEST = {
  system: 'You answer with JSON only, following the given schema.',
  user: 'City: Lyon. Give its ISO 3166-1 alpha-2 country code and up to three famous sights.',
  jsonSchema: SCHEMA,
  language: 'fr'
};

const wanted = process.argv.slice(2);
const names = (wanted.length ? wanted : Object.keys(AI_PROVIDERS)).filter((n) => n !== 'off');
const store = { reserve: async () => true, addTokens: async () => {} };
let failures = 0;

for (const name of names) {
  const provider = AI_PROVIDERS[name];
  if (!provider) {
    console.log(`${name}: fournisseur inconnu`);
    failures += 1;
    continue;
  }
  if (!process.env[provider.secretName] && !wanted.length) {
    console.log(`${name}: ignoré (${provider.secretName} non défini)`);
    continue;
  }
  const model = process.env[`AI_MODEL_${name.toUpperCase()}`] ?? '';
  const rules = mergeRules(RULES, { ai: { enabled: true, provider: name, model } }).rules;
  const r = await complete(REQUEST, { rules, client: 'smoke', usageStore: store, getSecret: (k) => process.env[k] });
  if (r.ok) console.log(`${name} (${r.model}) : OK en ${r.durationMs} ms, ${r.usage.input}+${r.usage.output} jetons ->`, JSON.stringify(r.json));
  else {
    failures += 1;
    console.log(`${name} : échec « ${r.reason} »`);
  }
}
process.exitCode = failures ? 1 : 0;
