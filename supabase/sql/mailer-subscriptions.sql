-- Subscriptions table for category-based digests
create extension if not exists "pgcrypto";

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  category_slug text not null,
  status text not null default 'active',
  source text,
  mailerlite_group_id text,
  mailerlite_subscriber_id text,
  mailerlite_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_email_category_idx
  on subscriptions (email, category_slug);

create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  category_slug text not null,
  article_ids uuid[] not null default '{}',
  campaign_id text,
  sent_at timestamptz not null default now()
);

create table if not exists mailerlite_groups (
  group_id text primary key,
  category_slug text not null,
  name text,
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_set_updated_at on subscriptions;
create trigger subscriptions_set_updated_at
before update on subscriptions
for each row execute procedure set_updated_at();
