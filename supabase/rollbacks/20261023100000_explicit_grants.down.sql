-- Retour arrière de supabase/migrations/20261023100000_explicit_grants.sql (à
-- exécuter à la main, puis supprimer la ligne 20261023100000 de
-- supabase_migrations.schema_migrations). Rend à service_role les droits par
-- défaut de Supabase (tous les droits) sur les objets du schéma public, et à
-- authenticated DELETE sur trips. Les droits retirés à anon et authenticated
-- (TRUNCATE, REFERENCES, TRIGGER, fonctions de déclencheur) ne sont pas
-- rendus : ils ne servaient à rien.

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
grant delete on table public.trips to authenticated;
