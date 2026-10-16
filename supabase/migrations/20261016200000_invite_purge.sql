-- Prompt 8.0, Phase F : durée de conservation des invitations.
--  - Invitation e-mail : l'adresse est effacée dès que l'invitation est
--    rattachée, désactivée ou expirée (30 jours après la dernière
--    invitation), soit 30 jours au plus (politique de confidentialité).
--  - Lien : empreinte effacée 30 jours après son expiration ou sa
--    désactivation (aucune donnée personnelle, rangement).
-- Toutes les heures.
--
-- Retour arrière : supabase/rollbacks/20261016200000_invite_purge.down.sql.

create function public.purge_trip_invites()
returns integer
language sql
set search_path = ''
as $$
  with gone as (
    delete from public.trip_invites i
    where (i.kind = 'email' and (i.accepted_at is not null or i.revoked_at is not null or i.expires_at <= now()))
       or (i.kind = 'link' and (i.expires_at <= now() - interval '30 days' or i.revoked_at <= now() - interval '30 days'))
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.purge_trip_invites() from public, anon, authenticated;

select cron.schedule(
  'monguide-purge-trip-invites',
  '20 * * * *',
  $$select public.purge_trip_invites()$$
);
