-- Retour arrière de supabase/migrations/20261016160000_trip_live.sql (à
-- exécuter à la main, puis supprimer la ligne 20261016160000 de
-- supabase_migrations.schema_migrations). Redéployer trip-apply-ops dans sa
-- version précédente (trip_commit à 7 paramètres).

begin;

drop function if exists public.trip_queue_change_pushes(uuid, uuid);
alter table public.push_subscriptions drop column if exists notify_trip_changes;
drop policy if exists "trip_members_update_seen_self" on public.trip_members;
revoke update (last_seen_version) on table public.trip_members from authenticated;
drop function if exists public.trip_commit(uuid, integer, jsonb, uuid, uuid[], text, text, text[], integer);
alter publication supabase_realtime drop table public.trip_changes;
alter table public.trip_changes drop column if exists summary_count, drop column if exists step_ids;

commit;
