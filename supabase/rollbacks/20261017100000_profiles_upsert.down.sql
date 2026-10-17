-- Retour arrière de supabase/migrations/20261017100000_profiles_upsert.sql (à
-- exécuter à la main, puis supprimer la ligne 20261017100000 de
-- supabase_migrations.schema_migrations). L'enregistrement du prénom par
-- l'application échoue de nouveau.

revoke update (user_id) on table public.profiles from authenticated;
