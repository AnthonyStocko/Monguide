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
| `invites` | `trip-invite-link`, `trip-invite-email`, `trip-join`, `trip-invites-claim` | `rateLimits.invitesPerWindow` = 60 |
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
(iOS, plus tard), `http://localhost:5173` (développement),
`https://anthonystocko.github.io` (pages web publiques : suppression de
compte depuis un navigateur, qui appelle `config` et `delete-account` avec
les mêmes en-têtes de version que l'application). En-tête exposé :
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
    "minSharedSchemaVersion": 3,
    "rules": { "weather": { "rainThresholdPct": 50 }, "…": "…" },
    "contact": "contact@exemple.org",
    "osm": { "source": "tiles", "dataDate": "2026-09-28", "countries": { "BE": "2026-09-28", "FR": "2026-09-24" } }
  }
  ```

  | Champ | Type | Description |
  |---|---|---|
  | `apiVersion` | entier | version courante du contrat côté serveur |
  | `minAppVersion` | chaîne `x.y.z` | version minimale de l'application (`0.0.0` si non définie) |
  | `minSharedSchemaVersion` | entier | version de schéma des séjours nécessaire pour modifier un séjour partagé (clé `min_shared_schema_version` de `app_config` ; 1 si non définie) |
  | `rules` | objet | règles effectives : valeurs par défaut de `rules.js` fusionnées avec `app_config` |
  | `contact` | chaîne ? | contact de l'équipe (secret `MONGUIDE_CONTACT`) ; `null` si non défini. Conservé pour les versions antérieures et les pages GitHub Pages (`site/`) : l'application lit désormais `rules.public.contactEmail` |
  | `osm` | objet | source des lieux OSM (`tiles`, `overpass`, `off`) et `dataDate` (`YYYY-MM-DD`) de la version des tuiles en service, `null` si inconnue ; `countries` : date des données de chaque pays importé (`null` hors mode tuiles ou manifeste illisible) ; affichés dans « À propos et sources » (par pays) et sur `/debug` |

- **Cache serveur** : 5 minutes (`cacheTtlSec.config`), invalidé dès qu'une
  ligne de `app_config` change ; contient aussi le pointeur des tuiles OSM
  en service, dont `places` et `generate` tirent la date des données.
- **Erreurs** : codes communs uniquement.

#### Surcharger une règle (`app_config`)

Depuis le tableau de bord (Table Editor) ou en SQL :

```sql
insert into public.app_config (key, value) values ('weather.rainThresholdPct', '60')
on conflict (key) do update set value = excluded.value;

insert into public.app_config (key, value) values ('minAppVersion', '"0.2.0"')
on conflict (key) do update set value = excluded.value;
```

Adresses publiques et contact (rubrique `public` de `rules.js` :
`webApp`, `playStore`, `presentation`, `privacy`, `legal`,
`accountDeletion`, `contactEmail`), pris en compte au prochain lancement de
l'application :

```sql
insert into public.app_config (key, value) values ('public.contactEmail', '"contact@exemple.org"')
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
  | `categories` | tableau de catégories `Place` (sauf `personal`), facultatif | « Plus de résultats » : seulement ces catégories ; avec `restaurant`, les restaurants sont cherchés quel que soit `lunch` |
  | `offset` | entier ≥ 0, facultatif | « Plus de résultats » : rang du premier lieu de la page |

  `categories` et `offset` sont facultatifs et rétrocompatibles (même
  version du contrat) : sans eux, la réponse est inchangée (tous les lieux).
  Avec l'un d'eux, `places` est une page de `places.pageSize` (20) lieux,
  du plus proche au plus éloigné de la position arrondie (puis par
  identifiant : ordre stable d'une page à l'autre), et la sortie contient en
  plus `total` (lieux correspondants) et `nextOffset` (`offset` de la page
  suivante, `null` à la dernière). L'application ajoute chaque page à sa
  liste sans doublon (même `id`, `mergePlaces` de `domain/listCandidates.js`).

