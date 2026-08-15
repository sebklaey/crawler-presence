CREATE TABLE IF NOT EXISTS public.session_room_tokens (
  session_token text PRIMARY KEY,
  room_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.session_room_tokens TO service_role;
ALTER TABLE public.session_room_tokens ENABLE ROW LEVEL SECURITY;