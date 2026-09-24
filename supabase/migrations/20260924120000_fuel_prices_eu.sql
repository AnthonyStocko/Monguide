-- Phase 2 bis : prix des carburants hors de France (Bulletin pétrolier
-- hebdomadaire de la Commission européenne), remplis chaque semaine par la
-- fonction fuel-eu-refresh. Table interne : RLS sans aucune règle d'accès.
create table public.fuel_prices_eu (
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  fuel text not null check (fuel in ('sp95', 'diesel', 'lpg')),
  -- prix moyen national TTC par litre, dans la monnaie du pays
  price numeric(10, 4) not null check (price > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  -- même prix en euros (valeur du bulletin)
  price_eur numeric(10, 4) not null check (price_eur > 0),
  bulletin_date date not null,
  -- date des taux de change BCE utilisés pour la conversion
  exchange_rate_date date not null,
  updated_at timestamptz not null default now(),
  primary key (country_code, fuel, bulletin_date)
);

comment on table public.fuel_prices_eu is
  'Prix moyens nationaux des carburants (Bulletin pétrolier UE), convertis dans la monnaie du pays (taux BCE).';

create index fuel_prices_eu_latest_idx on public.fuel_prices_eu (country_code, bulletin_date desc);
alter table public.fuel_prices_eu enable row level security;
revoke all on table public.fuel_prices_eu from anon, authenticated;
