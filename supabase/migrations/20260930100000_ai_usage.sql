-- Quotas de la relecture du planning par une IA (_shared/ai, docs/ai-review.md).
-- Une ligne par jour (UTC) et par client : "u:<id utilisateur>" ou
-- "ip:<empreinte salée>" (comme rate_limits) ; la ligne client = '*' porte le
-- total du jour, tous clients confondus. Aucune donnée personnelle en clair.

create table public.ai_usage (
  day date not null,
  client text not null,
  calls integer not null default 0,
  tokens bigint not null default 0,
  primary key (day, client)
);

alter table public.ai_usage enable row level security;

-- Compte un appel si le client et le total du jour sont sous leurs limites ;
-- renvoie false sinon (rien n'est compté). Verrou par jour : deux appels
-- simultanés ne peuvent pas dépasser la limite globale.
create function public.ai_usage_reserve(p_day date, p_client text, p_user_limit integer, p_global_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_user integer;
  v_global integer;
begin
  perform pg_advisory_xact_lock(hashtext('ai_usage:' || p_day::text));
  select calls into v_global from public.ai_usage where day = p_day and client = '*';
  select calls into v_user from public.ai_usage where day = p_day and client = p_client;
  if coalesce(v_global, 0) >= p_global_limit or coalesce(v_user, 0) >= p_user_limit then
    return false;
  end if;
  insert into public.ai_usage as u (day, client, calls) values (p_day, p_client, 1), (p_day, '*', 1)
  on conflict (day, client) do update set calls = u.calls + 1;
  return true;
end;
$$;

-- Ajoute les jetons consommés par un appel (client et total du jour).
create function public.ai_usage_add_tokens(p_day date, p_client text, p_tokens bigint)
returns void
language sql
set search_path = ''
as $$
  update public.ai_usage set tokens = tokens + p_tokens where day = p_day and client in (p_client, '*');
$$;

revoke all on table public.ai_usage from anon, authenticated;
revoke all on function public.ai_usage_reserve(date, text, integer, integer) from public, anon, authenticated;
revoke all on function public.ai_usage_add_tokens(date, text, bigint) from public, anon, authenticated;
grant execute on function public.ai_usage_reserve(date, text, integer, integer) to service_role;
grant execute on function public.ai_usage_add_tokens(date, text, bigint) to service_role;

-- Compteurs gardés 90 jours (suivi des coûts), puis purgés.
select cron.schedule(
  'monguide-purge-ai-usage',
  '25 3 * * *',
  $$delete from public.ai_usage where day < current_date - 90$$
);