- **Sortie** :

  ```json
  {
    "places": [Place],
    "appellations": [{ "name": "Beaujolais", "local": false }],
    "sources": [
      { "name": "monuments", "status": "ok", "durationMs": 2100, "query": "SELECT …" },
      { "name": "museums", "status": "ok", "message": "fallback_osm" },
      { "name": "osm", "status": "ok", "durationMs": 180, "source": "tiles", "dataDate": "2026-09-24", "tilesRead": 4 },
      { "name": "terroir", "status": "ok" }
    ]
  }
  ```

  - `places` : format `Place` (`supabase/functions/_shared/domain/model.js`),
    dédoublonnés : même identifiant Wikidata (`wikidata`), puis même nom à
    moins de `places.dedupDistanceM` mètres ; le lieu certifié l'emporte.
    `source` indique l'origine : `merimee`, `museofile`, `wikidata`, `osm`.
    France : les monuments Mérimée et les musées Muséofile reçoivent leur
    `wikidata` par leur référence (propriétés P380 et P539, une requête
    SPARQL groupée, mise en cache 30 jours par zone ; un échec laisse les
    lieux sans identifiant, sans erreur). Un doublon écarté transmet son
    `wikidata` au lieu gardé qui n'en a pas.
  - `appellations` : AOC/AOP de la commune de destination (`local: true`) et
    des communes voisines (`terroir.neighborRadiusKm`).
  - `sources[].status` : `ok` (réponse fraîche), `cache` (cache partagé, y
    compris une copie expirée resservie après un échec, avec
    `message: "stale"`), `partial` (`osm` en mode tuiles : la zone touche un
    pays pris en charge dont les lieux ne sont pas encore importés ; lieux
    des pays importés seulement, `message: "partial"`), `failed` (aucune
    donnée ; l'application affiche un message propre à la source, ex.
    « Marchés et petit patrimoine momentanément indisponibles » pour `osm`).
  - `sources[].message` : `stale`, `fallback_osm` (Wikidata en échec, lieux
    issus d'OpenStreetMap : à signaler), `no_regional_data` (aucune
    appellation régionale disponible), `not_covered` (`osm` : pays dont les
    lieux OSM ne sont pas encore importés, sans aucun pays importé dans la
    zone ; l'application affiche « Lieux locaux non disponibles pour ce
    pays »), `partial` (voir `status`), `disabled` (`osm` avec
    `osm.source = "off"`), ou la cause d'un échec.
  - `sources[].durationMs` : durée de l'appel (absente si servi par le
    cache, sauf `osm` en mode tuiles, où elle compte aussi la lecture du
    cache et de la version en service) ; `sources[].query` : requête SPARQL
    envoyée (Wikidata).
  - `osm` uniquement : `source` (`tiles`, `overpass` ou `off`, réglage
    `osm.source` de `app_config`) ; en mode tuiles, `dataDate` (date des
    données OpenStreetMap de la version en service) et `tilesRead` (tuiles
    lues, 0 si la réponse vient d'un cache) et `timings` (millisecondes
    écoulées à la fin de chaque étape : `lookup` cache partagé, `index`
    manifeste, `tiles` lecture des tuiles ; diagnostic). Les tuiles de tous
    les pays importés qui touchent la zone sont lues, quel que soit le pays
    de la destination, un seul exemplaire par identifiant OSM : `dataDates`
    donne la date des données de chaque pays lu (`{ "BE": "2026-09-28",
    "FR": "2026-09-24" }`) et `tilesByCountry` le nombre de tuiles lues par
    pays (absent si la réponse vient d'un cache ; affichés sur `/debug`) ; `missingCountries` (avec `partial`, et avec une
    copie expirée du cache) liste les pays pris en charge touchés mais pas
    encore importés (contours approximatifs des extraits Geofabrik) ;
    l'application affiche « Les lieux situés en Allemagne ne sont pas encore
    disponibles ».
  - France : `monuments` (Mérimée), `museums` (Muséofile), `terroir` (INAO).
    Autres pays : `monuments` et `museums` (Wikidata, repli OpenStreetMap),
    `terroir` (liste vide : eAmbrosia n'indique pas les régions).
    Tous les pays : `osm`, tuiles statiques par défaut (`docs/osm-tiles.md`),
    Overpass avec `osm.source = "overpass"` ; le repli OpenStreetMap du
    patrimoine suit le même réglage (aucun repli avec `"off"`).
  - Lieux OSM sans nom : gardés seulement pour `osm.unnamedTypes` (points
    de vue, lavoirs, ruines), avec un nom générique traduit (« Point de
    vue ») et `unnamed: true` (score plus bas à la génération).
  - Noms des lieux OSM : `name` est le nom OSM tel quel (éventuellement
    bilingue, « Grand-Place - Grote Markt ») ; `names` (facultatif) donne
    les variantes par langue qui en diffèrent (`{ "fr": "Grand-Place",
    "nl": "Grote Markt" }`). L'application affiche la variante de la langue
    de l'interface, sinon `name` ; un `name` en alphabet non latin est
    remplacé par `names.en`, à défaut translittéré du grec (ELOT 743,
    `domain/translitGreek.js`) (`domain/displayName.js`) ; un séjour
    enregistré ne change pas, seul l'affichage suit la langue.
  - L'application attend jusqu'à `api.placesTimeoutMs` (20 s) : Wikidata a
    un délai de 15 s côté serveur.

- **Cache serveur** : par source, clé = position arrondie + rayon (+ langue
  et type de déjeuner pour `osm`, + date des données en mode tuiles : un
  nouvel import invalide le cache) ; durées `cacheTtlSec.heritage`, `.osm`,
  `.terroir`. En mode tuiles, chaque instance de fonction garde aussi en
  mémoire la version en service (relue toutes les heures) et les tuiles
  lues (`osm.tiles.memoryCacheMb`).
- **Erreurs** : codes communs ; `400 unsupported_country` si `countryCode`
  n'est pas pris en charge.

### `images` — photos des lieux (Wikimedia Commons)

Photo principale (propriété Wikidata P18) de lieux et de la destination,
avec son crédit. Seules les licences libres compatibles sont retenues :
domaine public, CC0, CC BY et CC BY-SA (toutes versions et adaptations
nationales). Autre licence, licence absente, ou CC BY sans auteur connu :
pas d'image. La génération n'appelle jamais cette fonction (budget de
20 s) : l'application l'appelle après avoir reçu le séjour.

- **Méthode** : `POST`
- **Entrée** (corps JSON) :

  | Champ | Type | Description |
  |---|---|---|
  | `wikidataIds` | tableau de `Q…`, 30 au plus (`images.maxIds`), doublons ignorés | lieux dont on veut la photo (`Place.wikidata`) |
  | `width` | `400` \| `800` | largeur d'affichage visée, en pixels |
  | `destination` | objet facultatif `{ name, countryCode, lat, lon }` | ville de destination dont on veut l'identifiant Wikidata et la photo (voir ci-dessous) |

  `wikidataIds` peut être vide si `destination` est fourni.

- **Sortie** :

  ```json
  {
    "images": {
      "Q2983916": {
        "thumbUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Katedra_w_Villefranche_-_panoramio.jpg/500px-Katedra_w_Villefranche_-_panoramio.jpg",
        "width": 500,
        "height": 666,
        "credit": {
          "author": "Andrzej Harassek",
          "license": "CC BY-SA 3.0",
          "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
          "sourceUrl": "https://commons.wikimedia.org/wiki/File:Katedra_w_Villefranche_-_panoramio.jpg"
        }
      },
      "Q42": null
    },
    "destination": { "wikidata": "Q208770" }
  }
  ```

  - `images[qid]` : format `PlaceImage` (`model.js`), ou `null` = pas
    d'image utilisable (pas de P18, licence refusée, fichier introuvable).
    Un identifiant **absent** de `images` n'a pas pu être vérifié (Wikidata
    ou Commons indisponible) : l'application redemandera plus tard.
  - `thumbUrl` : toujours sur `https://upload.wikimedia.org/` (seul domaine
    d'images que l'application charge directement), sans paramètre. Commons
    ne sert plus que des largeurs standard : le fichier fait au moins la
    largeur demandée (500 px pour 400, 960 px pour 800), sauf si l'original
    est plus petit (l'original est alors renvoyé). `width` et `height` sont
    les dimensions réelles du fichier.
  - `credit.author` : texte seul (le HTML des métadonnées Commons est
    retiré), 120 caractères au plus ; absent si inconnu (domaine public ou
    CC0 uniquement). `credit.licenseUrl` : absent pour le domaine public.
  - `destination` (si demandé) : `wikidata` = identifiant de la ville, ou
    `null` si aucun élément ne correspond. Photon ne fournit pas
    l'identifiant Wikidata des communes (vérifié le 2026-09-29) : le serveur
    le cherche par nom (`wbsearchentities`, en français puis en anglais),
    en gardant le premier résultat, dans l'ordre de pertinence, situé à
    moins de `images.cityMaxDistanceKm` (15 km) de la destination (position
    lue par `prop=coordinates`). Sa photo figure dans `images` sous cet
    identifiant. Wikidata indisponible : `destination` est omis.

- **Sources** : API Wikidata (fichier P18 lu dans `pageprops.page_image_free`,
  `wbsearchentities`, `prop=coordinates`) et API
  Commons (`prop=imageinfo`, `iiprop=url|size|extmetadata`), requêtes
  groupées (50 identifiants ou fichiers au plus par appel), User-Agent
  Mon guide et `Api-User-Agent` (politique User-Agent de Wikimedia).
- **Cache serveur** : `cacheTtlSec.images` (30 jours) par identifiant et
  par largeur, y compris les `null` (pas redemandés pendant 30 jours) ;
  recherche de la ville : même durée, clé nom + pays + position arrondie.
- **Erreurs** : codes communs. Wikidata ou Commons indisponible : pas
  d'erreur, les identifiants non vérifiés sont omis.

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
- **Entrée** : `{ "tripRequest": Trip, "lang": "fr" | "en", "review"?: { "consent": boolean } }` : séjour issu du
  formulaire (`domain/tripDraft.js`, `buildTrip`), `days` et `candidates`
  vides. Vérifié par `domain/validateTripRequest.js` (`400 invalid_input`
  en listant les champs invalides). `dinner` (`restaurant` | `free`) est
  facultatif : absent (application antérieure), aucun dîner n'est généré.
- **Sortie** : `{ "trip": Trip, "warnings": Warning[], "sources": Source[] }`
  - `trip.days` : une journée par date, étapes `culture` (10h00), `lunch`
    (12h30), `outdoor` (14h30), `relax` (17h30), puis `dinner` (19h30).
    Horaires du pays de la destination (`config/mealTimes.js`) : Espagne,
    déjeuner à 14h00 (plage 13h30-14h30, 1 h 15), `relax` à 18h30, dîner à
    21h00 (jamais avant 20h30) ; Grèce, déjeuner à 14h00 et dîner à 21h00 ;
    Portugal et Italie, dîner à 20h00. Un déjeuner plus tardif décale
    d'autant `outdoor`. Un lieu aux horaires connus n'est proposé que s'il
    est ouvert pendant tout son créneau (jamais pendant une fermeture de
    mi-journée). Étapes avec `start`/`end`
    ("HH:mm", fuseau du séjour), `travelFromPreviousMin`, `badges`
    (`weather_adapted`, `hours_unconfirmed`, `info_missing`,
    `free_time`), `specialties` (appellations, pause au marché) ; dîner :
    restaurant ouvert sur toute la plage du dîner (90 min), jamais déjà
    proposé dans le séjour, près de la dernière étape et de l'hébergement du
    soir ; sans lieu = « Soirée libre » (`dinner: "free"`, sans badge ; ou
    aucun restaurant trouvé, badge `free_time`) ;
    `departure` et `returnTravelMin` si un hébergement est connu ;
    `weatherAvailable`, `weather` (`{ "HH": % }`), `holiday`.
  - `trip.candidates` : les 100 meilleurs lieux non utilisés
    (`places.maxCandidates` ; remplacement, recalcul et listes de lieux sans
    réseau), dont, s'il en existe, au moins 8 lieux de chaque type proposé
    (`places.minPerType`, types de `config/activityTypes.js`, quel que soit
    le profil) et au moins 10 restaurants ouverts le soir
    (`places.minDinnerCandidates`) quand le séjour a un dîner.
  - `trip.carbon` : `{ totalKgCo2e, byDay, byMode, distanceKm }` ;
    `trip.fuelCost` : `{ amount, currency }` (voiture, monnaie du pays).
  - `warnings[].code` : `source_failed` (+ `source`, une fois par source ;
    + `message: "not_covered"` pour `osm` dans un pays pas encore importé),
    `places_partial` (+ `countries` : pays pris en charge touchés par une
    zone de collecte mais pas encore importés ; le séjour est généré avec
    les lieux des autres pays),
    `free_time` (+ `count`),
    `weather_later`, `no_restaurants`, `no_fuel_price`, `no_carbon_factors`.
  - `sources` : état de chaque source (lieux par zone de collecte, météo,
    jours fériés, CO2, carburant).
- **Budget** : collecte limitée à `generation.collectBudgetMs` (16 s) ; au-delà,
  génération avec les sources disponibles (les collectes lentes continuent en
  arrière-plan et remplissent le cache). L'application attend
  `api.generateTimeoutMs` (35 s : collecte, planning, puis relecture par une IA de 8 s au plus). Limites Supabase vérifiées le 2026-09-24 :
  150 s de durée, 2 s de temps CPU par requête, 256 Mo.
- **Progression en flux** (écran « Préparation du séjour ») : avec l'en-tête
  `Accept: application/x-ndjson`, la réponse `200` est un flux NDJSON
  (`Content-Type: application/x-ndjson`), un objet JSON par ligne, envoyé
  au moment où l'événement réel se produit (fin d'une source, jamais une
  minuterie) :

  ```
  {"event":"start","steps":["weather","heritage","places","restaurants","planning"]}
  {"event":"step","step":"weather","status":"running"}
  {"event":"step","step":"heritage","status":"running"}
  …
  {"event":"step","step":"places","status":"done"}
  {"event":"step","step":"heritage","status":"failed","message":"timeout"}
  {"event":"step","step":"planning","status":"running"}
  {"event":"step","step":"planning","status":"done"}
  {"event":"review"}
  {"event":"review_done","status":"applied"}
  {"event":"result","trip":Trip,"warnings":[…],"sources":[…]}
  ```

  - Étapes : `weather` (prévisions), `heritage` (monuments et musées),
    `places` (lieux OpenStreetMap : marchés, nature, petit patrimoine),
    `restaurants` (restaurants OpenStreetMap, lus dans la même source que
    `places` : absente avec `lunch: "market"` sans `dinner: "restaurant"`), `planning` (organisation des
    journées). Les sources partent en parallèle : toutes les étapes de
    collecte sont `running` dès le début. Plusieurs zones de collecte : une
    étape est finie quand toutes ses zones ont répondu, `failed` si toutes
    ont échoué ; budget épuisé : `failed` avec `message: "timeout"` (ou
    `done` si une zone a répondu).
  - Relecture par une IA (docs/ai-review.md) : `review` quand elle est tentée
    (champ `review.consent` à `true`, `ai.enabled`, au moins une étape
    modifiable), puis `review_done` avec le statut (`applied`, `unchanged`
    ou `skipped`) ; absents sinon. « Vos envies » : `tripRequest.params.wishes`
    (facultatif, texte de `ai.wishesMaxLength` = 200 caractères au plus
    après nettoyage, sinon `400 invalid_input` sur `params.wishes`).
    Le séjour renvoyé porte `trip.review` (statut, raison d'un échec,
    opérations appliquées et refusées, titres des jours, résumé) ; un échec
    de la relecture n'est jamais une erreur de `generate`.
  - Dernière ligne : `{"event":"result", …}` (même contenu que la sortie
    JSON), ou `{"event":"error","error":{"code","message"}}` si la génération
    échoue après le début du flux. Les erreurs d'entrée, de version ou de
    limite de requêtes restent des réponses JSON d'erreur ordinaires.
  - Sans cet en-tête : réponse JSON unique (compatibilité). L'application lit
    le flux avec `fetch` (`supabase.functions.invoke` ne le permet pas) ; si
    la réponse arrive en JSON ou d'un seul bloc (flux indisponible ou mis en
    mémoire tampon par un intermédiaire), elle affiche une progression
    indéterminée, sans étapes cochées.
