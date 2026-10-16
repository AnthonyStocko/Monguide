-- Prompt 8.0, Bloc B : modifications des séjours par opérations (fonction
-- trip-apply-ops, docs/api.md). La fonction lit la dernière version du
-- séjour, applique les opérations (domain/ops/applyOps.js), puis enregistre
-- avec trip_commit : dans UNE transaction, verrou de la ligne (select … for
-- update), vérification que la version n'a pas changé depuis la lecture
-- (sinon rien n'est écrit et la fonction recommence sur la nouvelle
-- version), écriture, version + 1, historique et identifiants des
-- opérations appliquées (idempotence). Réservé à la clé service_role.
--
-- Retour arrière : supabase/rollbacks/20261016120000_trip_ops.down.sql.

-- Opérations déjà appliquées : un renvoi après une coupure réseau (même
-- opId) est ignoré. Gardées 30 jours.
create table public.trip_applied_ops (
  op_id uuid primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  version integer not null,
  created_at timestamptz not null default now()
);

comment on table public.trip_applied_ops is 'Identifiants des opérations déjà appliquées (idempotence de trip-apply-ops), 30 jours.';

create index trip_applied_ops_trip_idx on public.trip_applied_ops (trip_id);
create index trip_applied_ops_created_idx on public.trip_applied_ops (created_at);

alter table public.trip_applied_ops enable row level security;
revoke all on table public.trip_applied_ops from anon, authenticated;

select cron.schedule(
  'monguide-purge-trip-applied-ops',
  '40 3 * * *',
  $$delete from public.trip_applied_ops where created_at < now() - interval '30 days'$$
);

-- Enregistre une nouvelle version si p_expected_version est toujours la
-- version courante. Renvoie la nouvelle version, ou aucune ligne si le
-- séjour a changé entre-temps (ou si une opération du lot vient d'être
-- appliquée par un appel simultané) : la fonction appelante recommence.
-- p_trip : colonnes title, destination, start_date, end_date, params,
-- planning, deleted (domain/tripRow.js).
create function public.trip_commit(
  p_trip_id uuid,
  p_expected_version integer,
  p_trip jsonb,
  p_author uuid,
  p_op_ids uuid[],
  p_op_type text,
  p_summary text
)
returns table (new_version integer, new_updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
  u timestamptz;
begin
  perform 1 from public.trips t where t.id = p_trip_id and t.version = p_expected_version for update;
  if not found then
    return;
  end if;

  update public.trips t
  set title = p_trip ->> 'title',
      destination = p_trip -> 'destination',
      start_date = (p_trip ->> 'start_date')::date,
      end_date = (p_trip ->> 'end_date')::date,
      params = p_trip -> 'params',
      planning = p_trip -> 'planning',
      deleted = coalesce((p_trip ->> 'deleted')::boolean, false),
      updated_at = now()
  where t.id = p_trip_id
  returning t.version, t.updated_at into v, u;

  insert into public.trip_applied_ops (op_id, trip_id, user_id, version)
  select o, p_trip_id, p_author, v from unnest(p_op_ids) as o;

  if p_summary is not null then
    insert into public.trip_changes (trip_id, version, author_id, op_type, summary)
    values (p_trip_id, v, p_author, p_op_type, p_summary);
  end if;

  return query select v, u;
exception
  when unique_violation then
    return;
end;
$$;

-- Crée un séjour (opération createTrip) avec p_owner comme owner
-- (déclencheur trips_add_owner). Aucune ligne renvoyée si l'identifiant
-- existe déjà.
create function public.trip_create(
  p_trip_id uuid,
  p_owner uuid,
  p_trip jsonb,
  p_op_ids uuid[],
  p_op_type text,
  p_summary text
)
returns table (new_version integer, new_updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
  u timestamptz;
begin
  insert into public.trips as t (id, user_id, title, destination, start_date, end_date, params, planning, created_at, updated_at, deleted)
  values (
    p_trip_id,
    p_owner,
    p_trip ->> 'title',
    p_trip -> 'destination',
    (p_trip ->> 'start_date')::date,
    (p_trip ->> 'end_date')::date,
    p_trip -> 'params',
    p_trip -> 'planning',
    coalesce((p_trip ->> 'created_at')::timestamptz, now()),
    now(),
    false
  )
  on conflict (id) do nothing
  returning t.version, t.updated_at into v, u;

  if v is null then
    return;
  end if;

  insert into public.trip_applied_ops (op_id, trip_id, user_id, version)
  select o, p_trip_id, p_owner, v from unnest(p_op_ids) as o;

  if p_summary is not null then
    insert into public.trip_changes (trip_id, version, author_id, op_type, summary)
    values (p_trip_id, v, p_owner, p_op_type, p_summary);
  end if;

  return query select v, u;
exception
  when unique_violation then
    return;
end;
$$;

revoke all on function public.trip_commit(uuid, integer, jsonb, uuid, uuid[], text, text) from public, anon, authenticated;
revoke all on function public.trip_create(uuid, uuid, jsonb, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.trip_commit(uuid, integer, jsonb, uuid, uuid[], text, text) to service_role;
grant execute on function public.trip_create(uuid, uuid, jsonb, uuid[], text, text) to service_role;
