-- Phase 1 bis : socle serveur.
-- Tables internes, lues et écrites uniquement par les Edge Functions avec la
-- clé service_role (qui contourne RLS). RLS est activée SANS aucune règle
-- d'accès : les clés publiques (anon, authenticated) n'y ont aucun accès.

-- ---------------------------------------------------------------------------
-- Cache partagé des réponses des API externes.
-- key = source + paramètres normalisés, coordonnées arrondies à 0,01°
-- (_shared/cacheKey.js) : partagé entre utilisateurs, sans position exacte.
-- ---------------------------------------------------------------------------
create table public.api_cache (
  key text primary key,
  source text not null,
  value jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.api_cache is
  'Cache partagé des Edge Functions (clé = source + paramètres normalisés, coordonnées arrondies à 0,01°).';

create index api_cache_expires_at_idx on public.api_cache (expires_at);
alter table public.api_cache enable row level security;

-- ---------------------------------------------------------------------------
-- Surcharges des règles (supabase/functions/_shared/domain/config/rules.js),
-- modifiables depuis le tableau de bord sans redéploiement.
--   key   = chemin pointé d'une règle, ex. 'weather.rainThresholdPct'
--   value = valeur JSON du même type que la valeur par défaut, ex. 60
-- Clé réservée : 'minAppVersion' (valeur JSON "x.y.z").
-- Une surcharge au chemin inconnu ou au type incorrect est ignorée (journal).
-- ---------------------------------------------------------------------------
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_config is
  'Surcharges de rules.js (clé = chemin pointé, valeur JSON du même type) ; clé réservée minAppVersion ("x.y.z").';

alter table public.app_config enable row level security;

create function public.app_config_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_config_touch
  before update on public.app_config
  for each row execute function public.app_config_touch();

-- Toute modification de app_config invalide la configuration mise en cache
-- (clé 'config', cf. _shared/appConfig.js) : visible dès la requête suivante.
create function public.app_config_invalidate_cache()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.api_cache where key = 'config';
  return null;
end;
$$;

create trigger app_config_invalidate_cache
  after insert or update or delete on public.app_config
  for each statement execute function public.app_config_invalidate_cache();

-- ---------------------------------------------------------------------------
-- Limitation du nombre de requêtes (fenêtre fixe).
-- bucket = '<type>:u:<id utilisateur>' ou '<type>:ip:<empreinte salée de l'IP>'
-- (jamais l'adresse IP en clair).
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

create index rate_limits_window_start_idx on public.rate_limits (window_start);
alter table public.rate_limits enable row level security;

-- Incrémente atomiquement le compteur et renvoie la nouvelle valeur.
create function public.rate_limit_hit(p_bucket text, p_window_start timestamptz)
returns integer
language sql
set search_path = ''
as $$
  insert into public.rate_limits as r (bucket, window_start, count)
  values (p_bucket, p_window_start, 1)
  on conflict (bucket, window_start) do update set count = r.count + 1
  returning r.count;
$$;

-- ---------------------------------------------------------------------------
-- Droits : rien pour les rôles publics, en plus de RLS.
-- ---------------------------------------------------------------------------
revoke all on table public.api_cache, public.app_config, public.rate_limits from anon, authenticated;

revoke all on function public.rate_limit_hit(text, timestamptz) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, timestamptz) to service_role;

revoke all on function public.app_config_touch() from public, anon, authenticated;
revoke all on function public.app_config_invalidate_cache() from public, anon, authenticated;
