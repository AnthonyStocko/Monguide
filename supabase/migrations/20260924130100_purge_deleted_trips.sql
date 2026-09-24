-- Purge quotidienne des marqueurs de séjours supprimés (sans contenu, voir
-- domain/tripRow.js). Le délai laisse aux autres appareils le temps de
-- recevoir la suppression ; il reprend rules.sync.deletedRetentionDays (90 jours).
select cron.schedule(
  'monguide-purge-deleted-trips',
  '25 3 * * *',
  $$delete from public.trips where deleted and updated_at < now() - interval '90 days'$$
);
