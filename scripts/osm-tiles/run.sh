#!/usr/bin/env bash
# Étapes shell de la génération des tuiles de lieux OSM, appelées par
# .github/workflows/osm-tiles.yml (docs/osm-tiles.md).
#
#   run.sh download   extraits Geofabrik -> $WORK/filtered/<pays>.osm.pbf et .date
#   run.sh generate   tuiles de chaque pays -> $WORK/out/<version>/…
#   run.sh current    version en service -> $WORK/current.json, $WORK/manifest.json
#   run.sh finalize   contrôles, manifeste, current.json (échec = rien de publié)
#   run.sh publish    fichiers de la version, puis current.json EN DERNIER
#   run.sh cleanup    suppression des versions qui ne sont plus à conserver
#
# Variables : COUNTRIES ("FR:europe/france …", sortie de cli.js countries),
# WORK (répertoire de travail), BUCKET_NAME (osm-tiles), S3_ENDPOINT,
# TRUNCATE=true (test : extrait réduit à un petit rectangle),
# CHECK_DETERMINISM=true (deuxième génération comparée à la première).
set -euo pipefail

CLI="node scripts/osm-tiles/cli.js"
WORK="${WORK:-work}"
BUCKET_NAME="${BUCKET_NAME:-osm-tiles}"
BUCKET="s3://$BUCKET_NAME"
GEOFABRIK="https://download.geofabrik.de"
# Rectangle du test d'extrait tronqué : Paris intra-muros.
TRUNCATE_BBOX="2.25,48.81,2.42,48.90"

s3() { aws s3 --endpoint-url "$S3_ENDPOINT" --only-show-errors "$@"; }
s3api() { aws s3api --endpoint-url "$S3_ENDPOINT" "$@"; }
codes() { for item in $COUNTRIES; do echo "${item%%:*}"; done; }

download() {
  local ua filters
  ua="$($CLI user-agent)"
  read -ra filters <<< "$($CLI filters)"
  mkdir -p "$WORK/raw" "$WORK/filtered"
  for item in $COUNTRIES; do
    local code="${item%%:*}" path="${item#*:}"
    local file
    file="$(basename "$path")-latest.osm.pbf"
    echo "::group::$code : téléchargement de $path"
    # Un seul téléchargement par pays et par mois (conditions de Geofabrik) :
    # le workflow met en cache le résultat filtré.
    curl -fsSL --retry 3 -A "$ua" -o "$WORK/raw/$file" "$GEOFABRIK/$path-latest.osm.pbf"
    curl -fsSL --retry 3 -A "$ua" -o "$WORK/raw/$file.md5" "$GEOFABRIK/$path-latest.osm.pbf.md5"
    (cd "$WORK/raw" && md5sum -c "$file.md5")
    local date
    date="$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$WORK/raw/$file")"
    if [[ ! "$date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]; then
      echo "::error::$code : date de l'extrait introuvable dans l'en-tête ($date)"
      exit 1
    fi
    echo "$date" > "$WORK/filtered/$code.date"
    osmium tags-filter "$WORK/raw/$file" "${filters[@]}" -o "$WORK/filtered/$code.osm.pbf" --overwrite
    rm -f "$WORK/raw/$file"
    ls -l "$WORK/filtered/$code.osm.pbf"
    echo "::endgroup::"
  done
}

version() {
  # Version = date de l'extrait le plus récent parmi les pays traités.
  for code in $(codes); do cut -c1-10 "$WORK/filtered/$code.date"; done | sort -r | head -1
}

generate() {
  local version
  version="$(version)"
  echo "version=$version" >> "${GITHUB_OUTPUT:-/dev/null}"
  rm -rf "$WORK/out" "$WORK/out2"
  for code in $(codes); do
    echo "::group::$code : génération"
    local src="$WORK/filtered/$code.osm.pbf"
    if [[ "${TRUNCATE:-false}" == "true" ]]; then
      echo "::warning::Test : extrait $code réduit au rectangle $TRUNCATE_BBOX, le contrôle doit échouer."
      osmium extract -b "$TRUNCATE_BBOX" "$src" -o "$WORK/$code.truncated.osm.pbf" --overwrite
      src="$WORK/$code.truncated.osm.pbf"
    fi
    osmium export "$src" -f geojsonseq -c scripts/osm-tiles/osmium-export.json -u type_id \
      -o "$WORK/$code.geojsonseq" --overwrite
    local date
    date="$(cat "$WORK/filtered/$code.date")"
    $CLI build --country "$code" --input "$WORK/$code.geojsonseq" --extract-date "$date" --version "$version" --out "$WORK/out"
    if [[ "${CHECK_DETERMINISM:-false}" == "true" ]]; then
      $CLI build --country "$code" --input "$WORK/$code.geojsonseq" --extract-date "$date" --version "$version" --out "$WORK/out2"
      diff -r "$WORK/out/$version/$code" "$WORK/out2/$version/$code"
      echo "$code : deuxième génération identique, fichier par fichier."
      echo "- Déterminisme ($code) : deuxième génération identique fichier par fichier." >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
      rm -rf "$WORK/out2"
    fi
    rm -f "$WORK/$code.geojsonseq" "$WORK/$code.truncated.osm.pbf"
    echo "::endgroup::"
  done
}

current() {
  rm -f "$WORK/current.json" "$WORK/manifest.json"
  # Vérifie l'accès au bucket : une erreur d'accès ne doit pas passer pour
  # « aucune version en service », qui supprimerait la comparaison.
  local found
  found="$(s3api list-objects-v2 --bucket "$BUCKET_NAME" --prefix current.json --max-keys 1 --query 'Contents[0].Key' --output text)"
  if [[ "$found" == "current.json" ]]; then
    s3 cp "$BUCKET/current.json" "$WORK/current.json"
    local manifest
    manifest="$(node -p "require('./$WORK/current.json').manifest")"
    s3 cp "$BUCKET/$manifest" "$WORK/manifest.json"
    echo "Version en service : $manifest"
  else
    echo "Aucune version en service : première publication."
  fi
}

finalize() {
  local args=(--out "$WORK/out" --version "$VERSION")
  [[ -f "$WORK/current.json" ]] && args+=(--current "$WORK/current.json")
  [[ -f "$WORK/manifest.json" ]] && args+=(--previous-manifest "$WORK/manifest.json")
  $CLI finalize "${args[@]}"
}

publish() {
  # 1. Tuiles des pays générés, 2. manifeste, 3. current.json en dernier :
  # une publication interrompue laisse la version précédente en service.
  s3 cp "$WORK/out/$VERSION" "$BUCKET/$VERSION" --recursive --exclude '*' --include '*.json.gz' --content-type application/gzip
  s3 cp "$WORK/out/$VERSION/manifest.json" "$BUCKET/$VERSION/manifest.json" --content-type application/json
  s3 cp "$WORK/out/current.json" "$BUCKET/current.json" --content-type application/json
  echo "Publiée : version $VERSION"
}

cleanup() {
  local version
  s3 ls "$BUCKET/" | awk '$1 == "PRE" { sub("/$", "", $2); print $2 }' | while read -r version; do
    [[ "$version" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
    if ! grep -qx "$version" "$WORK/out/keep.txt"; then
      echo "Suppression de l'ancienne version $version"
      s3 rm "$BUCKET/$version/" --recursive
    fi
  done
}

"$1"
