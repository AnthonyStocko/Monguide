# Contrat d'API Mon guide — version 1

Ce document fait foi pour tous les échanges entre l'application et le
serveur. Toute fonction serveur y est décrite **avant** d'être codée. Un
changement incompatible incrémente la version du contrat
(`API_VERSION`, `supabase/functions/_shared/domain/version.js`).

## Généralités

### Adresse

`https://<projet>.supabase.co/functions/v1/<fonction>`

L'application passe exclusivement par `supabase.functions.invoke`
(`src/services/api.js`).

### En-têtes envoyés par l'application

| En-tête | Valeur | Obligatoire |
|---|---|---|
| `Authorization` | `Bearer <jeton>` : clé publique (mode invité) ou jeton de session (mode connecté) | oui |
| `apikey` | clé publique du projet (ajoutée par le SDK) | oui |
| `x-monguide-api` | version du contrat, entier (ex. `1`) | oui |
| `x-monguide-app` | version de l'application, `majeur.mineur.correctif` (ex. `0.1.0`) | oui |
| `Content-Type` | `application/json` (requêtes POST) | POST |

### Versions

- Le serveur accepte la version courante du contrat **et la précédente**.
  Plus ancienne : `426 app_outdated`. Absente, illisible ou plus récente que
  le serveur : `400 unsupported_api_version`.
- Si `x-monguide-app` est inférieure à `minAppVersion` (table `app_config`) :
  `426 app_outdated`. L'application affiche alors l'écran « Mettez à jour
  Mon guide ».

### Accès

Toutes les fonctions exigent un jeton valide, vérifié par la passerelle
Supabase (`verify_jwt = true`) : rôle `anon` (invité) ou `authenticated`
(connecté). Sinon : `401 unauthorized`.

### Limites de requêtes

Par client et par fenêtre fixe de `rateLimits.windowMin` minutes (60 par
défaut) :

| Type | Fonctions | Limite par défaut |
|---|---|---|
| `generate` | `generate` | `rateLimits.generatePerWindow` = 30 |
| `default` | toutes les autres | `rateLimits.otherPerWindow` = 600 |

Client = identifiant utilisateur s'il est connecté, sinon empreinte salée de
l'adresse IP (jamais l'IP en clair). Au-delà : `429 rate_limited` avec
l'en-tête `Retry-After` (secondes).

### Réponses

- Succès : `200`, corps JSON propre à chaque fonction.
- Erreur : corps `{ "error": { "code": "<code>", "message": "<texte>" } }`.
  Le message s'adresse aux développeurs (anglais) ; l'application affiche un
  texte traduit choisi d'après `code`.

| HTTP | `code` | Signification |
|---|---|---|
| 400 | `invalid_input` | entrée invalide (détail dans `message`) |
| 400 | `unsupported_api_version` | `x-monguide-api` absent, illisible ou plus récent que le serveur |
| 400 | `invalid_app_version` | `x-monguide-app` absent ou mal formé |
| 401 | `unauthorized` | jeton absent ou invalide |
| 405 | `method_not_allowed` | méthode HTTP non prise en charge (en-tête `Allow`) |
| 426 | `app_outdated` | application trop ancienne (contrat ou `minAppVersion`) |
| 429 | `rate_limited` | trop de requêtes (en-tête `Retry-After`) |
| 500 | `internal_error` | erreur du serveur |
| 502 | `external_unavailable` | source externe indisponible |

### CORS

Origines autorisées : `https://localhost` (Android), `capacitor://localhost`
(iOS, plus tard), `http://localhost:5173` (développement). En-tête exposé :
`Retry-After`.

### Cache

Les réponses des sources externes sont partagées entre utilisateurs (table
`api_cache`). Clé = source + paramètres normalisés, coordonnées arrondies à
0,01° (≈ 1 km). Durées par source : `cacheTtlSec` dans `rules.js`.

## Fonctions

### `config` — configuration de l'application

Appelée au lancement de l'application.

- **Méthode** : `GET`
- **Entrée** : aucune.
- **Sortie** :

  ```json
  {
    "apiVersion": 1,
    "minAppVersion": "0.0.0",
    "rules": { "weather": { "rainThresholdPct": 50 }, "…": "…" }
  }
  ```

  | Champ | Type | Description |
  |---|---|---|
  | `apiVersion` | entier | version courante du contrat côté serveur |
  | `minAppVersion` | chaîne `x.y.z` | version minimale de l'application (`0.0.0` si non définie) |
  | `rules` | objet | règles effectives : valeurs par défaut de `rules.js` fusionnées avec `app_config` |

- **Cache serveur** : 5 minutes (`cacheTtlSec.config`), invalidé dès qu'une
  ligne de `app_config` change.
- **Erreurs** : codes communs uniquement.

#### Surcharger une règle (`app_config`)

Depuis le tableau de bord (Table Editor) ou en SQL :

```sql
insert into public.app_config (key, value) values ('weather.rainThresholdPct', '60')
on conflict (key) do update set value = excluded.value;

insert into public.app_config (key, value) values ('minAppVersion', '"0.2.0"')
on conflict (key) do update set value = excluded.value;
```

`key` est le chemin pointé d'une règle de `rules.js` ; `value` doit être du
même type JSON que la valeur par défaut, sinon la surcharge est ignorée
(journal `app_config_ignored`).

### Fonctions prévues (à documenter avant d'être codées)

| Fonction | Phase | Rôle |
|---|---|---|
| `geocode` | 2 | recherche de destination |
| `weather` | 2 | prévisions (probabilité de pluie par heure) |
| `places` | 2 | lieux candidats autour d'une destination |
| `fuel-eu-refresh` | 2 bis | mise à jour des prix des carburants (pays européens hors France) |
| `generate` | 4 | génération d'un séjour (délai client 25 s) |
| `delete-account` | 5 bis | suppression du compte et des données |

## Historique

| Version | Date | Changements |
|---|---|---|
| 1 | 2026-09-24 | Version initiale : cadre commun, fonction `config`. |