- **Erreurs** : codes communs ; `400 unsupported_country`.

### Table `trips` — séjours des comptes (accès direct, RLS)

Accès par l'API REST de Supabase (`supabase.from('trips')`), uniquement pour
un utilisateur connecté. RLS (migration `20261016100000_shared_trips.sql`) :
lecture par les participants du séjour (`trip_members`), suppression par
l'owner seulement. Écriture directe (création, `upsert`) : ancien chemin
gardé jusqu'au Bloc B du Prompt 8.0, réservé à l'owner d'un séjour **non
partagé** ; un séjour partagé n'est jamais modifiable directement.

| Colonne | Type | Contenu |
|---|---|---|
| `id` | uuid | identifiant du séjour (créé sur l'appareil) |
| `user_id` | uuid | owner (défaut `auth.uid()` ; suit la ligne owner de `trip_members`) |
| `title`, `destination` | text, jsonb | titre, destination |
| `start_date`, `end_date` | date | dates du séjour |
| `params` | jsonb | reste du séjour (`domain/tripRow.js`) |
| `planning` | jsonb | journées (`Trip.days`) |
| `created_at`, `updated_at` | timestamptz | horodatages de l'appareil ; conflit : le plus récent l'emporte |
| `deleted` | boolean | suppression logique, propagée aux autres appareils |
| `version` | integer | 1 à la création, +1 à chaque modification ; fixé par la base, jamais par l'appareil |

Journées (`planning[]`) et étapes : identifiant `id` stable (UUID).
Journée générée ou migrée (schemaVersion 3) : UUID version 5 de
`day:<séjour>:<date>` (`domain/stableId.js`, même calcul que la migration SQL).

Synchronisation (`src/services/sync.js`) : lecture de `id, version, deleted`
de chaque séjour accessible, puis des lignes complètes des séjours plus
récents que la copie de l'appareil ; envoi des modifications par
`trip-apply-ops` (opérations, jamais le séjour entier). L'ancien `upsert`
direct (applications publiées avant le Bloc B) reste accepté pour l'owner
d'un séjour non partagé, jusqu'à ce que `minAppVersion` l'exclue.

Un séjour supprimé est enregistré comme marqueur sans contenu (`title` vide,
`destination`, `params` et `planning` vides, `deleted = true`). La tâche
pg_cron `monguide-purge-deleted-trips` efface les marqueurs de plus de
90 jours (`rules.sync.deletedRetentionDays`).

### Séjours partagés — tables (Prompt 8.0, Bloc A)

Aucune écriture depuis le client sauf indication : les fonctions serveur
(Bloc B) écrivent. RLS activée sur toutes ; aucun accès `anon`.

| Table | Contenu | Accès du client |
|---|---|---|
| `profiles` | `user_id`, `display_name` (1 à 40 caractères), `avatar_color` (nom de couleur de la palette), `updated_at` | lit, crée et modifie le sien ; lit ceux des personnes avec qui il partage un séjour |
| `trip_members` | `trip_id`, `user_id`, `role` (`owner` \| `editor`), `joined_at`, `last_seen_version` ; un owner, 10 participants au plus | lecture entre participants ; suppression de sa ligne (quitter) ou par l'owner (retirer), jamais de la ligne owner ; mise à jour de son seul `last_seen_version` |
| `trip_invites` | `kind` (`link` \| `email`), `token_hash` (SHA-256 hexadécimal, jamais le jeton), `email_normalized`, `created_by`, `expires_at` (7 jours), `revoked_at`, `uses` | owner : lecture, et désactivation (`revoked_at`, définitive) |
| `trip_changes` | `version`, `author_id` (NULL : « Ancien participant »), `op_type`, `summary` (280 caractères au plus), `step_ids` (étapes touchées), `summary_count` (modifications résumées) ; 200 dernières par séjour (pg_cron `monguide-purge-trip-changes`) ; publiée dans Supabase Realtime | lecture par les participants, y compris en direct |

Fonctions utilisées par les politiques : `is_trip_member(trip_id)`,
`is_trip_owner(trip_id)`, `is_trip_shared(trip_id)` (false pour un
non-participant), `shares_trip_with(user_id)` ; elles ne renseignent que sur
l'utilisateur appelant. Tests : `supabase/tests/database/shared_trips.test.sql`
(pgTAP, job `db-tests` du workflow de déploiement du serveur).

### `trip-apply-ops` — modifications d'un séjour par opérations

Seul chemin d'écriture des séjours pour l'application (Prompt 8.0, Bloc B).

- **Méthode** : `POST`, utilisateur connecté et participant du séjour
  (`401 unauthorized` en mode invité). Limite : 120 appels par minute et par
  utilisateur (`rules.rateLimits.tripOpsPerMinute`, `429 rate_limited`).
- **Entrée** : `{ "tripId": uuid, "baseVersion": entier, "schemaVersion"?: entier, "ops": [{ "opId": uuid, "type", "params" }] }`,
  1 à 50 opérations, `opId` créé par l'appareil et unique. `baseVersion` :
  version de la copie de l'appareil (information ; les opérations sont
  toujours appliquées sur la dernière version).
