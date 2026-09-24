-- Déclenchement hebdomadaire de la fonction fuel-eu-refresh (pg_cron + pg_net),
-- selon la méthode documentée par Supabase ("Scheduling Edge Functions").
-- Le bulletin est publié en début de semaine : lancement le mercredi à 06:00 UTC.
--
-- Deux secrets doivent exister dans Vault (jamais dans le dépôt), créés une
-- fois depuis le SQL Editor :
--   select vault.create_secret('https://<ref>.supabase.co', 'monguide_project_url');
--   select vault.create_secret('<clé service_role>', 'monguide_service_role_key');
-- Sans eux, la tâche échoue sans effet (la dernière version reste utilisée).
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'monguide-fuel-eu-refresh',
  '0 6 * * 3',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'monguide_project_url') || '/functions/v1/fuel-eu-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'monguide_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
