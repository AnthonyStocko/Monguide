# Tuiles de lieux OpenStreetMap

Les lieux OpenStreetMap (restaurants, marchés et producteurs, parcs et espaces
naturels, petit patrimoine, et en repli hors de France monuments et musées) ne
viennent plus d'Overpass, inutilisable depuis les Edge Functions. Ils sont
pré-calculés chaque mois à partir des extraits Geofabrik, découpés en tuiles
(un fichier JSON compressé par case de grille) et rangés dans le bucket privé
Supabase `osm-tiles`. La fonction `places` lit les quelques tuiles qui
touchent le cercle du séjour.

Ce document décrit la grille, le format des fichiers et leur organisation.

## Grille

Code : `supabase/functions/_shared/domain/osmGrid.js` (fonctions pures,
partagées par la lecture et par la génération).

- Cases de `cellDeg` degrés de côté ; `rules.osm.tiles.cellDeg` = **0,2**
  (environ 22 km du sud au nord et 15 km d'ouest en est en France). Valeur
  retenue à l'étude des volumes du 2026-09-25 : 10 à 11 tuiles lues pour un
  rayon de 20 km, 23 à 26 pour 40 km, et au plus 0,5 Mo pour la tuile la plus
  chargée (Paris).
- Identifiant de case : `iy = floor(lat / cellDeg)`, `ix = floor(lon / cellDeg)`,
  nom `"iy_ix"`, par exemple `"228_24"` pour Lyon et `"242_-23"` pour Brest.
  C'est bien `floor` et non une troncature : à la longitude -1,5°, l'indice
  est -8 (une troncature donnerait -7, la case voisine). Une petite tolérance
  corrige les erreurs de virgule flottante (45,6 / 0,2 = 227,999…, alors que
  45,6° est le bord sud de la case 228).
- `tileIdsForRadius(lat, lon, radiusKm, cellDeg)` renvoie toutes les cases qui
  touchent le cercle : les cases du rectangle englobant (plus large en degrés
  de longitude, le degré de longitude rétrécissant avec la latitude), sauf
  celles dont le point le plus proche du centre est hors du rayon.
- La lecture utilise le `cellDeg` du manifeste en service, pas celui de
  `rules.js` : changer le pas demande de régénérer les tuiles.
- Grille valable en Europe ; non prévue pour l'antiméridien (±180°) ni les
  pôles.

## Contenu d'une tuile

Fichier JSON compressé gzip :

```json
{ "v": 2, "dataDate": "YYYY-MM-DD", "tile": "iy_ix", "places": [ ... ] }
```

- `v` : version du format : **2** pour les tuiles générées depuis le
  Prompt 3.0, 1 pour les plus anciennes (voir « Format v1 » plus bas). La
  lecture accepte les deux, fichier par fichier.
- `dataDate` : date des données OpenStreetMap (horodatage de l'extrait
  Geofabrik).
- `tile` : identifiant de la case.
- `places` : lieux de la case, chacun sous forme compacte (v2) :

```
[id, category, subcategory, name, lat, lon, tags, names, cc]
```

| Champ | Contenu |
|---|---|
| `id` | type OSM + identifiant : `"n123"` (nœud), `"w456"` (chemin), `"r789"` (relation) |
| `category` | catégorie Mon guide (`PlaceCategory`, voir ci-dessous) |
| `subcategory` | type précis, utilisé pour l'affichage et le classement intérieur/extérieur |
| `name` | `name` OSM, ou `null` pour le petit patrimoine sans nom |
| `lat`, `lon` | arrondies à 5 décimales (environ 1 m) |
| `tags` | objet des seuls tags utiles présents (`{}` si aucun) |
| `names` | variantes `name:<langue>` présentes dans OSM qui diffèrent de `name`, pour les langues utiles seulement : `{ "fr": "Grand-Place", "nl": "Grote Markt" }` ; `null` si aucune (une position de tableau ne peut pas être absente) |
| `cc` | code ISO du pays de l'extrait d'origine (`"BE"`), le même que celui du dossier |

Langues utiles (`configuredNameLanguages`, `scripts/osm-tiles/config.js`) : `fr`,
`en`, `nl`, `de`, `it`, `es`, `ca`, `eu`, `pt`, plus les langues locales
(champ `languages`) de **tous** les pays de
`scripts/osm-tiles/countries.json` : la tuile belge garde aussi, par exemple,
un nom en luxembourgeois si le Luxembourg est importé. Un pays qui apporte
une langue nouvelle ne l'ajoute aux autres pays qu'à leur prochaine
génération. Mesure sur un échantillon de Bruxelles (2 624 lieux,
2026-09-28) : +2,5 % de taille avec fr, en, nl, de ; +3,8 % avec toutes
les variantes.

La grille est la même dans tous les pays : une case frontalière a un
fichier par pays, sous le même identifiant de case.

Catégories et sous-catégories (même classement que `osmCategory` dans
`services/osmMapping.js`, dans cet ordre de priorité) :

| Tags OSM | `category` | `subcategory` |
|---|---|---|
| `tourism=museum` | `museum` | `museum` |
| `heritage=1` ou `2` | `monument` | valeur de `historic`, sinon `building`, sinon `amenity`, sinon `monument` (type lu par `osmHeritageElementToPlace`) |
| `amenity=restaurant` | `restaurant` | `restaurant` |
| `amenity=marketplace` | `market` | `covered_market` si `covered=yes`, sinon `marketplace` |
| `shop=farm` | `farm` | `farm` |
| `leisure=park` | `park` | `park` |
| `boundary=protected_area` | `nature` | `protected_area` |
| `tourism=viewpoint` | `viewpoint` | `viewpoint` |
| `historic=wayside_cross`, `memorial`, `ruins` | `small_heritage` | valeur de `historic` |
| `amenity=lavoir` ou `man_made=lavoir` | `small_heritage` | `lavoir` |

`museum` et `monument` ne servent qu'au repli du patrimoine hors de France,
quand Wikidata échoue. Ils ne sont générés que pour les pays configurés avec
`heritageFallback: true` (`scripts/osm-tiles/countries.json`) ; en France, Mérimée
et Muséofile restent les sources et les tuiles n'en contiennent pas.

Tags conservés, seulement s'ils existent, dans cet ordre : `cuisine`,
`opening_hours`, `wheelchair`, `diet:vegetarian`, `diet:vegan`, `phone`,
`website`, `wikidata`, `heritage`, `description`. `contact:phone` et
`contact:website` sont ramenés à `phone` et `website` (la valeur directe
l'emporte si les deux existent). `description` est lue par
`osmElementToPlace` : sans elle, le `Place` issu des tuiles différerait de
celui d'Overpass. Les variantes de nom sont dans `names`, plus dans `tags`.

Règles de sélection :

- **Objets sans nom exclus** (ni `name`, ni variante dans une langue utile), sauf le petit patrimoine (`wayside_cross`,
  `memorial`, `ruins`, `lavoir`) et les points de vue (`viewpoint`). Ils sont
  tous stockés ; la génération du séjour ne garde que les sous-catégories de
  `rules.osm.unnamedTypes` et leur donne un nom générique traduit à
  l'affichage (« Point de vue », « Lavoir »…).
- **Surfaces** (parcs, espaces protégés, marchés dessinés en surface, chemins
  et relations en général) réduites à un point situé **à l'intérieur** du
  polygone (*point on surface*), jamais au centroïde ni au centre du
  rectangle englobant, qui peuvent tomber dehors (parc en croissant, espace
  protégé en plusieurs morceaux). Méthode de GEOS (`point_on_surface` de
  shapely et PostGIS), réécrite dans `scripts/osm-tiles/pointOnSurface.js` :
  coupe horizontale à mi-hauteur, entre deux sommets, et milieu du plus long
  segment intérieur (trous exclus). Une ligne est réduite à son point à
  mi-longueur. La case d'un lieu est celle de ce point, après arrondi.
- Lieux triés dans chaque tuile par type (`n`, `r`, `w`) puis identifiant.

### Exemple

Extrait réel de la case `225_21` (Ardèche, autour de Saint-Agrève et Mars ;
45,0° à 45,2° N, 4,2° à 4,4° E), données du 2026-09-24, 7 lieux sur 26 :

```json
{
  "v": 2,
  "dataDate": "2026-09-24",
  "tile": "225_21",
  "places": [
    ["n1507972772", "restaurant", "restaurant", "Le Cabistou", 45.06816, 4.38768, {}, null, "FR"],
    ["n4960151502", "restaurant", "restaurant", "Le Verdun", 45.01023, 4.39509, { "cuisine": "french" }, null, "FR"],
    ["n13629585801", "farm", "farm", "Ma cabane sur Mars", 45.01615, 4.33134,
      { "phone": "+33 6 62 74 86 24", "website": "http://macabanesurmars.gindofree.fr" }, null, "FR"],
    ["n4324029702", "small_heritage", "wayside_cross", "Calvaire", 45.06805, 4.3902, {}, null, "FR"],
    ["n1806595287", "small_heritage", "memorial", null, 45.01189, 4.39223, { "wikidata": "Q136071863" }, null, "FR"],
    ["n7668773952", "small_heritage", "lavoir", null, 45.00117, 4.30063, {}, null, "FR"],
    ["n1867579076", "viewpoint", "viewpoint", null, 45.01267, 4.39478, {}, null, "FR"]
  ]
}
```

Le fichier réel est écrit sans espaces ni retours à la ligne, puis compressé.
Un lieu nommé y occupe 40 à 50 octets compressés.

Lieu bruxellois au nom bilingue (exemple construit, pas une vraie génération) :

```json
["w123", "park", "park", "Parc de Bruxelles - Warandepark", 50.8445, 4.3643, {}, { "fr": "Parc de Bruxelles", "nl": "Warandepark" }, "BE"]
```

### Format v1 (lu pendant la transition)

`{ "v": 1, … }`, lieux `[id, category, subcategory, name, lat, lon, tags]` :
ni `names` ni `cc` ; `name:fr` et `name:en` étaient dans `tags` quand ils
différaient de `name`, et un objet nommé seulement dans une autre langue
était exclu. À la lecture (`normalizeTile`, `services/osmTiles.js`), un
lieu v1 a `names` absent (`null`) et `cc` = code du dossier du pays ; ses
`name:fr` et `name:en` restent dans `tags`, d'où `osmElementToPlace` tire
les mêmes variantes. Un manifeste peut mélanger les deux formats (pays non
regénéré ; champ `format` absent = 1). **Le support du v1 sera retiré quand
tous les pays du manifeste en service seront en v2** (tâche notée dans le
README).

### Conversion en Place

La lecture reconstruit un élément au format Overpass (`type`, `id`, `lat`,
`lon`, `tags` dont `name` et les `name:<langue>` de `names`) et le passe à
`osmElementToPlace` (ou `osmHeritageElementToPlace` pour `museum` et
`monument`) : le `Place` produit est identique à celui issu d'Overpass.

Nom du `Place` : `name` OSM tel quel (un nom bilingue reste bilingue),
sinon la variante de la langue demandée ; `Place.names` reçoit les
variantes qui en diffèrent. L'application affiche `displayName(place,
langue)` (`domain/displayName.js`) : variante de la langue de l'interface,
sinon `name` ; un `name` en alphabet non latin (grec) est remplacé par
`names.en`, à défaut translittéré (ELOT 743, `domain/translitGreek.js`) ;
nom générique traduit pour le petit patrimoine sans nom.

## Organisation du bucket `osm-tiles`

Bucket **privé** (migration `20260925100000_osm_tiles_bucket.sql`) : aucune
règle d'accès sur `storage.objects`, donc aucune lecture ni écriture avec les
clés publiques. La GitHub Action écrit par l'accès compatible S3 du stockage
(clés S3 dédiées, voir plus bas) ; la fonction `places` lit avec la clé
`service_role`, que Supabase lui fournit. Types acceptés : `application/gzip` (tuiles)
et `application/json` (manifeste, pointeur) ; 50 Mo au plus par fichier.

Chemins, dans le bucket :

```
<dataDate>/<pays>/<cellDeg>/<iy_ix>.json.gz     tuile
<dataDate>/manifest.json                        manifeste de la version
current.json                                    pointeur vers la version en service
```

`<pays>` est le code ISO du pays en majuscules (`FR`), comme dans
`domain/config/countries.js`, et `<cellDeg>` le pas écrit en décimal (`0.2`).
Exemple : `2026-09-24/FR/0.2/225_21.json.gz`.

Une case traversée par une frontière a un fichier par pays couvert. Les
extraits Geofabrik se chevauchent un peu aux frontières : la lecture
dédoublonne par `id`.

### Manifeste

```json
{
  "v": 2,
  "dataDate": "2026-09-24",
  "cellDeg": 0.2,
  "countries": {
    "FR": {
      "path": "2026-09-24/FR/0.2",
      "format": 2,
      "dataDate": "2026-09-24",
      "extract": "europe/france",
      "extractDate": "2026-09-24T20:21:20Z",
      "total": 250000,
      "counts": { "restaurant": 89000, "market": 2900, "...": 0 },
      "files": 1500,
      "bytes": 9500000,
      "tiles": ["225_21", "228_24", "..."],
      "previousPath": "2026-08-03/FR/0.2"
    }
  }
}
```

- `format` : version du format des tuiles du pays (absent : 1).
- `path` : dossier des tuiles du pays. Un pays non retraité (lancement
  manuel pour d'autres pays) ou en échec garde son entrée de la version en
  service, donc son dossier d'origine (une autre version).
- `dataDate` : date des données du pays (absente des entrées écrites avant
  le Bloc C du Prompt 3.0 : tirée alors de `extractDate`).
- `previousPath` : dossier de la version précédente du pays (`null` pour un
  premier import), conservé pour un retour arrière.
- `countries` : pays couverts par la version. Un pays absent n'a pas de
  tuiles : ses lieux manquent (source `osm` en `partial` si la zone touche
  aussi un pays importé, `not_covered` sinon, sans attendre de délai). Un
  pays retiré de `countries.json` sort du manifeste au lancement suivant.
- `counts` : nombre de lieux par catégorie, pour le contrôle de la génération
  (valeurs de l'exemple : ordres de grandeur taginfo, pas une vraie génération).
- `tiles` : cases non vides du pays ; une case absente de la liste n'est pas
  lue (elle est vide, ce n'est pas une erreur).

### Pointeur et versions

`current.json` :

```json
{ "dataDate": "2026-10-03", "manifest": "2026-10-03/manifest.json", "previous": "2026-09-24" }
```

- La génération écrit d'abord toutes les tuiles, puis le manifeste, et
  **en dernier** `current.json`. Une génération interrompue laisse la version
  précédente en service.
- La version est la date de l'extrait le plus récent parmi les pays
  téléchargés (`YYYY-MM-DD`). Regénérer le même extrait réécrit la même
  version à l'identique.
- **Rétention, pays par pays** : sont conservés les manifestes de la
  version en service et de la précédente (`previous`), et pour chaque pays
  son dossier en service (`path`) et celui de sa version précédente
  (`previousPath`), plus tous les dossiers du manifeste précédent. Un
  dossier plus ancien n'est supprimé que si aucun de ces manifestes ne le
  référence (`storagePlan`, `scripts/osm-tiles/manifest.js`), après
  l'écriture du pointeur. Revenir en arrière, c'est réécrire
  `current.json` vers `previous`.

## Production mensuelle

Workflow `.github/workflows/osm-tiles.yml`, script `scripts/osm-tiles/`
(pays et plafond dans `countries.json`, le reste dans `config.js`).

- **Quand** : le 3 de chaque mois à 02:17 UTC (tous les pays), et à la
  demande (Actions > Tuiles de lieux OSM > Run workflow) avec les
  paramètres :
  - `pays` : un code (`BE`), une liste (`BE,LU`) ou `all`. Seuls ces pays
    sont retraités ; les autres gardent leur dossier actuel via le manifeste ;
  - `publier` (décoché : génération et contrôles seulement) ;
  - `verifier_determinisme` : deuxième génération comparée à la première ;
  - `tronquer_pays` (test) : pays dont l'extrait est réduit à quelques rues,
    leur contrôle doit échouer et les autres être publiés ;
  - `plafond_mo` (test) : plafond de stockage forcé, par exemple `1` pour
    vérifier que la publication est bloquée.
- **Pays** : `countries.json`, une entrée par pays : code ISO, extrait
  Geofabrik (`https://download.geofabrik.de/<extrait>-latest.osm.pbf`, somme
  MD5 dans `….osm.pbf.md5`), langues gardées dans `names`, repli du
  patrimoine, seuil de restaurants d'un premier import. Au départ : France,
  Belgique, Luxembourg ; Grèce ajoutée le 2026-10-01.
