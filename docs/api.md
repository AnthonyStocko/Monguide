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
| 403 | `forbidden` | rôle insuffisant (fonction interne) |
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
    "rules": { "weather": { "rainThresholdPct": 50 }, "…": "…" },
    "contact": "contact@exemple.org"
  }
  ```

  | Champ | Type | Description |
  |---|---|---|
  | `apiVersion` | entier | version courante du contrat côté serveur |
  | `minAppVersion` | chaîne `x.y.z` | version minimale de l'application (`0.0.0` si non définie) |
  | `rules` | objet | règles effectives : valeurs par défaut de `rules.js` fusionnées avec `app_config` |
  | `contact` | chaîne ? | contact de l'équipe (secret `MONGUIDE_CONTACT`), affiché dans l'écran Confidentialité ; `null` si non défini |

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
  | `kind` | `city` \| `address` | commune (défaut) ou adresse précise |
  | `q` | chaîne, 3 à 100 caractères (150 pour une adresse) | texte saisi (recherche) |
  | `lat`, `lon` | nombres | position (recherche inverse, « Utiliser ma position ») |
  | `lang` | `fr` \| `en` | langue des noms (défaut `fr`) |

  L'application n'appelle `geocode` qu'à partir de 3 caractères, après
  300 ms sans frappe (`geocode.minChars`, `geocode.debounceMs`).

- **Sortie** : `{ "results": GeocodeResult[] }`, 10 résultats au plus
  (0 ou 1 en recherche inverse), de TOUS les pays : l'application affiche
  « Cette destination n'est pas encore prise en charge » pour ceux absents de
  `domain/config/countries.js` (leur `timezone` vaut `null`).

  | Champ | Type | Description |
  |---|---|---|
  | `name` | chaîne | nom de la commune |
  | `region` | chaîne ? | département ou région, pour distinguer les homonymes |
  | `country` | chaîne | nom du pays, dans la langue demandée |
  | `countryCode` | chaîne | code ISO 3166-1 alpha-2 (ex. `FR`) |
  | `lat`, `lon` | nombres | position |
  | `timezone` | chaîne | null | fuseau horaire IANA, déterminé par la position (Open-Meteo, `timezone=auto`, cache 30 jours) ; `null` si pays non pris en charge |

- **Adresses précises** (`kind=address`, hébergements) : mêmes paramètres
  `q` ou `lat`/`lon`, plus `biasLat`/`biasLon` facultatifs (favorise les
  adresses proches de la destination, arrondis à 0,1°). Sortie :
  `{ "results": [{ "name"?, "address", "countryCode", "lat", "lon" }] }`
  (`name` : nom du lieu, ex. un hôtel). Recherche inverse : position arrondie
  à ~10 m, sans cache partagé.
- **Cache serveur** : 30 jours (`cacheTtlSec.geocode`), clé = texte
  normalisé + langue (+ biais), ou position arrondie à 0,01° (communes).
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
      { "name": "monuments", "status": "ok", "durationMs": 2100, "query": "SELECT …" },
      { "name": "museums", "status": "ok", "message": "fallback_osm" },
      { "name": "osm", "status": "failed", "message": "upstream 429" },
      { "name": "terroir", "status": "ok" }
    ]
  }
  ```

  - `places` : format `Place` (`supabase/functions/_shared/domain/model.js`),
    dédoublonnés : même identifiant Wikidata (`wikidata`), puis même nom à
    moins de `places.dedupDistanceM` mètres ; le lieu certifié l'emporte.
    `source` indique l'origine : `merimee`, `museofile`, `wikidata`, `osm`.
  - `appellations` : AOC/AOP de la commune de destination (`local: true`) et
    des communes voisines (`terroir.neighborRadiusKm`).
  - `sources[].status` : `ok` (réponse fraîche), `cache` (cache partagé, y
    compris une copie expirée resservie après un échec, avec
    `message: "stale"`), `failed` (aucune donnée ; l'application affiche un
    message propre à la source, ex. « Marchés et petit patrimoine
    momentanément indisponibles » pour `osm`).
  - `sources[].message` : `stale`, `fallback_osm` (Wikidata en échec, lieux
    issus d'OpenStreetMap : à signaler), `no_regional_data` (aucune
    appellation régionale disponible), ou la cause d'un échec.
  - `sources[].durationMs` : durée de l'appel (absente si servi par le
    cache) ; `sources[].query` : requête SPARQL envoyée (Wikidata).
  - France : `monuments` (Mérimée), `museums` (Muséofile), `terroir` (INAO).
    Autres pays : `monuments` et `museums` (Wikidata, repli OpenStreetMap),
    `terroir` (liste vide : eAmbrosia n'indique pas les régions).
    Tous les pays : `osm` (Overpass).
  - L'application attend jusqu'à `api.placesTimeoutMs` (20 s) : Wikidata a
    un délai de 15 s côté serveur.

- **Cache serveur** : par source, clé = position arrondie + rayon (+ langue
  et type de déjeuner pour `osm`) ; durées `cacheTtlSec.heritage`, `.osm`,
  `.terroir`.
- **Erreurs** : codes communs ; `400 unsupported_country` si `countryCode`
  n'est pas pris en charge.

### `holidays` — jours fériés

Source : Nager.Date (`/api/v3/PublicHolidays/{année}/{pays}`), tous les pays.

- **Méthode** : `GET`
- **Entrée** : `countryCode` (pris en charge), `startDate`, `endDate`
  (`YYYY-MM-DD`, 400 jours au plus).
- **Sortie** : `{ "holidays": [{ "date": "2027-08-15", "name": "Assumption Day", "localName": "Ferragosto o Assunzione", "global": true }] }`
  ; `regions` (codes ISO 3166-2) quand `global` vaut `false`.
- **Cache serveur** : 30 jours par pays et année (`cacheTtlSec.holidays`).
- **Erreurs** : codes communs ; `400 unsupported_country`.

### `fuel` — prix des carburants

- **Méthode** : `GET`
- **Entrée** : `lat`, `lon`, `radiusKm`, `countryCode`.
- **Sortie** : `{ "fuel": FuelPrices | null, "source": { "name": "fuel", "status": "ok" | "failed", "message"? } }`

  | Champ de `fuel` | Description |
  |---|---|
  | `currency` | monnaie du pays (ISO 4217) |
  | `prices` | `{ <carburant>: { average, stations? } }`, prix par litre ; carburants `sp95`, `sp98`, `e10`, `e85`, `diesel`, `lpg` |
  | `date` | date des prix (bulletin, relevé) |
  | `source` | origine des prix |
  | `estimate` | `true` : valeur fixe (pays hors UE), à afficher comme « estimation » |

  France : moyenne des stations du rayon (flux instantané). UE : moyenne
  nationale du Bulletin pétrolier, convertie avec les taux BCE. Royaume-Uni,
  Norvège : estimations fixes. Suisse, Liechtenstein, Islande : `fuel: null`.

### `fuel-eu-refresh` — tâche planifiée (interne)

Appelée chaque mercredi à 06:00 UTC par pg_cron + pg_net ; réservée au rôle
`service_role` (`403 forbidden` sinon). `POST`, sans corps. Télécharge le
Bulletin pétrolier et les taux BCE et remplit `fuel_prices_eu`. Sortie :
`{ bulletinDate, exchangeRateDate, countries, rows }`. En cas d'échec,
rien n'est modifié.

### `generate` — génération d'un séjour

- **Méthode** : `POST` ; limite de requêtes du type `generate` (30 par heure).
- **Entrée** : `{ "tripRequest": Trip, "lang": "fr" | "en" }` : séjour issu du
  formulaire (`domain/tripDraft.js`, `buildTrip`), `days` et `candidates`
  vides. Vérifié par `domain/validateTripRequest.js` (`400 invalid_input`
  en listant les champs invalides).
- **Sortie** : `{ "trip": Trip, "warnings": Warning[], "sources": Source[] }`
  - `trip.days` : une journée par date, étapes `culture` (10h00), `lunch`
    (12h30), `outdoor` (14h30), `relax` (17h30) avec `start`/`end`
    ("HH:mm", fuseau du séjour), `travelFromPreviousMin`, `badges`
    (`weather_adapted`, `hours_unconfirmed`, `info_missing`,
    `free_time`), `specialties` (appellations, pause au marché) ;
    `departure` et `returnTravelMin` si un hébergement est connu ;
    `weatherAvailable`, `weather` (`{ "HH": % }`), `holiday`.
  - `trip.candidates` : les 60 meilleurs lieux non utilisés (remplacement et
    recalcul sans réseau).
  - `trip.carbon` : `{ totalKgCo2e, byDay, byMode, distanceKm }` ;
    `trip.fuelCost` : `{ amount, currency }` (voiture, monnaie du pays).
  - `warnings[].code` : `source_failed` (+ `source`), `free_time` (+ `count`),
    `weather_later`, `no_restaurants`, `no_fuel_price`, `no_carbon_factors`.
  - `sources` : état de chaque source (lieux par zone de collecte, météo,
    jours fériés, CO2, carburant).
- **Budget** : collecte limitée à `generation.collectBudgetMs` (16 s) ; au-delà,
  génération avec les sources disponibles (les collectes lentes continuent en
  arrière-plan et remplissent le cache). L'application attend
  `api.generateTimeoutMs` (25 s). Limites Supabase vérifiées le 2026-09-24 :
  150 s de durée, 2 s de temps CPU par requête, 256 Mo.
- **Erreurs** : codes communs ; `400 unsupported_country`.

### Table `trips` — séjours des comptes (accès direct, RLS)

Accès par l'API REST de Supabase (`supabase.from('trips')`), uniquement pour
un utilisateur connecté. RLS : chacun ne lit, ne crée, ne modifie et ne
supprime que ses lignes (`user_id = auth.uid()`, fixé par la base).

| Colonne | Type | Contenu |
|---|---|---|
| `id` | uuid | identifiant du séjour (créé sur l'appareil) |
| `user_id` | uuid | propriétaire (défaut `auth.uid()`, suppression en cascade) |
| `title`, `destination` | text, jsonb | titre, destination |
| `start_date`, `end_date` | date | dates du séjour |
| `params` | jsonb | reste du séjour (`domain/tripRow.js`) |
| `planning` | jsonb | journées (`Trip.days`) |
| `created_at`, `updated_at` | timestamptz | horodatages de l'appareil ; conflit : le plus récent l'emporte |
| `deleted` | boolean | suppression logique, propagée aux autres appareils |

Synchronisation (`src/services/sync.js`) : lecture des lignes
`updated_at > dernière synchronisation`, puis `upsert` des séjours modifiés
localement.

Un séjour supprimé est envoyé comme marqueur sans contenu (`title` vide,
`destination`, `params` et `planning` vides, `deleted = true`). La tâche
pg_cron `monguide-purge-deleted-trips` efface les marqueurs de plus de
90 jours (`rules.sync.deletedRetentionDays`).

### `delete-account` — suppression du compte

- **Méthode** : `POST`, sans corps ; utilisateur connecté uniquement
  (`401 unauthorized` en mode invité).
- **Sortie** : `{ "deleted": true }`. Le compte est supprimé ; ses séjours
  le sont en cascade.
- **Erreurs** : codes communs ; `500 internal_error` si la suppression échoue.

### Fonctions prévues (à documenter avant d'être codées)

| Fonction | Phase | Rôle |
|---|---|---|

## Historique

| Version | Date | Changements |
|---|---|---|
| 1 | 2026-09-24 | Version initiale : cadre commun, fonction `config`. |
| 1 | 2026-09-24 | Ajouts compatibles : fonctions `geocode`, `weather`, `places` ; code `400 unsupported_country`. |
| 1 | 2026-09-24 | Ajout compatible : `geocode?kind=address` (adresses précises des hébergements). |
| 1 | 2026-09-24 | Ajout compatible : fonction `generate`. |
| 1 | 2026-09-24 | Ajouts compatibles : table `trips` (RLS), fonction `delete-account`, champ `contact` de `config`. |
| 1 | 2026-09-24 | Ajouts compatibles : `geocode` renvoie tous les pays (`timezone` null hors liste) ; `places` : sources avec `durationMs`, `query`, message `fallback_osm` ; fonctions `holidays`, `fuel`, `fuel-eu-refresh` ; code `403 forbidden`. |
