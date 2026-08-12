CREATE TABLE IF NOT EXISTS public.presence_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL REFERENCES public.published_presences(slug) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_kind text NOT NULL CHECK (alias_kind IN ('domain','slug','name')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presence_aliases_alias_len CHECK (char_length(alias) BETWEEN 2 AND 200),
  CONSTRAINT presence_aliases_unique UNIQUE (presence_slug, alias_kind, alias)
);

CREATE INDEX IF NOT EXISTS presence_aliases_alias_idx ON public.presence_aliases (alias);
CREATE INDEX IF NOT EXISTS presence_aliases_slug_idx ON public.presence_aliases (presence_slug);

CREATE TABLE IF NOT EXISTS public.presence_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL REFERENCES public.published_presences(slug) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('mention','conversation','file_read','outbound_click')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'unknown' CHECK (source IN ('mcp','web','crawler','unknown')),
  file_path text,
  session_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presence_analytics_events_file_path_len CHECK (file_path IS NULL OR char_length(file_path) <= 200),
  CONSTRAINT presence_analytics_events_fingerprint_len CHECK (session_fingerprint IS NULL OR char_length(session_fingerprint) = 64)
);

CREATE INDEX IF NOT EXISTS presence_analytics_events_slug_type_time_idx
  ON public.presence_analytics_events (presence_slug, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS presence_analytics_events_fp_slug_time_idx
  ON public.presence_analytics_events (session_fingerprint, presence_slug, occurred_at DESC);
CREATE INDEX IF NOT EXISTS presence_analytics_events_occurred_at_idx
  ON public.presence_analytics_events (occurred_at);

ALTER TABLE public.presence_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presence_aliases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.presence_analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presence_analytics_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.presence_aliases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.presence_analytics_events FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.presence_aliases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presence_analytics_events TO service_role;