-- Purge quotidienne du cache expiré et des anciens compteurs de requêtes.
-- À VÉRIFIER : l'extension pg_cron doit être disponible dans l'offre Supabase
-- utilisée (tableau de bord > Database > Extensions). Syntaxe d'activation
-- reprise de la documentation Supabase (schéma pg_catalog).
create extension if not exists pg_cron with schema pg_catalog;

-- cron.schedule avec un nom de tâche remplace une tâche existante du même nom.
select cron.schedule(
  'monguide-purge-api-cache',
  '15 3 * * *',
  $$delete from public.api_cache where expires_at < now()$$
);

select cron.schedule(
  'monguide-purge-rate-limits',
  '20 3 * * *',
  $$delete from public.rate_limits where window_start < now() - interval '1 day'$$
);
