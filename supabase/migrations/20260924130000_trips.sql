-- Phase 5 bis : séjours des utilisateurs connectés, synchronisés entre appareils.
-- Correspondance avec le modèle (domain/tripRow.js) : planning = days ;
-- params = le reste du séjour. updated_at est l'horodatage de la dernière
-- modification sur l'appareil (conflit : le plus récent l'emporte).
create table public.trips (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  destination jsonb not null,
  start_date date not null,
  end_date date not null,
  params jsonb not null default '{}'::jsonb,
  planning jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  -- Suppression logique, propagée aux autres appareils par la synchronisation.
  deleted boolean not null default false
);

comment on table public.trips is 'Séjours des utilisateurs connectés (synchronisation entre appareils).';

create index trips_user_updated_idx on public.trips (user_id, updated_at);

-- RLS : un utilisateur ne lit, ne crée, ne modifie et ne supprime que ses propres séjours.
alter table public.trips enable row level security;

create policy "trips_select_own" on public.trips
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "trips_insert_own" on public.trips
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "trips_update_own" on public.trips
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "trips_delete_own" on public.trips
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Aucun accès en mode invité (clé publique seule).
revoke all on table public.trips from anon;
grant select, insert, update, delete on table public.trips to authenticated;
