-- Forward, idempotent security repair.
--
-- A raw draft-session capability (sess_…) for the published Presence
-- 'presence-89f4d5' was committed to version control. This migration rotates
-- that capability to a fresh random value and re-points the anonymous identity
-- mapping to the new value, so:
--   * the leaked capability stops working,
--   * the paid subscription and the Presence are preserved by their stable
--     internal ids (slug / subject_hash), never by the compromised capability,
--   * no secret value is embedded here.
--
-- Safe on a fresh database (no matching row -> no-op) and safe to re-run:
-- rotation only happens while the presence is still flagged as leaked.

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

  -- Preserve the anonymous room identity (subject_hash / room_token) of the
  -- same person by moving the mapping onto the rotated capability.
  UPDATE public.session_room_tokens
  SET session_token = v_new
  WHERE session_token = v_old
    AND NOT EXISTS (
      SELECT 1 FROM public.session_room_tokens t WHERE t.session_token = v_new
    );

  -- Anything still pointing at the leaked value is revoked.
  DELETE FROM public.session_room_tokens WHERE session_token = v_old;
END $$;
