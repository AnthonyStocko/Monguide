-- Événements de saison (Prompt 10.0, Phase D) : marchés de Noël,
-- illuminations, festivals, saisis à la main (tableau de bord Supabase,
-- README « Ajouter un événement de saison »), sans nouvelle version de
-- l'application. Lus par la fonction generate à chaque génération (aucun
-- cache) : un événement ajouté ou supprimé compte dès le séjour suivant.
-- Aucune date n'est inventée : un événement n'est proposé que s'il est ici.
--
-- Table interne : RLS sans règle d'accès, Edge Functions seulement (clé
-- service_role), comme fuel_prices_eu.
--
-- Retour arrière : supabase/rollbacks/20261030100000_seasonal_events.down.sql.

create table public.seasonal_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  city text not null check (length(trim(city)) between 1 and 80),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  start_date date not null,
  end_date date not null,
  -- Horaires d'ouverture en syntaxe OpenStreetMap, ex. 'Mo-Su 12:00-22:00' ; vide = inconnus.
  opening_hours text,
  type text not null check (type in ('christmas_market', 'illuminations', 'festival')),
  -- Durée de visite proposée, en minutes.
  duration_min integer not null default 60 check (duration_min between 10 and 480),
  url text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

comment on table public.seasonal_events is
  'Événements de saison proposés aux dates d''un séjour à proximité (fonction generate). type : christmas_market | illuminations | festival ; opening_hours : syntaxe OSM.';

create index seasonal_events_dates on public.seasonal_events (start_date, end_date);

alter table public.seasonal_events enable row level security;

revoke all on table public.seasonal_events from anon, authenticated, service_role;
grant select, insert, update, delete on table public.seasonal_events to service_role;
