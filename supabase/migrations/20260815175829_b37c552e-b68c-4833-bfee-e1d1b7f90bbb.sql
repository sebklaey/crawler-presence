CREATE OR REPLACE FUNCTION public.reissue_presence_session(p_slug text, p_new_session_hash text, p_old_session_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Never fabricate a capability: room_token stays NULL when none existed.
  if v_room is not null or v_subject is not null then
    insert into public.session_room_tokens (session_token, session_token_hash, room_token, subject_hash)
    values ('redacted:' || left(p_new_session_hash, 32), p_new_session_hash, v_room, v_subject)
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
$function$;