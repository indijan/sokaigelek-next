create extension if not exists pgcrypto;

create table if not exists public.lab_upload_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  uploader_name text not null,
  uploader_email text not null,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null,
  storage_bucket text not null,
  storage_path text not null,
  status text not null default 'new'
);

create index if not exists idx_lab_upload_requests_created_at on public.lab_upload_requests (created_at desc);
create index if not exists idx_lab_upload_requests_email on public.lab_upload_requests (uploader_email);

insert into storage.buckets (id, name, public)
values ('lab-uploads', 'lab-uploads', false)
on conflict (id) do nothing;