- **Traitement** : lecture de la dernière version, application des
  opérations (`domain/ops/applyOps.js`, même code que l'appareil), trajets et
  conflits recalculés sur les journées touchées, puis `trip_commit` : dans
  une transaction, verrou de la ligne, vérification que la version n'a pas
  changé depuis la lecture (sinon tout est relu et réappliqué, 5 fois au
  plus, puis `409 conflict`), écriture, version + 1, une ligne dans
  `trip_changes` (résumés en français), opérations enregistrées dans
  `trip_applied_ops` (30 jours). Une opération déjà appliquée (même `opId`)
  est ignorée sans erreur.
- **Sortie** : `{ "version", "trip", "rejected": [{ "opId", "code" }], "warnings": { "<dayId>": { "<stepId>": [{ "code", … }] } } }`.
  `trip` : séjour complet après application (`version` comprise).
  `warnings` : vérifications habituelles (`checkDay`) des journées
  recalculées, jamais bloquantes.
- **Refus d'une opération** (les autres du lot sont appliquées) :
  `TARGET_GONE` (étape, journée ou hébergement supprimé entre-temps),
  `FORBIDDEN` (réservée à l'owner : `renameTrip`, `deleteTrip`),
  `SHARED_TRIP` (`switchReview` dans un séjour à plusieurs participants),
  `EXISTS` (`createTrip` d'un séjour existant, `addStep` d'une étape déjà
  présente), `TRIP_DELETED`, `INVALID` (forme).
- **Erreurs** : codes communs ; `400 invalid_input` (lot mal formé) ;
  `404 trip_not_found` (séjour inconnu ou utilisateur non participant :
  réponse identique) ; `409 shared_schema_outdated` : séjour partagé et
  `schemaVersion` (version de schéma connue de l'application, 1 si absente)
  inférieure à la clé `min_shared_schema_version` de `app_config` ; rien
  n'est appliqué, l'application garde ses opérations jusqu'à sa mise à jour.
- **Refus `TARGET_GONE` d'une étape** : champ `by`, prénom de qui l'a
  supprimée (dernière ligne de `trip_changes` qui la touche ; null si inconnu).

| Opération | Paramètres | Effet |
|---|---|---|
| `createTrip` | `trip` | crée le séjour (première opération du lot, séjour inconnu du serveur) ; l'appelant devient owner |
| `deleteTrip` | — | owner : marqueur de suppression |
| `renameTrip` | `title` (100 caractères au plus) | owner : nouveau titre |
| `addStep` | `dayId`, `step`, `afterStepId` (null : en tête) | ajoute une étape ; `afterStepId` disparu : place selon l'heure de début |
| `removeStep` | `stepId` | supprime une étape |
| `moveStep` | `stepId`, `toDayId`, `afterStepId`, `start`, `end`, `customTime?` | déplace (autre position, autre horaire ou autre journée) |
| `setStepTime` | `stepId`, `start`, `end`, `customTime?` | horaire (« HH:mm », à cheval sur minuit accepté) |
| `replaceStep` | `stepId`, `place` (null : sans lieu, « Soirée libre » pour un dîner) | autre lieu : remplacement, suggestion météo acceptée, choix du restaurant du dîner |
| `setStepDone` | `stepId`, `status` (`planned` \| `done` \| `skipped`), `completedAt?` (heure de la destination) | étape validée, passée ou remise à faire (partagé entre participants) |
| `updateStep` | `stepId`, `set?`, `unset?` | autres champs : `type`, `title`, `note`, `indoor`, `badges`, `conflicts`, `customTime`, `locked`, `specialties`, `category`, `source` |
| `setDayWeather` | `dayId`, `weatherAvailable`, `weather` | prévisions du jour |
| `setDayLodging` | `dayId`, `startLodgingId`, `endLodgingId` | hébergements de départ et d'arrivée du jour |
| `setLodging` | `lodging` | ajoute ou modifie un hébergement |
| `removeLodging` | `lodgingId` | supprime un hébergement |
| `updateCandidates` | `add?`, `remove?`, `update?` | réserve de lieux |
| `setImages` | `images` (`placeId` -> photo ou null), `hero?`, `destinationWikidata?` | photos Wikimedia Commons |
| `switchReview` | `to` (`original` \| `reviewed`) | version d'origine ou relue de la relecture IA (séjour à un seul participant) |

L'application produit ces opérations par différence entre le séjour avant
et après l'action (`domain/ops/diffTrips.js`) : chaque action de l'écran
(réajustement, report, « Annuler »…) devient une suite d'opérations
atomiques sur des identifiants.

### Inviter et rejoindre (Prompt 8.0, Bloc C)

Utilisateur connecté uniquement (`401 unauthorized` sinon). Adresse des liens
lue dans `app_config`, clé réservée `web_url` (JSON `"https://…"`, sans
barre finale) ; absente : `503 not_configured`.

#### `trip-invite-link` — lien d'invitation

- **Entrée** : `{ "tripId" }`. Owner seulement (`403 forbidden` ; non-participant : `404 trip_not_found`).
- **Sortie** : `{ "inviteId", "url": "<web_url>/rejoindre/<jeton>", "expiresAt" }`.
  Jeton : 32 octets aléatoires en base64url ; seule son empreinte SHA-256
  (hexadécimal) est enregistrée (`trip_invites.token_hash`) : l'adresse
  n'existe en clair que dans cette réponse. Valable 7 jours, utilisable par
  plusieurs personnes ; le lien actif précédent est désactivé.

#### `trip-invite-email` — invitation réservée à une adresse

- **Entrée** : `{ "tripId", "email" }`. Owner seulement. Adresse normalisée
  (minuscules, espaces retirés) ; invalide : `400 invalid_input`.
- **Sortie** : toujours `{ "status": "recorded" }`, que l'adresse ait un
  compte ou non. Invitation valable 30 jours (renouvelée si elle existe déjà).
  Aucun e-mail n'est envoyé. Limite : 20 invitations par jour et par
  utilisateur (`429 invite_limit`).
- **Conservation** : l'invitation (et l'adresse) est effacée dans l'heure
  qui suit son rattachement, sa désactivation ou son expiration, soit
  30 jours au plus (`purge_trip_invites`, migration
  `20261016200000_invite_purge.sql`). Un lien expiré ou désactivé est
  effacé 30 jours plus tard.

#### `trip-invites-claim` — rattachement à l'ouverture

- **Entrée** : `{}` ; appelée par l'application au lancement et à chaque connexion.
- **Sortie** : `{ "added": [{ "tripId", "title", "ownerName" }] }` : séjours
  dont une invitation e-mail visait l'adresse confirmée du compte (compte
  existant ou créé depuis) ; l'utilisateur y est maintenant editor. Une
  invitation n'est rattachée qu'une fois ; séjour complet : elle reste en attente.

#### `trip-join` — rejoindre par lien

- **Entrée** : `{ "token", "preview"?: true }`.
- **Sortie** : aperçu (`preview`) `{ "tripId", "title", "destination", "startDate", "endDate", "ownerName", "memberCount", "alreadyMember", "full" }` ;
  sinon `{ "tripId", "joined" }` (`joined: false` : déjà participant, sans effet).
  Ajout : `trip_add_editor` (verrou du séjour, plafond de 10, historique
  « a rejoint le séjour »).
- **Erreurs** : `404 invite_invalid` (jeton inconnu, modifié ou séjour
  supprimé), `410 invite_revoked`, `410 invite_expired`, `409 trip_full`.

Quitter (editor) et retirer (owner) : suppression directe de la ligne
`trip_members` (RLS). La personne perd l'accès tout de suite ; le séjour
disparaît de ses appareils à la synchronisation suivante.

### Modifications en direct (Prompt 8.0, Bloc D)

- **Temps réel** : pendant qu'un séjour partagé est affiché, l'application
  s'abonne aux insertions dans `trip_changes` filtrées sur `trip_id`
  (Supabase Realtime, `postgres_changes`). Realtime applique la RLS de la
  table : un non-participant ne reçoit rien. Une ligne de version
  supérieure à la copie de l'appareil : le séjour est relu (`trips`),
  les opérations encore en file réappliquées. Désabonnement en quittant
  l'écran et en arrière-plan ; au retour, dernière version relue.
- **Dernière visite** : `trip_members.last_seen_version`, mis à jour par
  l'utilisateur à l'ouverture et à chaque modification reçue ; bandeau
  « N modifications depuis votre dernière visite » (lignes de
  `trip_changes` des autres participants, de version supérieure).
- **Rappels** : jamais partagés ; chaque appareil reprogramme les siens à
  chaque modification reçue (Android : notifications locales ; web :
  `push-schedule`).
- **Notification web** « Paul a modifié votre séjour » : appareils web
  dont l'abonnement a `notify_trip_changes` (réglage, désactivé par
  défaut ; `push-subscribe`, champ `tripChanges`) ; mise en file par
  `trip-apply-ops` après chaque modification résumée d'un séjour partagé
  (`trip_queue_change_pushes`, au plus une par heure, par séjour et par
  appareil ; envoi par `push-send`). Aucune notification sur Android dans
  cette version.

