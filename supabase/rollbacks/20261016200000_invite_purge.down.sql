-- Retour arrière de supabase/migrations/20261016200000_invite_purge.sql (à
-- exécuter à la main, puis supprimer la ligne 20261016200000 de
-- supabase_migrations.schema_migrations).

begin;

select cron.unschedule('monguide-purge-trip-invites');
drop function if exists public.purge_trip_invites();

commit;
