-- Prompt 8.0, Bloc D : modifications des autres en direct.
--  - trip_changes publiée dans Supabase Realtime : un participant ouvert sur
--    le séjour reçoit chaque nouvelle ligne (Realtime applique la RLS de
--    trip_changes : un non-participant ne reçoit rien) ;
--  - étapes touchées et nombre de modifications de chaque ligne (mise en
--    évidence, « Paul a fait 3 modifications ») ;
--  - dernière version vue par chaque participant (bandeau « 4 modifications
--    depuis votre dernière visite ») ;
--  - version web installée : « Paul a modifié votre séjour », au plus une
--    fois par heure et par séjour, si l'appareil l'a activé (désactivé par
--    défaut). Envoi par la file des rappels (scheduled_reminders, push-send).
--
-- Retour arrière : supabase/rollbacks/20261016160000_trip_live.down.sql.

alter table public.trip_changes
  add column step_ids text[] not null default '{}' check (cardinality(step_ids) <= 100),
  add column summary_count integer not null default 1 check (summary_count >= 1);

comment on column public.trip_changes.step_ids is 'Étapes touchées par le lot (mise en évidence chez les autres participants).';
comment on column public.trip_changes.summary_count is 'Nombre de modifications résumées dans la ligne.';

alter publication supabase_realtime add table public.trip_changes;

-- trip_commit avec étapes touchées et nombre de modifications (la version à
-- 7 paramètres reste pour une fonction pas encore redéployée).
create function public.trip_commit(
  p_trip_id uuid,
  p_expected_version integer,
  p_trip jsonb,
  p_author uuid,
  p_op_ids uuid[],
  p_op_type text,
  p_summary text,
  p_step_ids text[],
  p_summary_count integer
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
    insert into public.trip_changes (trip_id, version, author_id, op_type, summary, step_ids, summary_count)
    values (p_trip_id, v, p_author, p_op_type, p_summary, coalesce(p_step_ids[1:100], '{}'), greatest(coalesce(p_summary_count, 1), 1));
  end if;

  return query select v, u;
exception
  when unique_violation then
    return;
end;
$$;

revoke all on function public.trip_commit(uuid, integer, jsonb, uuid, uuid[], text, text, text[], integer) from public, anon, authenticated;
grant execute on function public.trip_commit(uuid, integer, jsonb, uuid, uuid[], text, text, text[], integer) to service_role;

-- Dernière version vue : chacun met à jour la sienne, et rien d'autre.
grant update (last_seen_version) on table public.trip_members to authenticated;

create policy "trip_members_update_seen_self" on public.trip_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- « Paul a modifié votre séjour » (version web) : réglage de l'appareil.
alter table public.push_subscriptions add column notify_trip_changes boolean not null default false;

-- Met en file la notification des autres participants (appareils web qui
-- l'ont activée, compte connecté) : au plus une par heure et par séjour et
-- par appareil ; déjà en attente : inchangée. Clé négative (les rappels du
-- séjour ont des clés positives) ; trip_id "changes:<séjour>" : jamais
-- touché par push-schedule, qui ne gère que les rappels.
create function public.trip_queue_change_pushes(p_trip_id uuid, p_author uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  v_key integer := -((abs(hashtext('changes:' || p_trip_id::text)) % 2147483646) + 1);
  v_author text := coalesce((select p.display_name from public.profiles p where p.user_id = p_author), '');
  v_title text := (select t.title from public.trips t where t.id = p_trip_id);
begin
  insert into public.scheduled_reminders as r (device_id, trip_id, reminder_key, send_at, title, body, url)
  select
    s.device_id,
    'changes:' || p_trip_id::text,
    v_key,
    now(),
    'Mon guide',
    case
      when s.lang like 'fr%' and v_author <> '' then v_author || ' a modifié votre séjour « ' || v_title || ' »'
      when s.lang like 'fr%' then 'Votre séjour « ' || v_title || ' » a été modifié'
      when v_author <> '' then v_author || ' changed your trip “' || v_title || '”'
      else 'Your trip “' || v_title || '” was changed'
    end,
    '/planning/' || p_trip_id::text
  from public.push_subscriptions s
  join public.trip_members m on m.user_id = s.user_id and m.trip_id = p_trip_id
  where s.notify_trip_changes and s.user_id <> p_author
  on conflict (device_id, reminder_key) do update
    set send_at = excluded.send_at, sent_at = null, title = excluded.title, body = excluded.body, url = excluded.url
    where r.sent_at is not null and r.sent_at < now() - interval '1 hour';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.trip_queue_change_pushes(uuid, uuid) from public, anon, authenticated;
grant execute on function public.trip_queue_change_pushes(uuid, uuid) to service_role;