### Sans réseau (Prompt 8.0, Bloc E)

- **File** : hors ligne, chaque modification est appliquée tout de suite à
  la copie de l'appareil et ses opérations (avec leur `opId`) sont gardées
  dans IndexedDB (`tripq:<séjour>`, également dans la WebView Android).
  Au retour du réseau : envoi dans l'ordre à `trip-apply-ops`, puis la
  version du serveur remplace la copie (opérations restantes réappliquées).
  Le nom de l'étape visée reste avec l'opération en file (`label`, jamais
  envoyé) pour les messages.
- **Messages** (gardés sur l'appareil jusqu'à leur fermeture,
  `src/services/syncNotices.js`) : modification refusée (`TARGET_GONE`, avec
  qui a supprimé l'étape), séjour devenu inaccessible (file abandonnée,
  séjour retiré de l'appareil), séjour supprimé par son owner, application
  trop ancienne (`shared_schema_outdated`).
- **Versions** : un séjour d'une `schemaVersion` plus récente que
  l'application n'est pas affiché (« Mettez à jour Mon guide pour voir ce
  séjour », lien Google Play). `config` renvoie `minSharedSchemaVersion`
  (clé réservée `min_shared_schema_version` de `app_config`, 3 à la
  migration `20261016180000_shared_schema.sql`) : en dessous, un séjour
  partagé est en consultation seule.

### `delete-account` — suppression du compte

- **Méthode** : `POST`, sans corps ; utilisateur connecté uniquement
  (`401 unauthorized` en mode invité).
- **Sortie** : `{ "deleted": true }`. Le compte est supprimé. Chaque séjour
  dont il était owner passe au participant le plus ancien, ou est supprimé
  s'il en était le seul participant (déclencheur sur `auth.users`) ; ses
  entrées d'historique restent, sans auteur.
- **Erreurs** : codes communs ; `500 internal_error` si la suppression échoue.

### Rappels de la version web (Web Push)

Un navigateur ne sait pas programmer une notification : la version web
envoie au serveur la liste des rappels attendus, et le serveur les envoie à
l'heure prévue. L'application Android n'appelle aucune de ces fonctions
(notifications locales). Tables `push_subscriptions` et
`scheduled_reminders` : RLS activée sans règle, aucun accès direct.

#### `push-subscribe` — abonnement de l'appareil

- **Méthode** : `POST`, mode invité accepté.
- **Entrée** : `{ "deviceId", "subscription": { "endpoint", "keys": { "p256dh", "auth" } }, "lang", "tripChanges"? }`.
  `tripChanges` (booléen, facultatif) : notifications des modifications des
  séjours partagés pour cet appareil ; absent : inchangé.
  `deviceId` : identifiant aléatoire créé par l'application (16 à 64 lettres,
  chiffres ou tirets). `subscription` : `PushSubscription.toJSON()` du
  navigateur ; `endpoint` doit appartenir à un service de push connu (Apple,
  Google, Mozilla, Microsoft). `subscription: null` supprime l'abonnement et
  ses rappels.
