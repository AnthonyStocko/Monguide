-- Droits explicites sur tout le schéma public (règle Supabase du 30 octobre
-- 2026 : les nouvelles tables de public ne reçoivent plus automatiquement de
-- droits pour anon, authenticated et service_role). Cette migration écrit
-- les droits STRICTEMENT nécessaires de chaque objet existant, pour que
-- « supabase db reset » et les branches de prévisualisation recréent une base
-- fonctionnelle, et retire les droits par défaut restés en trop.
--
-- Méthode : pour chaque objet, tout retirer aux trois rôles puis accorder
-- exactement ce qu'il faut. Rejouable sans erreur, même résultat à chaque fois.
-- La RLS reste activée partout : les GRANT ne la remplacent pas.
--
-- Règle pour la suite (README, « Droits d'accès aux tables ») : toute
-- migration qui crée une table contient, dans le même fichier, ENABLE ROW
-- LEVEL SECURITY, ses politiques et ses GRANT. Vérifié en CI par
-- supabase/tests/database/grants.test.sql.
--
-- Retour arrière : supabase/rollbacks/20261023100000_explicit_grants.down.sql.

-- ---------------------------------------------------------------------------
-- 1. Tables internes : Edge Functions seulement (clé service_role).
-- ---------------------------------------------------------------------------
revoke all on table
  public.api_cache, public.app_config, public.rate_limits, public.fuel_prices_eu,
  public.ai_usage, public.ai_review_stats, public.push_subscriptions,
  public.scheduled_reminders, public.trip_applied_ops
from anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.api_cache, public.app_config, public.rate_limits, public.fuel_prices_eu,
  public.ai_usage, public.ai_review_stats, public.push_subscriptions,
  public.scheduled_reminders, public.trip_applied_ops
to service_role;

-- Vue des taux de relecture (security_invoker) : lecture seule.
revoke all on table public.ai_review_rates from anon, authenticated, service_role;
grant select on table public.ai_review_rates to service_role;

-- ---------------------------------------------------------------------------
-- 2. Séjours. L'application lit (RLS : participants) et écrit par la
--    fonction trip-apply-ops. INSERT et UPDATE restent pour l'upsert direct
--    de l'application 1.1.0 (politiques trips_insert_legacy et
--    trips_update_legacy) : à retirer quand minAppVersion passera à 1.2.0.
--    DELETE, TRUNCATE, REFERENCES, TRIGGER : jamais utilisés, retirés.
-- ---------------------------------------------------------------------------
revoke all on table public.trips from anon, authenticated, service_role;
grant select, insert, update on table public.trips to authenticated;
grant select, insert, update, delete on table public.trips to service_role;

-- ---------------------------------------------------------------------------
-- 3. Séjours partagés (Prompt 8.0) : mêmes droits authenticated qu'avant.
-- ---------------------------------------------------------------------------
-- Participants : lire, quitter ou retirer, dernière version vue.
revoke all on table public.trip_members from anon, authenticated, service_role;
grant select, delete on table public.trip_members to authenticated;
grant update (last_seen_version) on table public.trip_members to authenticated;
grant select, insert, update, delete on table public.trip_members to service_role;

-- Invitations : lecture et désactivation par l'owner.
revoke all on table public.trip_invites from anon, authenticated, service_role;
grant select on table public.trip_invites to authenticated;
grant update (revoked_at) on table public.trip_invites to authenticated;
grant select, insert, update, delete on table public.trip_invites to service_role;

-- Historique : lecture (et Supabase Realtime) par les participants.
revoke all on table public.trip_changes from anon, authenticated, service_role;
grant select on table public.trip_changes to authenticated;
grant select, insert, update, delete on table public.trip_changes to service_role;

-- Profils : lecture, upsert du prénom (user_id dans le SET, voir
-- 20261017100000_profiles_upsert.sql).
revoke all on table public.profiles from anon, authenticated, service_role;
grant select on table public.profiles to authenticated;
grant insert (user_id, display_name, avatar_color) on table public.profiles to authenticated;
grant update (user_id, display_name, avatar_color) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- 4. Séquences.
-- ---------------------------------------------------------------------------
revoke all on sequence public.trip_changes_id_seq, public.scheduled_reminders_id_seq from anon, authenticated, service_role;
grant usage, select on sequence public.trip_changes_id_seq, public.scheduled_reminders_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- 5. Fonctions. EXECUTE est aussi accordé à PUBLIC par Postgres : retiré.
-- ---------------------------------------------------------------------------
-- Appelées par les Edge Functions.
revoke all on function
  public.rate_limit_hit(text, timestamptz),
  public.ai_usage_reserve(date, text, integer, integer),
  public.ai_usage_add_tokens(date, text, bigint),
  public.ai_stats_add(date, jsonb),
  public.push_claim_due(interval, integer),
  public.trip_commit(uuid, integer, jsonb, uuid, uuid[], text, text),
  public.trip_commit(uuid, integer, jsonb, uuid, uuid[], text, text, text[], integer),
  public.trip_create(uuid, uuid, jsonb, uuid[], text, text),
  public.trip_add_editor(uuid, uuid),
  public.trip_queue_change_pushes(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.rate_limit_hit(text, timestamptz),
  public.ai_usage_reserve(date, text, integer, integer),
  public.ai_usage_add_tokens(date, text, bigint),
  public.ai_stats_add(date, jsonb),
  public.push_claim_due(interval, integer),
  public.trip_commit(uuid, integer, jsonb, uuid, uuid[], text, text),
  public.trip_commit(uuid, integer, jsonb, uuid, uuid[], text, text, text[], integer),
  public.trip_create(uuid, uuid, jsonb, uuid[], text, text),
  public.trip_add_editor(uuid, uuid),
  public.trip_queue_change_pushes(uuid, uuid)
to service_role;

-- Utilisées par les politiques RLS (évaluées avec les droits de l'appelant).
-- service_role contourne la RLS : pas besoin.
revoke all on function
  public.is_trip_member(uuid), public.is_trip_owner(uuid),
  public.is_trip_shared(uuid), public.shares_trip_with(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.is_trip_member(uuid), public.is_trip_owner(uuid),
  public.is_trip_shared(uuid), public.shares_trip_with(uuid)
to authenticated;

-- Déclencheurs (droit vérifié à la création du déclencheur seulement),
-- pg_cron (rôle postgres) et migrations : personne.
revoke all on function
  public.app_config_touch(),
  public.app_config_invalidate_cache(),
  public.trips_set_version(),
  public.touch_updated_at(),
  public.trip_members_check_limit(),
  public.trips_add_owner(),
  public.trip_invites_guard_revocation(),
  public.transfer_trips_on_account_deletion(),
  public.with_day_ids(uuid, jsonb),
  public.purge_trip_changes(integer),
  public.purge_trip_invites()
from public, anon, authenticated, service_role;
