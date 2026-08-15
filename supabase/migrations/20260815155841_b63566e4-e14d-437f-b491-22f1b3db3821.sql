ALTER TABLE public.session_room_tokens
  ADD COLUMN IF NOT EXISTS subject_hash text;
ALTER TABLE public.session_room_tokens ALTER COLUMN room_token DROP NOT NULL;
INSERT INTO public.session_room_tokens (session_token, subject_hash)
VALUES ('sess_55c5dc377250dd4f929499b7e01bad92', '443c73683cfa3533d08dedc2f7fc245bfa1a09d7bc0926961bf320c8f9a8dd42')
ON CONFLICT (session_token) DO UPDATE SET subject_hash = EXCLUDED.subject_hash, updated_at = now();