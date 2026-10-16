-- Retour arrière de supabase/migrations/20261016120000_trip_ops.sql (à
-- exécuter à la main, puis supprimer la ligne 20261016120000 de
-- supabase_migrations.schema_migrations). La fonction trip-apply-ops ne
-- fonctionne plus ensuite : à retirer ou redéployer dans sa version précédente.

begin;

select cron.unschedule('monguide-purge-trip-applied-ops')
where exists (select 1 from cron.job where jobname = 'monguide-purge-trip-applied-ops');

drop function if exists public.trip_commit(uuid, integer, jsonb, uuid, uuid[], text, text);
drop function if exists public.trip_create(uuid, uuid, jsonb, uuid[], text, text);
drop table if exists public.trip_applied_ops;

commit;
