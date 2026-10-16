-- Retour arrière de supabase/migrations/20261016100000_shared_trips.sql.
-- À exécuter à la main (éditeur SQL du tableau de bord), puis supprimer la
-- ligne 20261016100000 de supabase_migrations.schema_migrations pour que la
-- migration puisse être rejouée. Les participants, invitations, historiques
-- et profils sont perdus ; un séjour partagé redevient visible de son seul
-- owner (trips.user_id). Les identifiants de journée ajoutés aux séjours
-- restent : ils sont sans effet pour l'application en schemaVersion 2.

begin;

drop trigger if exists monguide_transfer_trips_on_account_deletion on auth.users;
drop function if exists public.transfer_trips_on_account_deletion();

select cron.unschedule('monguide-purge-trip-changes')
where exists (select 1 from cron.job where jobname = 'monguide-purge-trip-changes');

drop policy if exists "trips_select_member" on public.trips;
drop policy if exists "trips_delete_owner" on public.trips;
drop policy if exists "trips_insert_legacy" on public.trips;
drop policy if exists "trips_update_legacy" on public.trips;

drop trigger if exists trips_add_owner on public.trips;

drop table if exists public.trip_changes;
drop table if exists public.trip_invites;
drop table if exists public.trip_members;
drop table if exists public.profiles;

drop function if exists public.purge_trip_changes(integer);
drop function if exists public.trip_invites_guard_revocation();
drop function if exists public.trips_add_owner();
drop function if exists public.trip_members_check_limit();
drop function if exists public.touch_updated_at();
drop function if exists public.is_trip_member(uuid);
drop function if exists public.is_trip_owner(uuid);
drop function if exists public.is_trip_shared(uuid);
drop function if exists public.shares_trip_with(uuid);

drop trigger if exists trips_set_version on public.trips;
drop function if exists public.trips_set_version();
alter table public.trips drop column if exists version;
drop function if exists public.with_day_ids(uuid, jsonb);

-- Politiques d'origine (20260924130000_trips.sql).
create policy "trips_select_own" on public.trips
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "trips_insert_own" on public.trips
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "trips_update_own" on public.trips
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "trips_delete_own" on public.trips
  for delete to authenticated
  using (user_id = (select auth.uid()));

commit;