- **Pays par pays, séquentiellement** : chaque extrait est téléchargé,
  vérifié, filtré, puis supprimé avant le pays suivant (disque de
  l'exécuteur : 14 Go, extrait le plus gros : 5 Go) ; chaque pays est
  ensuite exporté et découpé, ses fichiers intermédiaires supprimés.
- **Un pays en échec ne bloque pas les autres** : téléchargement, MD5,
  filtrage, génération ou contrôle en échec -> le pays garde ses tuiles
  précédentes (le nouveau manifeste pointe vers son dernier dossier valide),
  ou reste non couvert s'il n'en a pas. Les autres pays sont publiés, puis
  le lancement **se termine en échec** (étape « Pays en échec ») pour
  alerter.
- **Un téléchargement par mois** (conditions de Geofabrik) : les extraits
  filtrés sont mis en cache pour le mois (clé `osm-filtered-<pays>-<AAAA-MM>`)
  ; un nouveau lancement dans le mois les réutilise, sur le même extrait. Un
  pays absent du cache (échec précédent) est téléchargé.

Étapes :

1. `osmium tags-filter` avec les tags du Bloc A (`OSMIUM_FILTERS`), après
   vérification de la somme MD5 ; date des données lue dans l'en-tête de
   l'extrait (`osmosis_replication_timestamp`).
2. `osmium export` en GeoJSON séquentiel (`osmium-export.json` : tout chemin
   fermé est une surface), identifiants `n…`, `w…`, `r…`.
3. `cli.js build` : point intérieur, règles de ce document, répartition dans
   les cases, fichiers `.json.gz`. Choix de Node plutôt que Python et
   shapely : le script réutilise tel quel le code du serveur (`osmGrid.js`
   pour les cases, `osmCategory` pour le classement), donc la génération et
   la lecture ne peuvent pas diverger ; seul le point intérieur est réécrit
   (une fonction testée). Sortie déterministe : lieux et cases triés, JSON
   compact, gzip sans date.
4. Contrôles par pays (`cli.js finalize`, `checkCountry`) : fichier de 50 Mo
   ou plus ; pour un pays déjà publié, baisse de plus de 20 % du total ou
   d'une catégorie (d'au moins 100 lieux) par rapport à sa version
   précédente ; pour un premier import, seuil minimum de restaurants
   (`minRestaurants`). Un pays en échec est retiré de la publication.
