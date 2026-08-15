ALTER TABLE public.published_presences
  ADD COLUMN IF NOT EXISTS session_rotated_at timestamptz;

DO $$
DECLARE
  v_old text;
  v_new text;
BEGIN
  SELECT session_token INTO v_old
  FROM public.published_presences
  WHERE slug = 'presence-89f4d5'
    AND session_token IS NOT NULL
    AND session_rotated_at IS NULL
  LIMIT 1;

  IF v_old IS NULL THEN
    RETURN;
  END IF;

  v_new := 'sess_' || encode(gen_random_bytes(16), 'hex');

  UPDATE public.published_presences
  SET session_token = v_new,
      session_rotated_at = now()
  WHERE slug = 'presence-89f4d5';

  UPDATE public.session_room_tokens
  SET session_token = v_new
  WHERE session_token = v_old
    AND NOT EXISTS (
      SELECT 1 FROM public.session_room_tokens t WHERE t.session_token = v_new
    );

  DELETE FROM public.session_room_tokens WHERE session_token = v_old;
END $$;