-- Rappels de la version web (Web Push), voir docs/api.md : push-subscribe,
-- push-schedule, push-send. Un navigateur ne sait pas programmer une
-- notification : l'application envoie la liste des rappels attendus, le
-- serveur les envoie à l'heure prévue. L'application Android n'utilise pas
-- ces tables (notifications locales).
--
-- RLS activée sans règle : aucun accès direct, seules les Edge Functions
-- (clé service_role) lisent et écrivent.

-- Un abonnement par appareil. device_id : identifiant aléatoire créé par
-- l'application, connu de cet appareil seulement.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique check (char_length(device_id) between 16 and 64),
  -- Compte connecté au moment de l'abonnement (facultatif) ; supprimé avec le compte.
  user_id uuid references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  lang text not null default 'fr',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Rappels à envoyer. reminder_key : identifiant stable d'un rappel (même
-- calcul que sur Android, domain/notificationPlan.js) : reprogrammer un
-- séjour ne crée jamais de doublon. Le texte ne contient ni adresse ni titre
-- d'étape personnelle (mis en forme par l'application).
create table public.scheduled_reminders (
  id bigint generated always as identity primary key,
  device_id text not null references public.push_subscriptions (device_id) on delete cascade,
  trip_id text not null,
  reminder_key integer not null,
  send_at timestamptz not null,
  title text not null,
  body text not null,
  url text not null,
  sent_at timestamptz,
  unique (device_id, reminder_key)
);

create index scheduled_reminders_due_idx on public.scheduled_reminders (send_at) where sent_at is null;
create index scheduled_reminders_trip_idx on public.scheduled_reminders (device_id, trip_id);

alter table public.push_subscriptions enable row level security;
alter table public.scheduled_reminders enable row level security;
revoke all on table public.push_subscriptions, public.scheduled_reminders from anon, authenticated;

-- Réserve les rappels à envoyer maintenant (send_at passé depuis moins de
-- p_window) en les marquant envoyés, et les renvoie avec l'abonnement de leur
-- appareil. Verrou par ligne (skip locked) : deux exécutions simultanées
-- n'envoient jamais le même rappel.
create function public.push_claim_due(p_window interval, p_limit integer)
returns table (id bigint, device_id text, reminder_key integer, title text, body text, url text, endpoint text, p256dh text, auth text)
language sql
set search_path = ''
as $$
  with due as (
    select r.id
    from public.scheduled_reminders r
    where r.sent_at is null and r.send_at <= now() and r.send_at > now() - p_window
    order by r.send_at
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update public.scheduled_reminders r
    set sent_at = now()
    from due
    where r.id = due.id
    returning r.id, r.device_id, r.reminder_key, r.title, r.body, r.url
  )
  select c.id, c.device_id, c.reminder_key, c.title, c.body, c.url, s.endpoint, s.p256dh, s.auth
  from claimed c
  join public.push_subscriptions s on s.device_id = c.device_id;
$$;

revoke all on function public.push_claim_due(interval, integer) from public, anon, authenticated;
grant execute on function public.push_claim_due(interval, integer) to service_role;

-- Envoi : chaque minute (pg_cron + pg_net, même méthode et mêmes secrets Vault
-- que la migration 20260924120100). La fonction push-send n'est appelée que
-- s'il y a au moins un rappel à envoyer.
select cron.schedule(
  'monguide-push-send',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'monguide_project_url') || '/functions/v1/push-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'monguide_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (
    select 1 from public.scheduled_reminders
    where sent_at is null and send_at <= now() and send_at > now() - interval '15 minutes'
  );
  $$
);

-- Confidentialité : rappels supprimés 7 jours après leur envoi (ou après leur
-- heure prévue s'ils n'ont pas pu partir), abonnements inactifs après 90 jours
-- (leurs rappels sont supprimés en cascade).
select cron.schedule(
  'monguide-purge-reminders',
  '25 3 * * *',
  $$delete from public.scheduled_reminders where coalesce(sent_at, send_at) < now() - interval '7 days'$$
);

select cron.schedule(
  'monguide-purge-push-subscriptions',
  '30 3 * * *',
  $$delete from public.push_subscriptions where last_seen_at < now() - interval '90 days'$$
);
