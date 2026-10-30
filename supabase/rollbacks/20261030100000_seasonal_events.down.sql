-- Retour arrière de supabase/migrations/20261030100000_seasonal_events.sql (à
-- exécuter à la main, puis supprimer la ligne 20261030100000 de
-- supabase_migrations.schema_migrations). Les événements saisis sont perdus.

drop table if exists public.seasonal_events;
