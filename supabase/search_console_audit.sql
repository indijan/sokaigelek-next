create table if not exists public.search_console_audit_runs (
  id uuid primary key default gen_random_uuid(),
  site_url text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  summary jsonb not null default '{}'::jsonb,
  ai_summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.search_console_audit_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.search_console_audit_runs(id) on delete cascade,
  finding_type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  url text,
  title text not null,
  details jsonb not null default '{}'::jsonb,
  ai_recommendation text,
  status text not null default 'open' check (status in ('open', 'ignored', 'applied')),
  created_at timestamptz not null default now()
);

create index if not exists search_console_audit_runs_started_at_idx
  on public.search_console_audit_runs (started_at desc);
create index if not exists search_console_audit_findings_status_idx
  on public.search_console_audit_findings (status, created_at desc);

alter table public.search_console_audit_runs enable row level security;
alter table public.search_console_audit_findings enable row level security;
