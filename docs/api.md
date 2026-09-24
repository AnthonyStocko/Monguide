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
| 400 | `unsupported_country` | pays de destination non pris en charge |
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

### `geocode` — recherche de destination

Autocomplétion des villes et villages (source : Photon, OpenStreetMap).

- **Méthode** : `GET`
- **Entrée** (paramètres d'URL), l'une ou l'autre forme :

  | Paramètre | Type | Description |
  |---|---|---|
  | `q` | chaîne, 3 à 100 caractères | texte saisi (recherche) |
  | `lat`, `lon` | nombres | position (recherche inverse, « Utiliser ma position ») |
  | `lang` | `fr` \| `en` | langue des noms (défaut `fr`) |

  L'application n'appelle `geocode` qu'à partir de 3 caractères, après
  300 ms sans frappe (`geocode.minChars`, `geocode.debounceMs`).

- **Sortie** : `{ "results": GeocodeResult[] }`, 10 résultats au plus
  (0 ou 1 en recherche inverse), limités aux pays pris en charge.

  | Champ | Type | Description |
  |---|---|---|
  | `name` | chaîne | nom de la commune |
  | `region` | chaîne ? | département ou région, pour distinguer les homonymes |
  | `country` | chaîne | nom du pays, dans la langue demandée |
  | `countryCode` | chaîne | code ISO 3166-1 alpha-2 (ex. `FR`) |
  | `lat`, `lon` | nombres | position |
  | `timezone` | chaîne | fuseau horaire IANA de la destination |

- **Cache serveur** : 30 jours (`cacheTtlSec.geocode`), clé = texte
  normalisé + langue, ou position arrondie à 0,01°.
- **Erreurs** : codes communs (`400 invalid_input` si `q` trop court ou
  position invalide, `502 external_unavailable` si Photon ne répond pas).

### `weather` — prévisions par jour

Source : Open-Meteo, 16 jours de prévision (aujourd'hui + 15).

- **Méthode** : `GET`
- **Entrée** (paramètres d'URL) :

  | Paramètre | Type | Description |
  |---|---|---|
  | `lat`, `lon` | nombres | destination |
  | `timezone` | chaîne IANA | fuseau du séjour (`trip.timezone`) |
  | `startDate`, `endDate` | `YYYY-MM-DD` | dates du séjour (62 jours au plus) |

- **Sortie** : `{ "days": WeatherDay[] }`, un élément par date du séjour.

  ```json
  { "days": [
    { "date": "2026-10-06", "available": true, "hours": [
      { "hour": "00:00", "precipitationProbability": 10, "temperature": 12.4, "weatherCode": 3 }
    ] },
    { "date": "2026-10-10", "available": false }
  ] }
  ```

  Les heures sont des heures locales de la destination (fuseau `timezone`),
  à comparer comme des chaînes, jamais à convertir avec `new Date()`. Un jour
  hors de la fenêtre de prévision a `available: false` et pas de `hours`.
  `precipitationProbability` peut être `null` pour une heure non prévue.

- **Cache serveur** : 1 heure (`cacheTtlSec.weather`), clé = position
  arrondie + fuseau (la prévision complète est partagée quelles que soient
  les dates demandées).
- **Erreurs** : codes communs (`502 external_unavailable` si Open-Meteo ne
  répond pas).

### `places` — lieux candidats

Rassemble en parallèle les lieux autour d'une destination. Une source en
échec n'empêche jamais la réponse : son état est indiqué dans `sources`.

- **Méthode** : `POST`
- **Entrée** (corps JSON) :

  | Champ | Type | Description |
  |---|---|---|
  | `lat`, `lon` | nombres | destination |
  | `radiusKm` | nombre, 1 à `places.maxRadiusKm` (50) | rayon de recherche |
  | `countryCode` | chaîne | pays de la destination (pris en charge) |
  | `profile` | `certified` \| `balanced` \| `explorer` | profil du séjour (utilisé par `generate`, phase 4) |
  | `lunch` | `market` \| `restaurant` \| `both` | avec `market`, les restaurants ne sont pas recherchés |
  | `lang` | `fr` \| `en` | langue des noms OSM (`name:<lang>` si présent) |

- **Sortie** :

  ```json
  {
    "places": [Place],
    "appellations": [{ "name": "Beaujolais", "local": false }],
    "sources": [
      { "name": "monuments", "status": "ok" },
      { "name": "museums", "status": "cache" },
      { "name": "osm", "status": "failed", "message": "upstream 429" },
      { "name": "terroir", "status": "ok" }
    ]
  }
  ```

  - `places` : format `Place` (`supabase/functions/_shared/domain/model.js`),
    dédoublonnés (même nom à moins de `places.dedupDistanceM` mètres, le lieu
    certifié l'emporte).
  - `appellations` : AOC/AOP de la commune de destination (`local: true`) et
    des communes voisines (`terroir.neighborRadiusKm`).
  - `sources[].status` : `ok` (réponse fraîche), `cache` (cache partagé, y
    compris une copie expirée resservie après un échec, avec
    `message: "stale"`), `failed` (aucune donnée ; l'application affiche un
    message propre à la source, ex. « Marchés et petit patrimoine
    momentanément indisponibles » pour `osm`).
  - Sources de la France : `monuments` (Mérimée), `museums` (Muséofile),
    `osm` (Overpass, commun à tous les pays), `terroir` (INAO).

- **Cache serveur** : par source, clé = position arrondie + rayon (+ langue
  et type de déjeuner pour `osm`) ; durées `cacheTtlSec.heritage`, `.osm`,
  `.terroir`.
- **Erreurs** : codes communs ; `400 unsupported_country` si `countryCode`
  n'est pas pris en charge.

### Fonctions prévues (à documenter avant d'être codées)

| Fonction | Phase | Rôle |
|---|---|---|
| `fuel-eu-refresh` | 2 bis | mise à jour des prix des carburants (pays européens hors France) |
| `generate` | 4 | génération d'un séjour (délai client 25 s) |
| `delete-account` | 5 bis | suppression du compte et des données |

## Historique

| Version | Date | Changements |
|---|---|---|
| 1 | 2026-09-24 | Version initiale : cadre commun, fonction `config`. |
| 1 | 2026-09-24 | Ajouts compatibles : fonctions `geocode`, `weather`, `places` ; code `400 unsupported_country`. |
