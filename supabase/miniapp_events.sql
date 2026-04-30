create extension if not exists pgcrypto;

create table if not exists public.miniapp_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  event_name text not null,
  mode text null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_miniapp_events_created_at on public.miniapp_events (created_at desc);
create index if not exists idx_miniapp_events_source on public.miniapp_events (source);
create index if not exists idx_miniapp_events_event_name on public.miniapp_events (event_name);
