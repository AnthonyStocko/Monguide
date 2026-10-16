-- Prompt 8.0, Bloc C : inviter et rejoindre (fonctions trip-invite-link,
-- trip-invite-email, trip-join, trip-invites-claim ; docs/api.md).
--
-- Retour arrière : supabase/rollbacks/20261016140000_trip_join.down.sql.

-- Invitation par e-mail acceptée : rattachée une seule fois, au compte qui
-- s'est connecté avec cette adresse (même s'il quitte ensuite le séjour).
alter table public.trip_invites
  add column accepted_at timestamptz,
  add column accepted_by uuid references auth.users (id) on delete set null;

comment on column public.trip_invites.accepted_at is 'Invitation e-mail rattachée (participant ajouté), une seule fois.';

-- Recherche par empreinte (lien) et par adresse (rattachement à la connexion).
create index trip_invites_pending_email_idx on public.trip_invites (email_normalized)
  where kind = 'email' and revoked_at is null and accepted_at is null;

-- Adresse de la version web : base des liens d'invitation, modifiable sans
-- redéploiement (clé réservée, supabase/functions/_shared/appConfig.js).
insert into public.app_config (key, value) values ('web_url', '"https://monguide.mgapp.workers.dev"')
on conflict (key) do nothing;

-- Ajout d'un participant (lien ou e-mail) : dans une transaction, verrou du
-- séjour, plafond de 10 (déclencheur trip_members_check_limit), ligne
-- d'historique « a rejoint le séjour ». Renvoie true si ajouté, false s'il
-- était déjà participant. Erreur trip_full si le séjour est complet.
create function public.trip_add_editor(p_trip_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  select t.version into v from public.trips t where t.id = p_trip_id and not t.deleted for update;
  if not found then
    raise exception 'trip_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.trip_members m where m.trip_id = p_trip_id and m.user_id = p_user_id) then
    return false;
  end if;
  insert into public.trip_members (trip_id, user_id, role, last_seen_version) values (p_trip_id, p_user_id, 'editor', v);
  insert into public.trip_changes (trip_id, version, author_id, op_type, summary) values (p_trip_id, v, p_user_id, 'join', 'a rejoint le séjour');
  return true;
end;
$$;

revoke all on function public.trip_add_editor(uuid, uuid) from public, anon, authenticated;
grant execute on function public.trip_add_editor(uuid, uuid) to service_role;
