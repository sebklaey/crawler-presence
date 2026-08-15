create extension if not exists pgcrypto with schema extensions;

alter table public.published_presences
  add column if not exists session_token_hash text,
  add column if not exists recovery_state text not null default 'ok',
  add column if not exists recovery_notes text;

create index if not exists published_presences_session_token_hash_idx
  on public.published_presences (session_token_hash);

update public.published_presences
   set session_token_hash = encode(
         extensions.digest('crawler-session-v1:' || session_token, 'sha256'), 'hex')
 where session_token is not null
   and session_token_hash is null;

update public.published_presences
   set session_token = null
 where session_token is not null;

update public.published_presences
   set recovery_state = 'admin_assist_required'
 where manage_secret_hash is null
   and recovery_state = 'ok';

create table if not exists public.presence_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  contact text,
  evidence text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists presence_recovery_requests_slug_idx
  on public.presence_recovery_requests (slug);

grant all on public.presence_recovery_requests to service_role;

alter table public.presence_recovery_requests enable row level security;

drop policy if exists "service role only" on public.presence_recovery_requests;
create policy "service role only"
  on public.presence_recovery_requests for all
  using (false) with check (false);