- **Sortie** : `{ "subscribed": true }` (ou `false` après suppression).
  Enregistre ou met à jour l'abonnement de cet appareil (un seul par
  `deviceId`) ; note le compte s'il y en a un.
- **Erreurs** : codes communs ; `400 invalid_request`.

#### `push-schedule` — rappels d'un séjour

- **Méthode** : `POST`, mode invité accepté.
- **Entrée** : `{ "deviceId", "tripId", "reminders": [{ "key", "sendAt", "title", "body", "url" }] }`.
  Liste **complète** des rappels du séjour pour cet appareil (200 au plus) :
  elle remplace l'existant ; liste vide = séjour supprimé ou rappels
  désactivés. `key` : identifiant stable du rappel (entier positif sur 31
  bits, `notificationId` du domaine partagé, le même que sur Android).
  `sendAt` : instant ISO 8601. `url` : lien vers le planning
  (`/planning/<séjour>?day=…&step=…`), rien d'autre n'est accepté. `title` et
  `body` sont mis en forme par l'application, sans adresse ni titre d'étape
  personnelle.
- **Réconciliation** : un rappel inchangé n'est pas réécrit (déjà envoyé, il
  n'est pas renvoyé) ; nouveau ou modifié, il est écrit et sera envoyé ; en
  attente et absent de la liste, il est supprimé. Clé unique par appareil :
  aucun doublon. Un rappel dont l'heure est passée est ignoré.
