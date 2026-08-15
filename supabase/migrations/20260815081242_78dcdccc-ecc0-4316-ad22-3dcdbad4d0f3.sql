CREATE OR REPLACE FUNCTION public.enforce_text_retention(p_room_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_extra integer := 0;
  v_room public.rooms%ROWTYPE;
  v_hours integer;
  v_limit integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('room_text_retention:' || p_room_id::text));
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_hours := LEAST(COALESCE(v_room.retention_hours, 24), 24);

  DELETE FROM public.messages m
   WHERE m.room_id = p_room_id
     AND (m.created_at < now() - make_interval(hours => v_hours)
          OR (m.expires_at IS NOT NULL AND m.expires_at <= now()));
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Universal room: only the 24h limit, no volume cap
  IF v_room.kind = 'universal' THEN
    RETURN v_count;
  END IF;

  v_limit := LEAST(COALESCE(v_room.retention_texts, 7), 7);

  DELETE FROM public.messages m
   WHERE m.room_id = p_room_id
     AND m.id NOT IN (
       SELECT id FROM public.messages
        WHERE room_id = p_room_id
        ORDER BY created_at DESC, id DESC
        LIMIT v_limit
     );
  GET DIAGNOSTICS v_extra = ROW_COUNT;

  RETURN v_count + v_extra;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_image_retention(p_room_id uuid)
 RETURNS TABLE(storage_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer;
  v_kind text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('room_image_retention:' || p_room_id::text));
  SELECT r.kind, LEAST(COALESCE(r.retention_images, 3), 3)
    INTO v_kind, v_limit
    FROM public.rooms r WHERE r.id = p_room_id;
  IF v_limit IS NULL THEN v_limit := 3; END IF;

  IF v_kind = 'universal' THEN
    RETURN QUERY
    DELETE FROM public.image_messages i
     WHERE i.room_id = p_room_id
       AND (
         i.created_at < now() - interval '24 hours'
         OR (i.expires_at IS NOT NULL AND i.expires_at <= now())
       )
    RETURNING i.storage_path;
    RETURN;
  END IF;

  RETURN QUERY
  DELETE FROM public.image_messages i
   WHERE i.room_id = p_room_id
     AND (
       i.created_at < now() - interval '24 hours'
       OR (i.expires_at IS NOT NULL AND i.expires_at <= now())
       OR (
         i.moderation_status = 'approved'
         AND i.id NOT IN (
           SELECT id FROM public.image_messages
            WHERE room_id = p_room_id AND moderation_status = 'approved'
            ORDER BY created_at DESC, id DESC
            LIMIT v_limit
         )
       )
     )
  RETURNING i.storage_path;
END;
$function$;