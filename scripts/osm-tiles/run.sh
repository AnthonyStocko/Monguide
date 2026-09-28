#!/usr/bin/env bash
# Étapes shell de la génération des tuiles de lieux OSM, appelées par
# .github/workflows/osm-tiles.yml (docs/osm-tiles.md).
#
#   run.sh download   extraits Geofabrik -> $WORK/filtered/<pays>.osm.pbf et .date
#   run.sh generate   tuiles de chaque pays -> $WORK/out/<version>/…
#   run.sh current    version en service, manifestes et contenu du bucket
#   run.sh finalize   contrôles par pays, plafond, manifeste, current.json
#   run.sh publish    fichiers de la version, puis current.json EN DERNIER
#   run.sh cleanup    suppression des dossiers qui ne sont plus à conserver
#   run.sh verdict    échec du lancement si au moins un pays a échoué
#
# Pays par pays, séquentiellement : chaque pays est téléchargé, vérifié
# (MD5), filtré, puis son extrait brut supprimé avant le pays suivant ; il
# est ensuite exporté et découpé, puis ses fichiers intermédiaires supprimés.
# Un pays en échec est noté dans $WORK/failures/<pays>.txt et n'arrête pas
# les autres : chaque pays tourne dans un processus à part (download_one,
# build_one), avec son propre « set -e ».
#
# Variables : COUNTRIES ("FR:europe/france …", sortie de cli.js countries),
# WORK (répertoire de travail), BUCKET_NAME (osm-tiles), S3_ENDPOINT,
# TRUNCATE ("BE" ou "BE,LU" : test, extrait de ces pays réduit à un petit
# rectangle, leur contrôle doit échouer), CHECK_DETERMINISM=true (deuxième
# génération comparée à la première), MAX_STORAGE_MB (plafond forcé, test).
set -euo pipefail

SELF="${BASH_SOURCE[0]}"
CLI="node scripts/osm-tiles/cli.js"
WORK="${WORK:-work}"
BUCKET_NAME="${BUCKET_NAME:-osm-tiles}"
BUCKET="s3://$BUCKET_NAME"
GEOFABRIK="https://download.geofabrik.de"
FAILURES="$WORK/failures"

s3() { aws s3 --endpoint-url "$S3_ENDPOINT" --only-show-errors "$@"; }
s3api() { aws s3api --endpoint-url "$S3_ENDPOINT" "$@"; }
codes() { for item in $COUNTRIES; do echo "${item%%:*}"; done; }
failed() { [[ -f "$FAILURES/$1.txt" ]]; }
fail() {
  mkdir -p "$FAILURES"
  echo "$2" > "$FAILURES/$1.txt"
  echo "::error title=Tuiles OSM : $1 en échec::$2"
}

# Rectangle du test d'extrait tronqué, par pays : quelques rues de la capitale.
truncate_bbox() {
  case "$1" in
    FR) echo "2.25,48.81,2.42,48.90" ;;
    BE) echo "4.34,50.84,4.36,50.85" ;;
    LU) echo "6.12,49.60,6.14,49.62" ;;
    *) echo "0,0,0.01,0.01" ;;
  esac
}
truncated() { [[ ",${TRUNCATE:-}," == *",$1,"* ]]; }

