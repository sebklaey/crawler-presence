ALTER TABLE public.session_room_tokens
  ADD COLUMN IF NOT EXISTS subject_hash text;
ALTER TABLE public.session_room_tokens ALTER COLUMN room_token DROP NOT NULL;
-- A literal session capability was removed from this file for security reasons.
-- The forward repair 20260816090000_rotate_leaked_session_capability.sql rotates
-- it and re-points the identity mapping without embedding any secret value.
