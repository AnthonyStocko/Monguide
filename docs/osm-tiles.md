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
{ "v": 1, "dataDate": "YYYY-MM-DD", "tile": "iy_ix", "places": [ ... ] }
```

- `v` : version du format (1).
- `dataDate` : date des données OpenStreetMap (horodatage de l'extrait
  Geofabrik).
- `tile` : identifiant de la case.
- `places` : lieux de la case, chacun sous forme compacte :

```
[id, category, subcategory, name, lat, lon, tags]
```

| Champ | Contenu |
|---|---|
| `id` | type OSM + identifiant : `"n123"` (nœud), `"w456"` (chemin), `"r789"` (relation) |
| `category` | catégorie Mon guide (`PlaceCategory`, voir ci-dessous) |
| `subcategory` | type précis, utilisé pour l'affichage et le classement intérieur/extérieur |
| `name` | `name` OSM, ou `null` pour le petit patrimoine sans nom |
| `lat`, `lon` | arrondies à 5 décimales (environ 1 m) |
| `tags` | objet des seuls tags utiles présents (`{}` si aucun) |

Catégories et sous-catégories (même classement que `osmCategory` dans
`services/osmMapping.js`, dans cet ordre de priorité) :

| Tags OSM | `category` | `subcategory` |
|---|---|---|
| `tourism=museum` | `museum` | `museum` |
| `heritage=1` ou `2` | `monument` | valeur de `historic`, sinon `monument` |
| `amenity=restaurant` | `restaurant` | `restaurant` |
| `amenity=marketplace` | `market` | `covered_market` si `covered=yes`, sinon `marketplace` |
| `shop=farm` | `farm` | `farm` |
| `leisure=park` | `park` | `park` |
| `boundary=protected_area` | `nature` | `protected_area` |
| `tourism=viewpoint` | `viewpoint` | `viewpoint` |
| `historic=wayside_cross`, `memorial`, `ruins` | `small_heritage` | valeur de `historic` |
| `amenity=lavoir` ou `man_made=lavoir` | `small_heritage` | `lavoir` |

`museum` et `monument` ne servent qu'au repli du patrimoine hors de France,
quand Wikidata échoue. En France, Mérimée et Muséofile restent les sources :
ces deux catégories y sont ignorées à la lecture.

Tags conservés, seulement s'ils existent : `cuisine`, `opening_hours`,
`wheelchair`, `diet:vegetarian`, `diet:vegan`, `phone`, `website`, `wikidata`,
`heritage`. `contact:phone` et `contact:website` sont ramenés à `phone` et
`website` (la valeur directe l'emporte si les deux existent).

Règles de sélection :

- **Objets sans nom exclus**, sauf le petit patrimoine (`wayside_cross`,
  `memorial`, `ruins`, `lavoir`) et les points de vue (`viewpoint`). Ils sont
  tous stockés ; la génération du séjour ne garde que les sous-catégories de
  `rules.osm.unnamedTypes` et leur donne un nom générique traduit à
  l'affichage (« Point de vue », « Lavoir »…).
- **Surfaces** (parcs, espaces protégés, marchés dessinés en surface, chemins
  et relations en général) réduites à un point situé **à l'intérieur** du
  polygone (*point on surface*), jamais au centroïde ni au centre du
  rectangle englobant, qui peuvent tomber dehors (parc en croissant, espace
  protégé en plusieurs morceaux). La case d'un lieu est celle de ce point.

### Exemple

Extrait réel de la case `225_21` (Ardèche, autour de Saint-Agrève et Mars ;
45,0° à 45,2° N, 4,2° à 4,4° E), données du 2026-09-24, 7 lieux sur 26 :

```json
{
  "v": 1,
  "dataDate": "2026-09-24",
  "tile": "225_21",
  "places": [
    ["n1507972772", "restaurant", "restaurant", "Le Cabistou", 45.06816, 4.38768, {}],
    ["n4960151502", "restaurant", "restaurant", "Le Verdun", 45.01023, 4.39509, { "cuisine": "french" }],
    ["n13629585801", "farm", "farm", "Ma cabane sur Mars", 45.01615, 4.33134,
      { "phone": "+33 6 62 74 86 24", "website": "http://macabanesurmars.gindofree.fr" }],
    ["n4324029702", "small_heritage", "wayside_cross", "Calvaire", 45.06805, 4.3902, {}],
    ["n1806595287", "small_heritage", "memorial", null, 45.01189, 4.39223, { "wikidata": "Q136071863" }],
    ["n7668773952", "small_heritage", "lavoir", null, 45.00117, 4.30063, {}],
    ["n1867579076", "viewpoint", "viewpoint", null, 45.01267, 4.39478, {}]
  ]
}
```

Le fichier réel est écrit sans espaces ni retours à la ligne, puis compressé.
Un lieu nommé y occupe 40 à 50 octets compressés.

### Conversion en Place

La lecture reconstruit un élément au format Overpass (`type`, `id`, `lat`,
`lon`, `tags` dont `name`) et le passe à `osmElementToPlace` (ou
`osmHeritageElementToPlace` pour `museum` et `monument`) : le `Place` produit
est identique à celui issu d'Overpass.

## Organisation du bucket `osm-tiles`

Bucket **privé** (migration `20260925100000_osm_tiles_bucket.sql`) : aucune
règle d'accès sur `storage.objects`, donc aucune lecture ni écriture avec les
clés publiques. La GitHub Action (écriture) et la fonction `places` (lecture)
utilisent la clé `service_role`. Types acceptés : `application/gzip` (tuiles)
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
  "v": 1,
  "dataDate": "2026-09-24",
  "cellDeg": 0.2,
  "countries": {
    "FR": {
      "extract": "europe/france",
      "extractDate": "2026-09-24T20:21:20Z",
      "counts": { "restaurant": 89000, "market": 2900, "...": 0 },
      "tiles": ["225_21", "228_24", "..."]
    }
  }
}
```

- `countries` : pays couverts par la version. Un pays absent n'a pas de
  tuiles : la lecture échoue tout de suite pour lui (sans attendre un délai),
  y compris pour le repli du patrimoine.
- `counts` : nombre de lieux par catégorie, pour le contrôle de la génération
  (valeurs de l'exemple : ordres de grandeur taginfo, pas une vraie génération).
- `tiles` : cases non vides du pays ; une case absente de la liste n'est pas
  lue (elle est vide, ce n'est pas une erreur).

### Pointeur et versions

`current.json` :

```json
{ "dataDate": "2026-09-24", "manifest": "2026-09-24/manifest.json" }
```

- La génération écrit d'abord toutes les tuiles, puis le manifeste, et
  **en dernier** `current.json`. Une génération interrompue laisse la version
  précédente en service.
- Les **deux dernières versions** sont conservées : revenir en arrière, c'est
  réécrire `current.json` vers la précédente. Les plus anciennes sont
  supprimées après l'écriture du pointeur.
