ALTER TABLE public.presence_analytics_events
  ADD COLUMN IF NOT EXISTS dedupe_key text;

ALTER TABLE public.presence_analytics_events
  DROP CONSTRAINT IF EXISTS presence_analytics_events_dedupe_key_len;

ALTER TABLE public.presence_analytics_events
  ADD CONSTRAINT presence_analytics_events_dedupe_key_len
  CHECK (dedupe_key IS NULL OR char_length(dedupe_key) <= 64);

CREATE INDEX IF NOT EXISTS presence_analytics_events_dedupe_idx
  ON public.presence_analytics_events (presence_slug, dedupe_key, occurred_at DESC);