- **Sortie** : `{ "scheduled", "written", "removed" }` (rappels à venir de la
  liste, lignes écrites, lignes supprimées).
- **Erreurs** : codes communs ; `400 invalid_request` ; `404 not_subscribed`
  si l'appareil est inconnu (abonnement expiré ou purgé) : l'application se
  réabonne puis renvoie ses listes.

#### `push-send` — tâche planifiée (interne)

Appelée chaque minute par pg_cron + pg_net, seulement s'il y a un rappel à
envoyer ; réservée au rôle `service_role` (`403 forbidden` sinon). `POST`,
sans corps. Envoie les rappels dont `send_at` est passé depuis moins de 15
minutes et les marque envoyés ; supprime les abonnements expirés ou révoqués
(réponses 404 ou 410 du service de push) ; un échec passager est réessayé à
l'exécution suivante. Sortie : `{ due, sent, retry, expired }`. Secrets
requis : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
(`500 not_configured` sinon). Purge quotidienne : rappels 7 jours après leur
envoi, abonnements après 90 jours sans nouvelles de l'appareil.

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
| 1 | 2026-09-24 | Ajout compatible : origine CORS `https://anthonystocko.github.io` (pages web publiques). |
| 1 | 2026-09-25 | Ajouts compatibles : lieux OSM lus dans des tuiles statiques (réglage `osm.source`) ; source `osm` avec `source`, `dataDate`, `tilesRead`, `timings`, message `not_covered` ; `Place.unnamed` ; alerte `source_failed` avec `message` ; champ `osm` de `config`. |
| 1 | 2026-09-28 | Ajout compatible : `Place.names` (variantes du nom par langue). `Place.name` d'un lieu OSM devient le `name` OSM tel quel (auparavant la variante de la langue demandée, désormais dans `names`). |
| 1 | 2026-09-28 | Ajouts compatibles : lieux OSM de plusieurs pays (tuiles de tous les pays importés qui touchent la zone) ; source `osm` avec `status: "partial"`, `missingCountries`, `dataDates`, `tilesByCountry` ; alerte `places_partial` de `generate` ; `config.osm.countries` (date des données par pays importé). |
| 1 | 2026-09-29 | Ajouts compatibles : fonction `images` (photos Wikimedia Commons et crédits) ; `Place.image`, `Trip.hero`, `Trip.destination.wikidata` ; `places` : `wikidata` des lieux Mérimée et Muséofile. |
| 1 | 2026-09-29 | Ajout compatible : `generate` en flux NDJSON (`Accept: application/x-ndjson`), événements `start`, `step`, `result`, `error`. |
| 1 | 2026-10-13 | Ajouts compatibles : rappels de la version web, fonctions `push-subscribe`, `push-schedule`, `push-send` ; code `404 not_subscribed`. |
| 1 | 2026-10-16 | Ajouts compatibles : séjours partagés, Bloc A (tables `profiles`, `trip_members`, `trip_invites`, `trip_changes`, colonne `trips.version`, RLS par participant) ; `Day.id` (schemaVersion 3) dans les séjours de `generate`. |
| 1 | 2026-10-16 | Ajout compatible : fonction `trip-apply-ops` (modifications par opérations, idempotentes) ; `version` dans les séjours lus. |
| 1 | 2026-10-16 | Ajouts compatibles : fonctions `trip-invite-link`, `trip-invite-email`, `trip-invites-claim`, `trip-join` ; clé réservée `web_url` de `app_config` ; `ownerId` dans les séjours lus. |
| 1 | 2026-10-16 | Ajouts compatibles : `trip_changes` en direct (Realtime), `step_ids` et `summary_count` ; `last_seen_version` modifiable par chacun ; `push-subscribe` : `tripChanges`. |
| 1 | 2026-10-16 | Ajouts compatibles : `config.minSharedSchemaVersion` (clé `min_shared_schema_version`) ; `trip-apply-ops` : `schemaVersion`, `409 shared_schema_outdated`, `rejected[].by`. |
| 1 | 2026-10-16 | Ajouts compatibles : limite `invites` (60 appels par heure) pour les fonctions d'invitation ; invitations effacées après usage (`purge_trip_invites`). |