5. **Plafond de stockage** (`maxStorageMb` de `countries.json`, 200 Mo) :
   espace du bucket après publication et nettoyage (nouvelle version plus
   dossiers conservés), calculé depuis le contenu réel du bucket. Au-delà,
   arrêt sans rien publier, avec le total et les pays les plus volumineux.
6. Publication par l'accès S3 du stockage (`aws s3 sync`) : tuiles des pays
   à jour, manifeste, puis `current.json` en dernier.
7. Suppression des dossiers qui ne sont plus à conserver (voir
   « Rétention »).
8. Résumé dans la page du lancement : chaque pays avec son statut (mis à
   jour, conservé, en échec avec version précédente conservée, en échec
   non couvert, retiré), sa date des données, son nombre de lieux et sa taille ;
   les erreurs ; l'espace occupé et le plafond ; le détail par catégorie
   des pays générés ; la durée.

Secrets GitHub : `SUPABASE_S3_ACCESS_KEY_ID` et `SUPABASE_S3_SECRET_ACCESS_KEY`
(Supabase > Project Settings > Storage > S3 access keys : clés du stockage
seulement), et `SUPABASE_PROJECT_REF` (déjà présent) pour l'adresse
`https://<ref>.storage.supabase.co/storage/v1/s3`, région `eu-west-1`.
Aucune clé `service_role` dans le dépôt ni dans les secrets.

GitHub désactive les workflows programmés d'un dépôt public après 60 jours
sans activité : penser à le réactiver (onglet Actions) en cas de pause.
