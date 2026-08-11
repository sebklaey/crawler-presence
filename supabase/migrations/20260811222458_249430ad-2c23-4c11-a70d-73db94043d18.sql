CREATE TABLE public.mcp_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL UNIQUE,
  core jsonb NOT NULL DEFAULT '{}'::jsonb,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence integer NOT NULL DEFAULT 0,
  complete boolean NOT NULL DEFAULT false,
  origin text NOT NULL DEFAULT 'mcp',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX mcp_sessions_expires_at_idx ON public.mcp_sessions (expires_at);

CREATE TABLE public.published_presences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  session_token text,
  core jsonb NOT NULL,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan text NOT NULL DEFAULT 'plus',
  mode text NOT NULL DEFAULT 'demo',
  claim_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX published_presences_session_token_idx ON public.published_presences (session_token);

CREATE TABLE public.mcp_rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_key, window_start)
);
CREATE INDEX mcp_rate_limits_window_idx ON public.mcp_rate_limits (window_start);

GRANT ALL ON public.mcp_sessions TO service_role;
GRANT ALL ON public.published_presences TO service_role;
GRANT ALL ON public.mcp_rate_limits TO service_role;

ALTER TABLE public.mcp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.published_presences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER mcp_sessions_updated_at BEFORE UPDATE ON public.mcp_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER published_presences_updated_at BEFORE UPDATE ON public.published_presences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();