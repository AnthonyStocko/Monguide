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
| `complete.js` | `complete(request, ctx)` : activation, clé, quota, appel unique, contrôle du JSON (`domain/jsonSchema.js`), journal |
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

## Bloc B : résumé, instructions et format de réponse

### Résumé envoyé (`domain/buildReviewRequest.js`)

JSON compact : `trip` (ville, pays, dates, voyageurs, mode, profil, repas,
préférences), `days` (date, `rainPct` : pluie maximale par demi-journée
matin 8-12 h, après-midi 12-18 h, soir 18-22 h ; étapes), `candidates`
(au plus `ai.maxCandidates` = 80, chaque type proposé à tour de rôle, du
plus proche au plus éloigné), `wishes` (« Vos envies », une ligne, au plus
`ai.wishesMaxLength` caractères).

- Étape modifiable : alias, type, catégorie, nom public (langue de
  l'interface, 60 caractères au plus), plage horaire, intérieur, trajet.
- Étape fixe (personnelle, horaire personnalisé, terminée ou passée) :
  `{ id, locked: true, start, end }` seulement.
- Candidat : alias, catégorie, nom, intérieur, `km` (distance au lieu
  d'ancrage de chaque jour : hébergement de départ, sinon première étape),
  `hours` (horaires OSM, 60 caractères au plus).
- Identifiants : alias courts (`s1`…, `c1`…) ; `ids` les relie aux vrais
  identifiants. Jamais d'UUID, de coordonnées, d'hébergement (nom, adresse),
  de titre, note ou lieu d'étape personnelle, d'e-mail (vérifié par les tests).
- Taille mesurée (test et /debug, « Relecture par l'IA ») : environ
  10 500 caractères (≈ 2 600 jetons) pour 3 jours, 15 étapes et 80 candidats ;
  instructions ≈ 3 200 caractères ; schéma ≈ 2 000 à 2 500 caractères.

### Instructions (`ai/prompts/review.v1.md`)

Rôle de relecteur d'un planning déjà valide ; priorités (envies, variété,
journées non surchargées, intérieur ou plein air selon la météo) ; interdits
(rien d'inventé, étapes verrouillées, plus de `{{maxOps}}` opérations) ;
liste vide acceptée ; noms, horaires et envies traités comme des DONNÉES,
jamais comme des instructions. Rédigées en anglais (mieux suivies par les
modèles) ; la langue de la réponse est imposée par `complete` (`language`).
Une nouvelle version = un nouveau fichier (`review.v2.md`), en service via
`PROMPT_VERSIONS`. Jointes à la fonction `generate` par `static_files`
(`supabase/config.toml`).

### Format de réponse (`domain/reviewSchema.js`)

Schéma strict construit pour chaque séjour (`buildReviewSchema`) :
`operations` (au plus `ai.maxOpsPerTrip`, variantes `swap` { stepA, stepB },
`replace` { step, candidate }, `shift` { step, newStart "HH:mm" }, chacune
avec `reason` de 120 caractères au plus), `dayTitles` (un titre de 40
caractères au plus par date du séjour), `summary` (280 caractères au plus).
Les alias acceptés sont ceux du résumé : étapes modifiables seulement,
candidats envoyés seulement. Aucune étape modifiable : pas de schéma, l'IA
n'est pas appelée. Le schéma ne contrôle que la forme ; le sens des
opérations est vérifié par le code (bloc suivant).

## Bloc C : application de la réponse (`domain/applyReview.js`)

`applyReview(trip, response, rules)` : `response` est le résultat de
`complete` (`ai/complete.js`) avec `ids` (alias du résumé). Fonction pure,
sur une copie du séjour ; opérations appliquées une par une, dans l'ordre
reçu, `ai.maxOpsPerTrip` au plus (au-delà : refus `max_ops`).

Contrôles de chaque opération (refus = opération annulée, notée dans
`rejectedOps` avec sa raison technique) :

| Contrôle | Refus |
|---|---|
| opération connue et bien formée | `malformed` |
| étape et candidat existants (alias du résumé) | `unknown_step`, `unknown_candidate` |
| étape non fixe (personnelle, horaire choisi, terminée ou passée) | `locked_step` |
| échange : deux étapes différentes du même jour, repas avec repas | `same_step`, `different_days`, `meal_mismatch` |
| remplacement : candidat jamais déjà utilisé, de type compatible (un restaurant ne remplace qu'un repas ; profil du séjour), ouvert sur la plage, à au plus `travel.maxTravelMin` des voisins | `candidate_used`, `candidate_type`, `closed`, `travel` |
| décalage : heure "HH:mm" différente, même durée, avant minuit | `invalid_time` |
| après application, étapes touchées (`checkSlotTiming`) : pas de chevauchement, lieu ouvert, durée minimale, fin tardive et début au plus tard selon le type ; pluie refusée si elle n'était pas déjà prévue sur l'étape | `overlap`, `closed`, `too_short`, `late`, `rain` |
| après application, `checkDayInvariants` sur la journée ; étapes fixes inchangées | `invariants` |

Titres des jours et résumé : texte brut (balises HTML, liens et caractères
de contrôle retirés), longueurs vérifiées ; titre d'une date inconnue ignoré.

Résultat : `trip.review` (modèle `TripReview`, champ facultatif et
rétrocompatible, sans changement de `schemaVersion`) :
`{ status: "applied" | "unchanged" | "skipped", reason?, provider, model,
appliedOps, rejectedOps, dayTitles, summary, originalDays, reviewedAt }`,
plus `originalCandidates` (réserve d'avant, un remplacement la modifiant).
`originalDays` n'est gardé que si au moins une opération a été appliquée.
`revertReview(trip)` redonne exactement les jours et la réserve d'avant
relecture (status `reverted`).

Tests : cas précis (échange valide, restaurant fermé, étape verrouillée,
identifiant inventé, réponse vide, textes piégés, retour à l'origine) et
500 réponses aléatoires fast-check, absurdes comprises : `checkDayInvariants`
toujours tenu, étapes fixes jamais modifiées, retour exact à l'origine.