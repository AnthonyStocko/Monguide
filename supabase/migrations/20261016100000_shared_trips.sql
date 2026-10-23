-- Prompt 8.0, Bloc A : séjours partagés, modèle de données et sécurité.
--
-- Participants (trip_members : owner ou editor, 10 au plus), invitations
-- (trip_invites, empreinte SHA-256 du jeton seulement), historique lisible
-- (trip_changes, 200 dernières entrées par séjour), profils (profiles),
-- numéro de version des séjours (trips.version) et identifiants stables des
-- journées (domain/stableId.js, schemaVersion 3).
--
-- Écriture des séjours : à partir du Bloc B, uniquement par la fonction
-- serveur qui applique les opérations. En attendant, et tant que des
-- versions publiées de l'application écrivent directement (upsert de
-- services/sync.js), l'ancien chemin reste ouvert au seul owner d'un séjour
-- NON partagé (politiques *_legacy ci-dessous, à supprimer au Bloc B). Un
-- séjour partagé n'est jamais modifiable directement.
--
-- Retour arrière : supabase/rollbacks/20261016100000_shared_trips.down.sql.

create extension if not exists "uuid-ossp" with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Identifiants stables des journées et des étapes (schemaVersion 3).
--    Même calcul que domain/stableId.js : UUID version 5 de
--    "day:<trip>:<date>" et "step:<trip>:<date>:<position>". Seuls les
--    identifiants manquants sont ajoutés ; ni schemaVersion ni updated_at ne
--    changent (les appareils font la même migration à la lecture et
--    trouvent les mêmes identifiants).
-- ---------------------------------------------------------------------------
create function public.with_day_ids(p_trip_id uuid, p_days jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_days) <> 'array' then p_days else (
    select coalesce(jsonb_agg(
      d || jsonb_build_object(
        'id', coalesce(nullif(d ->> 'id', ''), extensions.uuid_generate_v5('6f1c9a52-3b7e-4d2a-9c58-0e4b7d1f2a63'::uuid, 'day:' || p_trip_id || ':' || (d ->> 'date'))::text),
        'steps', (
          select coalesce(jsonb_agg(
            case when coalesce(s ->> 'id', '') <> '' then s
            else s || jsonb_build_object('id', extensions.uuid_generate_v5('6f1c9a52-3b7e-4d2a-9c58-0e4b7d1f2a63'::uuid, 'step:' || p_trip_id || ':' || (d ->> 'date') || ':' || (i - 1))::text)
            end order by i), '[]'::jsonb)
          from jsonb_array_elements(coalesce(d -> 'steps', '[]'::jsonb)) with ordinality as st (s, i)
        )
      ) order by n), '[]'::jsonb)
    from jsonb_array_elements(p_days) with ordinality as dy (d, n)
  ) end
$$;

revoke all on function public.with_day_ids(uuid, jsonb) from public, anon, authenticated;

