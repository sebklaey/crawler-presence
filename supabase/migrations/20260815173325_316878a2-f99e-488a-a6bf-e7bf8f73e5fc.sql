-- 1) Hashed session lookup for the session -> room identity mapping.
alter table public.session_room_tokens
  add column if not exists session_token_hash text,
  add column if not exists subject_hash text,
  add column if not exists revoked_at timestamptz;

update public.session_room_tokens
   set session_token_hash = encode(
         extensions.digest('crawler-session-v1:' || session_token, 'sha256'), 'hex')
 where session_token is not null
   and session_token_hash is null;

-- Collapse any duplicates before the unique index.
delete from public.session_room_tokens a
 using public.session_room_tokens b
 where a.session_token_hash is not null
   and a.session_token_hash = b.session_token_hash
   and a.ctid > b.ctid;

create unique index if not exists session_room_tokens_hash_key
  on public.session_room_tokens (session_token_hash)
  where session_token_hash is not null;

-- No raw capability may remain at rest.
update public.session_room_tokens
   set session_token = 'redacted:' || left(session_token_hash, 32)
 where session_token is not null
   and session_token_hash is not null;

-- 2) Atomic owner recovery: replace the presence session hash, revoke old
--    mappings, and link the new hash to the same stable identity.
create or replace function public.reissue_presence_session(
  p_slug text,
  p_new_session_hash text,
  p_old_session_hash text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_presence public.published_presences%rowtype;
  v_room text := null;
  v_subject text := null;
begin
  select * into v_presence from public.published_presences
   where slug = p_slug for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not-found');
  end if;
  if coalesce(v_presence.recovery_state, 'ok') = 'admin_assist_required'
     or v_presence.manage_secret_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'admin-assist-required');
  end if;

  -- Carry the existing stable identity over to the new capability.
  select room_token, subject_hash into v_room, v_subject
    from public.session_room_tokens
   where session_token_hash = coalesce(p_old_session_hash, v_presence.session_token_hash)
     and revoked_at is null
   limit 1;

  update public.session_room_tokens
     set revoked_at = now(), updated_at = now()
   where session_token_hash = coalesce(p_old_session_hash, v_presence.session_token_hash)
     and revoked_at is null;

  if v_room is not null or v_subject is not null then
    insert into public.session_room_tokens (session_token, session_token_hash, room_token, subject_hash)
    values ('redacted:' || left(p_new_session_hash, 32), p_new_session_hash,
            coalesce(v_room, 'recovered'), v_subject)
    on conflict (session_token_hash) where session_token_hash is not null
    do update set room_token = excluded.room_token,
                  subject_hash = excluded.subject_hash,
                  revoked_at = null,
                  updated_at = now();
  end if;

  update public.published_presences
     set session_token = null,
         session_token_hash = p_new_session_hash,
         updated_at = now()
   where slug = p_slug;

  return jsonb_build_object('ok', true, 'slug', p_slug,
                            'identity_preserved', (v_room is not null or v_subject is not null));
end;
$$;

revoke all on function public.reissue_presence_session(text, text, text) from public, anon, authenticated;
grant execute on function public.reissue_presence_session(text, text, text) to service_role;

-- 3) Admin-assisted recovery requests: dedupe, rate limit, minimal retention.
alter table public.presence_recovery_requests
  add column if not exists request_count integer not null default 1,
  add column if not exists last_requested_at timestamptz not null default now(),
  add column if not exists delete_after timestamptz not null default now() + interval '90 days';

create unique index if not exists presence_recovery_requests_open_slug_key
  on public.presence_recovery_requests (slug)
  where status = 'open';
