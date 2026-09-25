-- Bloc B (tuiles de lieux OpenStreetMap) : bucket privé osm-tiles
-- (docs/osm-tiles.md). Écrit par la GitHub Action de génération et lu par la
-- fonction places, toutes deux avec la clé service_role, qui contourne RLS.
-- Bucket non public et AUCUNE règle sur storage.objects pour ce bucket : les
-- clés publiques (anon, authenticated) ne peuvent ni lire, ni lister, ni écrire.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'osm-tiles',
  'osm-tiles',
  false,
  -- 50 Mo, limite par fichier du plan gratuit (la plus grosse tuile mesurée fait 0,5 Mo)
  52428800,
  -- tuiles .json.gz, manifest.json et current.json
  array['application/gzip', 'application/json']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