update public.trips
set
  planning = public.with_day_ids(id, planning),
  params = case when jsonb_typeof(params -> 'review') <> 'object' then params else
    params || jsonb_build_object('review',
      (params -> 'review')
      || case when jsonb_typeof(params #> '{review,originalDays}') = 'array'
           then jsonb_build_object('originalDays', public.with_day_ids(id, params #> '{review,originalDays}')) else '{}'::jsonb end
      || case when jsonb_typeof(params #> '{review,reviewedDays}') = 'array'
           then jsonb_build_object('reviewedDays', public.with_day_ids(id, params #> '{review,reviewedDays}')) else '{}'::jsonb end)
  end
where not deleted;

-- ---------------------------------------------------------------------------
-- 2. Numéro de version des séjours : 1 à la création, +1 à chaque
--    modification, toujours fixé par la base (jamais par l'appareil).
-- ---------------------------------------------------------------------------
alter table public.trips add column version integer not null default 1;

comment on column public.trips.user_id is 'Owner du séjour (même valeur que la ligne owner de trip_members).';
comment on column public.trips.version is 'Version du séjour, incrémentée par la base à chaque modification.';

create function public.trips_set_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := case when tg_op = 'INSERT' then 1 else old.version + 1 end;
  return new;
end;
$$;

create trigger trips_set_version
  before insert or update on public.trips
  for each row execute function public.trips_set_version();

-- ---------------------------------------------------------------------------
-- 3. Profils : prénom (demandé au premier partage) et couleur de pastille.
--    Pas de photo.
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(display_name) between 1 and 40 and display_name = btrim(display_name) and display_name !~ '[[:cntrl:]]'),
  -- Nom d'une couleur de la palette de l'application (ex. "teal"), jamais une valeur CSS libre.
  avatar_color text check (avatar_color ~ '^[a-z][a-z0-9-]{0,23}$'),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Prénom et couleur affichés aux autres participants des séjours partagés.';

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Participants. Un seul owner par séjour, 10 participants au plus.
-- ---------------------------------------------------------------------------
create table public.trip_members (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  joined_at timestamptz not null default now(),
  -- Dernière version du séjour vue par ce participant (« modifié depuis votre dernière visite »).
  last_seen_version integer not null default 0 check (last_seen_version >= 0),
  primary key (trip_id, user_id)
);

comment on table public.trip_members is 'Participants des séjours (owner : créateur ; editor : invité).';

create unique index trip_members_one_owner_idx on public.trip_members (trip_id) where role = 'owner';
create index trip_members_user_idx on public.trip_members (user_id);

-- Propriétaire actuel de chaque séjour existant.
insert into public.trip_members (trip_id, user_id, role, joined_at, last_seen_version)
select id, user_id, 'owner', created_at, version from public.trips;

-- Plafond de participants. Verrou sur le séjour : deux arrivées simultanées
-- ne peuvent pas dépasser le plafond.
create function public.trip_members_check_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.trips where id = new.trip_id for update;
  if (select count(*) from public.trip_members where trip_id = new.trip_id) >= 10 then
    raise exception 'trip_full' using errcode = 'P0001', detail = 'A trip has at most 10 participants';
  end if;
  return new;
end;
$$;

create trigger trip_members_check_limit
  before insert on public.trip_members
  for each row execute function public.trip_members_check_limit();

-- Tout nouveau séjour a son créateur comme owner.
create function public.trips_add_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trip_members (trip_id, user_id, role, joined_at, last_seen_version)
  values (new.id, new.user_id, 'owner', now(), new.version)
  on conflict (trip_id, user_id) do nothing;
  return new;
end;
$$;

create trigger trips_add_owner
  after insert on public.trips
  for each row execute function public.trips_add_owner();

-- ---------------------------------------------------------------------------
-- 5. Invitations : par lien (jeton aléatoire, seule son empreinte SHA-256 en
--    hexadécimal est gardée) ou réservées à une adresse e-mail (aucun e-mail
--    n'est envoyé : l'invitation apparaît quand la personne se connecte avec
--    cette adresse). Valables 7 jours, désactivables, utilisables plusieurs fois.
-- ---------------------------------------------------------------------------
create table public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  kind text not null check (kind in ('link', 'email')),
  token_hash text unique check (token_hash ~ '^[0-9a-f]{64}$'),
  email_normalized text
    check (email_normalized = lower(btrim(email_normalized)) and char_length(email_normalized) between 3 and 254 and email_normalized ~ '^[^@\s]+@[^@\s]+$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  uses integer not null default 0 check (uses >= 0),
  check (
    (kind = 'link' and token_hash is not null and email_normalized is null)
    or (kind = 'email' and email_normalized is not null and token_hash is null)
  ),
  check (expires_at > created_at)
);

comment on table public.trip_invites is 'Invitations aux séjours partagés (jeton jamais stocké en clair).';

create index trip_invites_trip_idx on public.trip_invites (trip_id);
create index trip_invites_email_idx on public.trip_invites (email_normalized) where kind = 'email' and revoked_at is null;

-- Désactivation définitive, à l'heure du serveur.
create function public.trip_invites_guard_revocation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'invite_revoked' using errcode = 'P0001', detail = 'A revoked invite cannot be reactivated';
  end if;
  if old.revoked_at is null and new.revoked_at is not null then
    new.revoked_at := now();
  end if;
  return new;
end;
$$;

create trigger trip_invites_guard_revocation
  before update on public.trip_invites
  for each row execute function public.trip_invites_guard_revocation();

-- ---------------------------------------------------------------------------
-- 6. Historique lisible des modifications. author_id devient NULL quand le
--    compte est supprimé (affiché « Ancien participant »).
-- ---------------------------------------------------------------------------
create table public.trip_changes (
  id bigserial primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  version integer not null,
  author_id uuid references auth.users (id) on delete set null,
  op_type text not null check (op_type ~ '^[a-z][a-z_.]{0,39}$'),
  summary text not null default '' check (char_length(summary) <= 280),
  created_at timestamptz not null default now()
);

comment on table public.trip_changes is 'Historique des modifications des séjours (200 dernières par séjour).';

create index trip_changes_trip_idx on public.trip_changes (trip_id, id desc);

create function public.purge_trip_changes(p_keep integer default 200)
returns integer
language sql
set search_path = ''
as $$
  with old as (
    select id
    from (select id, row_number() over (partition by trip_id order by id desc) as rank from public.trip_changes) ranked
    where rank > p_keep
  ),
  gone as (
    delete from public.trip_changes c using old where c.id = old.id returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.purge_trip_changes(integer) from public, anon, authenticated;

select cron.schedule(
  'monguide-purge-trip-changes',
  '35 3 * * *',
  $$select public.purge_trip_changes(200)$$
);

-- ---------------------------------------------------------------------------
-- 7. Fonctions d'accès utilisées par les politiques. SECURITY DEFINER : elles
--    lisent trip_members sans repasser par ses propres politiques (pas de
--    récursion) ; elles ne renseignent que sur l'utilisateur appelant.
-- ---------------------------------------------------------------------------
create function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.trip_members m where m.trip_id = p_trip_id and m.user_id = (select auth.uid()));
$$;

create function public.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.trip_members m where m.trip_id = p_trip_id and m.user_id = (select auth.uid()) and m.role = 'owner');
$$;

-- Séjour partagé : au moins un participant en plus de l'owner. Ne répond
-- qu'à un participant (sinon false) : rien n'est révélé d'un séjour étranger.
create function public.is_trip_shared(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_trip_member(p_trip_id) and (select count(*) from public.trip_members m where m.trip_id = p_trip_id) > 1;
$$;

-- L'appelant partage au moins un séjour avec p_user_id.
create function public.shares_trip_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members mine
    join public.trip_members theirs on theirs.trip_id = mine.trip_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

revoke all on function public.is_trip_member(uuid), public.is_trip_owner(uuid), public.is_trip_shared(uuid), public.shares_trip_with(uuid) from public, anon;
grant execute on function public.is_trip_member(uuid), public.is_trip_owner(uuid), public.is_trip_shared(uuid), public.shares_trip_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Politiques RLS.
-- ---------------------------------------------------------------------------

-- Séjours : lecture par les participants ; suppression par l'owner ;
-- aucune écriture directe d'un séjour partagé.
drop policy "trips_select_own" on public.trips;
drop policy "trips_insert_own" on public.trips;
drop policy "trips_update_own" on public.trips;
drop policy "trips_delete_own" on public.trips;

-- user_id = auth.uid() : l'owner voit aussi la ligne qu'il est en train de
-- créer, avant que trips_add_owner ne l'inscrive (upsert).
create policy "trips_select_member" on public.trips
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_trip_member(id));

create policy "trips_delete_owner" on public.trips
  for delete to authenticated
  using (public.is_trip_owner(id));

-- Ancien chemin d'écriture (à supprimer au Bloc B) : l'owner d'un séjour non
-- partagé crée et modifie ses séjours comme avant.
create policy "trips_insert_legacy" on public.trips
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "trips_update_legacy" on public.trips
  for update to authenticated
  using (user_id = (select auth.uid()) and not public.is_trip_shared(id))
  with check (user_id = (select auth.uid()));

-- Participants : lecture entre participants du même séjour ; aucune
-- insertion ni modification depuis le client (fonctions serveur) ; quitter
-- (sa ligne) ou retirer (owner), jamais la ligne owner.
alter table public.trip_members enable row level security;
revoke all on table public.trip_members from anon, authenticated;
grant select, delete on table public.trip_members to authenticated;
grant select, insert, update, delete on table public.trip_members to service_role;

create policy "trip_members_select_member" on public.trip_members
  for select to authenticated
  using (public.is_trip_member(trip_id));

create policy "trip_members_delete_self_or_owner" on public.trip_members
  for delete to authenticated
  using (role <> 'owner' and (user_id = (select auth.uid()) or public.is_trip_owner(trip_id)));

-- Invitations : lecture et désactivation (revoked_at seulement) par l'owner.
alter table public.trip_invites enable row level security;
revoke all on table public.trip_invites from anon, authenticated;
grant select on table public.trip_invites to authenticated;
grant update (revoked_at) on table public.trip_invites to authenticated;
grant select, insert, update, delete on table public.trip_invites to service_role;

create policy "trip_invites_select_owner" on public.trip_invites
  for select to authenticated
  using (public.is_trip_owner(trip_id));

create policy "trip_invites_revoke_owner" on public.trip_invites
  for update to authenticated
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id));

-- Historique : lecture par les participants ; écriture par le serveur seulement.
alter table public.trip_changes enable row level security;
revoke all on table public.trip_changes from anon, authenticated;
revoke all on sequence public.trip_changes_id_seq from anon, authenticated;
grant select on table public.trip_changes to authenticated;
grant select, insert, update, delete on table public.trip_changes to service_role;
grant usage, select on sequence public.trip_changes_id_seq to service_role;

create policy "trip_changes_select_member" on public.trip_changes
  for select to authenticated
  using (public.is_trip_member(trip_id));

-- Profils : chacun lit, crée et modifie le sien ; lit le prénom et la
-- couleur des personnes avec qui il partage au moins un séjour.
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant insert (user_id, display_name, avatar_color) on table public.profiles to authenticated;
grant update (display_name, avatar_color) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

create policy "profiles_select_self_or_co_member" on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_trip_with(user_id));

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 9. Suppression d'un compte (fonction delete-account ou tableau de bord) :
--    chaque séjour dont il est owner passe au participant le plus ancien ;
--    s'il est seul, le séjour est supprimé. Ses lignes trip_members partent
--    ensuite en cascade ; son historique reste, sans auteur.
-- ---------------------------------------------------------------------------
create function public.transfer_trips_on_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owned uuid;
  heir uuid;
begin
  for owned in select m.trip_id from public.trip_members m where m.user_id = old.id and m.role = 'owner' loop
    heir := null;
    select m.user_id into heir
    from public.trip_members m
    where m.trip_id = owned and m.user_id <> old.id
    order by m.joined_at, m.user_id
    limit 1;
    if heir is null then
      delete from public.trips where id = owned;
    else
      delete from public.trip_members where trip_id = owned and user_id = old.id;
      update public.trip_members set role = 'owner' where trip_id = owned and user_id = heir;
      update public.trips set user_id = heir where id = owned;
    end if;
  end loop;
  return old;
end;
$$;

revoke all on function public.transfer_trips_on_account_deletion() from public, anon, authenticated;

create trigger monguide_transfer_trips_on_account_deletion
  before delete on auth.users
  for each row execute function public.transfer_trips_on_account_deletion();
