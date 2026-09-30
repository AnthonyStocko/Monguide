# Relecture du planning par une IA

Après la génération (`generateTrip`, inchangée), la fonction `generate`
peut faire relire le planning par un modèle d'IA, qui propose des
ajustements. Les principes :

- **L'IA propose, le code vérifie.** Le modèle ne renvoie que des opérations
  structurées (JSON), chacune contrôlée par les fonctions existantes ;
  une opération invalide est ignorée, les autres sont appliquées.
- **Aucun lieu, horaire ou information inventé** : seulement des lieux du
  séjour ou de `trip.candidates`, par leur identifiant.
- **Étapes verrouillées jamais modifiées** (étapes personnelles, horaires
  personnalisés).
- **Relecture facultative et bornée** : 8 s au plus, une seule requête ;
  échec, délai dépassé ou quota épuisé : planning livré sans relecture,
  sans erreur.
- **Aucune donnée personnelle envoyée** : ni e-mail, ni hébergement, ni
  titre ou note d'étape personnelle, ni coordonnées précises.
- **Intégration directe** (décision du 2026-09-30) : les ajustements
  retenus sont intégrés au planning, sans mention dans l'interface ni
  retour à la version d'origine. Seuls les journaux du serveur en gardent
  la trace. La politique de confidentialité mentionne le sous-traitant.

## Bloc A : accès aux modèles (`supabase/functions/_shared/ai/`)

| Fichier | Rôle |
|---|---|
| `types.js` | interface commune, raisons d'échec |
| `complete.js` | `complete(request, ctx)` : activation, clé, quota, appel unique, contrôle du JSON, journal |
| `jsonSchema.js` | vérification de la réponse contre le schéma (sous-ensemble de JSON Schema) |
| `providers/` | adaptateurs `mistral`, `groq`, `openrouter` (format « chat completions »), `gemini`, `off` |
| `usageStore.js` | quotas dans la table `ai_usage` |

```
complete({ system, user, jsonSchema, timeoutMs, language }, { rules, client, usageStore })
  -> { ok: true, json, usage: { input, output }, provider, model, durationMs }
  -> { ok: false, reason: "timeout" | "quota" | "invalid_json" | "error" | "disabled" }
```

`disabled` s'ajoute aux quatre raisons prévues : relecture désactivée
(`ai.enabled` false ou fournisseur `off`), sans appel ni erreur.
`complete` ne lève jamais d'exception.

Ordre des contrôles : activation, fournisseur connu et clé présente, quota
du jour (**avant** tout appel au fournisseur ; compteurs illisibles : on
n'appelle pas), une seule requête (délai `ai.timeoutMs`, jamais de nouvelle
tentative ; 429 du fournisseur : `quota` ; autre refus, dont une clé
invalide : `error`), puis contrôle du JSON (`invalid_json`).

### Fournisseurs

API et mode JSON vérifiés dans la documentation de chacun le 2026-09-30,
et joints réellement depuis ce poste (clé invalide : 401, ou 400 pour
Gemini, donc `error`). **Offres gratuites et limites : À VÉRIFIER** dans
chaque console : elles changent souvent (l'offre gratuite de l'API Mistral
aurait été réduite en septembre 2026).

| `ai.provider` | Point d'accès | Mode JSON | Modèle par défaut |
|---|---|---|---|
| `mistral` | `api.mistral.ai/v1/chat/completions` (UE) | `response_format` `json_schema`, `strict` | `mistral-small-latest` |
| `groq` | `api.groq.com/openai/v1/chat/completions` | idem (strict : modèles gpt-oss) | `openai/gpt-oss-120b` |
| `openrouter` | `openrouter.ai/api/v1/chat/completions` | idem, `provider.require_parameters` | `openai/gpt-oss-120b:free` (À VÉRIFIER) |
| `gemini` | `generativelanguage.googleapis.com/v1beta/models/<modèle>:generateContent` | `generationConfig.responseJsonSchema` ; clé dans l'en-tête `x-goog-api-key` | `gemini-3.8-flash` |
| `off` | aucun appel | — | — |

### Configuration

Valeurs par défaut dans `rules.js` (rubrique `ai`), surcharges dans
`app_config`, prises en compte sans redéploiement (cache de configuration
vidé à chaque modification) :

```sql
-- Un bloc…
insert into public.app_config (key, value) values ('ai', '{"provider": "groq", "model": ""}')
  on conflict (key) do update set value = excluded.value;
-- …ou une clé à la fois : désactiver la relecture
insert into public.app_config (key, value) values ('ai.enabled', 'false')
  on conflict (key) do update set value = excluded.value;
```

| Clé | Défaut | Rôle |
|---|---|---|
| `enabled` | `true` | relecture active |
| `provider` | `mistral` | fournisseur |
| `model` | `""` | modèle ; vide = celui du fournisseur |
| `timeoutMs` | 8000 | délai maximal d'une relecture |
| `maxOpsPerTrip` | 6 | opérations retenues au plus par séjour |
| `userDailyLimit` | 5 | relectures par jour (UTC) et par client |
| `globalDailyLimit` | 500 | relectures par jour, tous clients |

### Clés d'API

Uniquement dans les secrets Supabase, jamais dans le dépôt ni dans GitHub :

```
npx supabase secrets set AI_API_KEY_GROQ=<clé>
```

Sans clé pour le fournisseur choisi : `error`, aucun appel, planning livré
sans relecture. La clé n'est jamais journalisée (seul l'hôte des appels
externes l'est, voir `http.js`).

### Quotas (`ai_usage`)

Migration `20260930100000_ai_usage.sql` : une ligne par jour (UTC) et par
client (`u:<id>` pour un utilisateur connecté, sinon `ip:<empreinte salée>`,
comme `rate_limits`), plus une ligne `*` pour le total du jour ; appels et
jetons. `ai_usage_reserve` compte l'appel sous verrou si le client et le
total sont sous leurs limites, sinon renvoie `false`. Purge après 90 jours
(pg_cron).

### Journaux

Événement `ai_call` : fournisseur, modèle, durée, jetons (`usage`), résultat
(`ok` ou la raison, avec un détail technique : `no_key`, `http_401`,
`daily_limit`…). Jamais le contenu envoyé ni reçu.

### Essai réel

```
AI_API_KEY_GROQ=<clé> node --use-system-ca scripts/ai/smoke.mjs groq
```

Appelle chaque fournisseur dont la clé est définie avec un petit schéma
d'essai et affiche le JSON reçu (quota en mémoire, aucune base).
`AI_MODEL_<FOURNISSEUR>` choisit un autre modèle.