download_one() {
  local code="$1" path="$2" ua filters file date
  ua="$($CLI user-agent)"
  read -ra filters <<< "$($CLI filters)"
  file="$(basename "$path")-latest.osm.pbf"
  mkdir -p "$WORK/raw" "$WORK/filtered"
  curl -fsSL --retry 3 -A "$ua" -o "$WORK/raw/$file" "$GEOFABRIK/$path-latest.osm.pbf"
  curl -fsSL --retry 3 -A "$ua" -o "$WORK/raw/$file.md5" "$GEOFABRIK/$path-latest.osm.pbf.md5"
  (cd "$WORK/raw" && md5sum -c "$file.md5")
  date="$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$WORK/raw/$file")"
  if [[ ! "$date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]; then
    echo "date de l'extrait introuvable dans l'en-tête ($date)" >&2
    exit 1
  fi
  osmium tags-filter "$WORK/raw/$file" "${filters[@]}" -o "$WORK/filtered/$code.osm.pbf" --overwrite
  # .date en dernier : sa présence signifie « extrait filtré complet ».
  echo "$date" > "$WORK/filtered/$code.date"
  ls -l "$WORK/filtered/$code.osm.pbf"
}

download() {
  rm -rf "$FAILURES"
  for item in $COUNTRIES; do
    local code="${item%%:*}" path="${item#*:}"
    echo "::group::$code : téléchargement de $path"
    # Un seul téléchargement par pays et par mois (conditions de Geofabrik) :
    # le workflow met en cache les extraits filtrés du mois.
    if [[ -f "$WORK/filtered/$code.date" && -f "$WORK/filtered/$code.osm.pbf" ]]; then
      echo "$code : extrait filtré du mois déjà en cache ($(cat "$WORK/filtered/$code.date"))."
    elif ! bash "$SELF" download_one "$code" "$path"; then
      rm -f "$WORK/filtered/$code.osm.pbf" "$WORK/filtered/$code.date"
      fail "$code" "téléchargement, vérification MD5 ou filtrage de $path en échec"
    fi
    # Disque libéré avant le pays suivant (l'extrait brut fait jusqu'à 5 Go).
    rm -rf "$WORK/raw"
    df -h . | tail -1
    echo "::endgroup::"
  done
}

version() {
  # Version = date de l'extrait le plus récent parmi les pays téléchargés.
  for code in $(codes); do
    failed "$code" || cut -c1-10 "$WORK/filtered/$code.date"
  done | sort -r | head -1
}

build_one() {
  local code="$1" version="$2" src date
  src="$WORK/filtered/$code.osm.pbf"
  if truncated "$code"; then
    echo "::warning::Test : extrait $code réduit au rectangle $(truncate_bbox "$code"), son contrôle doit échouer."
    osmium extract -b "$(truncate_bbox "$code")" "$src" -o "$WORK/$code.truncated.osm.pbf" --overwrite
    src="$WORK/$code.truncated.osm.pbf"
  fi
  osmium export "$src" -f geojsonseq -c scripts/osm-tiles/osmium-export.json -u type_id \
    -o "$WORK/$code.geojsonseq" --overwrite
  date="$(cat "$WORK/filtered/$code.date")"
  $CLI build --country "$code" --input "$WORK/$code.geojsonseq" --extract-date "$date" --version "$version" --out "$WORK/out"
  if [[ "${CHECK_DETERMINISM:-false}" == "true" ]]; then
    $CLI build --country "$code" --input "$WORK/$code.geojsonseq" --extract-date "$date" --version "$version" --out "$WORK/out2"
    diff -r "$WORK/out/$version/$code" "$WORK/out2/$version/$code"
    echo "$code : deuxième génération identique, fichier par fichier."
    echo "- Déterminisme ($code) : deuxième génération identique fichier par fichier." >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  fi
}

generate() {
  local version
  version="$(version)"
  echo "version=$version" >> "${GITHUB_OUTPUT:-/dev/null}"
  rm -rf "$WORK/out" "$WORK/out2"
  mkdir -p "$WORK/out"
  if [[ -z "$version" ]]; then
    echo "::warning::Aucun extrait disponible : aucun pays à générer."
    return 0
  fi
  for code in $(codes); do
    failed "$code" && continue
    echo "::group::$code : génération"
    if ! bash "$SELF" build_one "$code" "$version"; then
      rm -rf "$WORK/out/$version/$code" "$WORK/out/results/$code.json"
      fail "$code" "génération des tuiles en échec"
    fi
    rm -rf "$WORK/out2" "$WORK/$code.geojsonseq" "$WORK/$code.truncated.osm.pbf"
    echo "::endgroup::"
  done
}

current() {
  rm -f "$WORK/current.json" "$WORK/manifest.json" "$WORK/older-manifest.json" "$WORK/objects.json"
  # Vérifie l'accès au bucket : une erreur d'accès ne doit pas passer pour
  # « aucune version en service », qui supprimerait la comparaison.
  local found
  found="$(s3api list-objects-v2 --bucket "$BUCKET_NAME" --prefix current.json --max-keys 1 --query 'Contents[0].Key' --output text)"
  if [[ "$found" == "current.json" ]]; then
    s3 cp "$BUCKET/current.json" "$WORK/current.json"
    local manifest older
    manifest="$(node -p "require('./$WORK/current.json').manifest")"
    s3 cp "$BUCKET/$manifest" "$WORK/manifest.json"
    echo "Version en service : $manifest"
    # Manifeste de la version précédente : ses dossiers sont gardés si l'on regénère la même version.
    older="$(node -p "require('./$WORK/current.json').previous ?? ''")"
    if [[ -n "$older" ]]; then
      s3 cp "$BUCKET/$older/manifest.json" "$WORK/older-manifest.json" || echo "::warning::Manifeste $older introuvable : aucun dossier ne sera supprimé."
    fi
  else
    echo "Aucune version en service : première publication."
  fi
  # Contenu du bucket (clé, taille) : plafond de stockage et nettoyage.
  s3api list-objects-v2 --bucket "$BUCKET_NAME" --query 'Contents[].{Key: Key, Size: Size}' --output json > "$WORK/objects.json"
  node -e "const o = require('./$WORK/objects.json') ?? []; console.log(o.length + ' fichiers, ' + (o.reduce((s, f) => s + f.Size, 0) / 1048576).toFixed(1) + ' Mo dans le bucket')"
}

finalize() {
  local args=(--out "$WORK/out" --version "${VERSION:-}" --failures "$FAILURES" --objects "$WORK/objects.json")
  [[ -f "$WORK/current.json" ]] && args+=(--current "$WORK/current.json")
  [[ -f "$WORK/manifest.json" ]] && args+=(--previous-manifest "$WORK/manifest.json")
  [[ -f "$WORK/older-manifest.json" ]] && args+=(--older-manifest "$WORK/older-manifest.json")
  [[ -n "${MAX_STORAGE_MB:-}" ]] && args+=(--max-storage-mb "$MAX_STORAGE_MB")
  $CLI finalize "${args[@]}"
}

publish() {
  aws configure set default.s3.max_concurrent_requests 4
  # 1. Tuiles des pays générés et contrôlés (celles des pays en échec ont été
  # retirées par finalize), 2. manifeste, 3. current.json en dernier : une
  # publication interrompue laisse la version précédente en service.
  # Le stockage refuse par moments quelques envois (erreur vide, jamais les
  # mêmes fichiers) : sync renvoie seulement les fichiers manquants.
  local attempt
  for attempt in 1 2 3 4 5; do
    if s3 sync "$WORK/out/$VERSION" "$BUCKET/$VERSION" --exclude '*' --include '*.json.gz' --content-type application/gzip; then
      break
    fi
    if [[ $attempt == 5 ]]; then
      echo "::error::Envoi des tuiles incomplet après 5 essais : current.json n'est pas modifié."
      exit 1
    fi
    echo "Envoi incomplet (essai $attempt), nouvel essai des fichiers manquants."
    sleep $((attempt * 15))
  done
  s3 cp "$WORK/out/$VERSION/manifest.json" "$BUCKET/$VERSION/manifest.json" --content-type application/json
  s3 cp "$WORK/out/current.json" "$BUCKET/current.json" --content-type application/json
  echo "Publiée : version $VERSION"
}

cleanup() {
  # Liste calculée par finalize (storagePlan) : dossiers de pays ("…/") et
  # manifestes qu'aucun manifeste conservé ne référence.
  local target
  while read -r target; do
    [[ -z "$target" ]] && continue
    echo "Suppression de $target"
    if [[ "$target" == */ ]]; then
      s3 rm "$BUCKET/$target" --recursive
    else
      s3 rm "$BUCKET/$target"
    fi
  done < "$WORK/out/delete.txt"
}

verdict() {
  if [[ -s "$WORK/out/failed.txt" ]]; then
    echo "::error::Pays en échec : $(paste -sd' ' "$WORK/out/failed.txt"). Ils gardent leur version précédente s'ils en ont une ; les pays à jour sont publiés (voir le résumé)."
    exit 1
  fi
  echo "Aucun pays en échec."
}

"$@"
