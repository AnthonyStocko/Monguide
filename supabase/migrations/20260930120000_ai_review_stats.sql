-- Compteurs anonymes de la relecture par l'assistant IA (docs/ai-review.md, Bloc G) :
-- une ligne par jour (UTC) et par métrique, SANS contenu ni identifiant de client.
-- Métriques : review:applied|unchanged|skipped, skipped:<raison>, review:not_attempted,
-- not_attempted:<raison>, duration:<tranche>, ops:applied, ops:rejected, rejected:<raison>,
-- model:<fournisseur>/<modèle>, revert:original, revert:reviewed.

create table public.ai_review_stats (
  day date not null,
  metric text not null,
  count bigint not null default 0,
  primary key (day, metric)
);

alter table public.ai_review_stats enable row level security;

-- Ajoute des quantités à plusieurs métriques du jour : { "review:applied": 1, "ops:applied": 2 }.
create function public.ai_stats_add(p_day date, p_metrics jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.ai_review_stats as s (day, metric, count)
  select p_day, key, value::bigint
  from jsonb_each_text(p_metrics)
  where key ~ '^[a-z_]+:[A-Za-z0-9_./:-]{1,80}$' and value ~ '^[0-9]{1,6}$'
  on conflict (day, metric) do update set count = s.count + excluded.count;
$$;

-- Taux par jour : relectures tentées, appliquées, sans changement, sautées ;
-- retours à la version d'origine rapportés aux relectures appliquées.
create view public.ai_review_rates with (security_invoker = true) as
select
  day,
  sum(count) filter (where metric in ('review:applied', 'review:unchanged', 'review:skipped')) as attempted,
  round(100.0 * sum(count) filter (where metric = 'review:applied') / nullif(sum(count) filter (where metric in ('review:applied', 'review:unchanged', 'review:skipped')), 0), 1) as applied_pct,
  round(100.0 * sum(count) filter (where metric = 'review:unchanged') / nullif(sum(count) filter (where metric in ('review:applied', 'review:unchanged', 'review:skipped')), 0), 1) as unchanged_pct,
  round(100.0 * sum(count) filter (where metric = 'review:skipped') / nullif(sum(count) filter (where metric in ('review:applied', 'review:unchanged', 'review:skipped')), 0), 1) as skipped_pct,
  round(100.0 * sum(count) filter (where metric = 'ops:rejected') / nullif(sum(count) filter (where metric in ('ops:applied', 'ops:rejected')), 0), 1) as rejected_ops_pct,
  round(100.0 * sum(count) filter (where metric = 'revert:original') / nullif(sum(count) filter (where metric = 'review:applied'), 0), 1) as revert_pct,
  sum(count) filter (where metric = 'review:not_attempted') as not_attempted
from public.ai_review_stats
group by day;

revoke all on table public.ai_review_stats from anon, authenticated;
revoke all on public.ai_review_rates from anon, authenticated;
revoke all on function public.ai_stats_add(date, jsonb) from public, anon, authenticated;
grant execute on function public.ai_stats_add(date, jsonb) to service_role;

-- Compteurs gardés un an (suivi du déploiement), puis purgés.
select cron.schedule(
  'monguide-purge-ai-review-stats',
  '30 3 * * *',
  $$delete from public.ai_review_stats where day < current_date - 365$$
);
