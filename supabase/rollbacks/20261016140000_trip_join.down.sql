-- Retour arrière de supabase/migrations/20261016140000_trip_join.sql (à
-- exécuter à la main, puis supprimer la ligne 20261016140000 de
-- supabase_migrations.schema_migrations). Les participants déjà ajoutés restent.

begin;

drop function if exists public.trip_add_editor(uuid, uuid);
drop index if exists public.trip_invites_pending_email_idx;
alter table public.trip_invites drop column if exists accepted_by, drop column if exists accepted_at;
delete from public.app_config where key = 'web_url';

commit;
