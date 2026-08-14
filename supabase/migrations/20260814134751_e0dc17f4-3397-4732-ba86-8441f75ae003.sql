-- 1. Extend analytics_events (backwards compatible)
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS surface text,
  ADD COLUMN IF NOT EXISTS evidence_type text NOT NULL DEFAULT 'observed',
  ADD COLUMN IF NOT EXISTS path text,
  ADD COLUMN IF NOT EXISTS referrer text,
  ADD COLUMN IF NOT EXISTS user_agent_family text,
  ADD COLUMN IF NOT EXISTS verified_bot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS http_status integer,
  ADD COLUMN IF NOT EXISTS response_bytes integer,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS prompt_id text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS mentioned boolean,
  ADD COLUMN IF NOT EXISTS cited boolean,
  ADD COLUMN IF NOT EXISTS recommended boolean,
  ADD COLUMN IF NOT EXISTS citation_url text,
  ADD COLUMN IF NOT EXISTS source_event_id text,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

UPDATE public.analytics_events SET evidence_type = 'observed' WHERE evidence_type IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_idempotency_idx
  ON public.analytics_events (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_events_slug_time_idx
  ON public.analytics_events (presence_slug, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_evidence_idx
  ON public.analytics_events (presence_slug, evidence_type, occurred_at DESC);

-- 2. analytics_sources
CREATE TABLE IF NOT EXISTS public.analytics_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL REFERENCES public.published_presences(slug) ON DELETE CASCADE,
  source_type text NOT NULL,
  status text NOT NULL DEFAULT 'not_connected',
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  next_sync_at timestamptz,
  last_error text,
  records_imported integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (presence_slug, source_type)
);
GRANT ALL ON public.analytics_sources TO service_role;
ALTER TABLE public.analytics_sources ENABLE ROW LEVEL SECURITY;

-- 3. analytics_connector_syncs
CREATE TABLE IF NOT EXISTS public.analytics_connector_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL,
  source_type text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  window_start date,
  window_end date,
  records_read integer NOT NULL DEFAULT 0,
  records_written integer NOT NULL DEFAULT 0,
  records_skipped integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.analytics_connector_syncs TO service_role;
ALTER TABLE public.analytics_connector_syncs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS analytics_connector_syncs_idx
  ON public.analytics_connector_syncs (presence_slug, source_type, started_at DESC);

-- 4. probe_definitions
CREATE TABLE IF NOT EXISTS public.probe_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL REFERENCES public.published_presences(slug) ON DELETE CASCADE,
  prompt_id text NOT NULL,
  prompt_version text NOT NULL DEFAULT 'v1',
  prompt text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  region text NOT NULL DEFAULT 'global',
  category text NOT NULL,
  branded boolean NOT NULL DEFAULT true,
  recommendation_test boolean NOT NULL DEFAULT false,
  competitor_group text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (presence_slug, prompt_id, prompt_version)
);
GRANT ALL ON public.probe_definitions TO service_role;
ALTER TABLE public.probe_definitions ENABLE ROW LEVEL SECURITY;

-- 5. probe_runs
CREATE TABLE IF NOT EXISTS public.probe_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL,
  definition_id uuid REFERENCES public.probe_definitions(id) ON DELETE SET NULL,
  prompt_id text NOT NULL,
  prompt_version text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  model_version text,
  locale text NOT NULL DEFAULT 'en',
  region text NOT NULL DEFAULT 'global',
  tested_at timestamptz NOT NULL DEFAULT now(),
  response_status text NOT NULL,
  mentioned boolean,
  recommended boolean,
  own_domain_cited boolean,
  competitors_mentioned text[] NOT NULL DEFAULT '{}',
  latency_ms integer,
  cost_usd numeric,
  error text,
  retry_of uuid,
  evidence_type text NOT NULL DEFAULT 'synthetic',
  result_summary text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.probe_runs TO service_role;
ALTER TABLE public.probe_runs ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS probe_runs_idempotency_idx
  ON public.probe_runs (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS probe_runs_slug_time_idx ON public.probe_runs (presence_slug, tested_at DESC);

-- 6. probe_citations
CREATE TABLE IF NOT EXISTS public.probe_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.probe_runs(id) ON DELETE CASCADE,
  presence_slug text NOT NULL,
  url text NOT NULL,
  domain text,
  title text,
  rank integer,
  own_domain boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.probe_citations TO service_role;
ALTER TABLE public.probe_citations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS probe_citations_run_idx ON public.probe_citations (run_id);

-- 7. ai_referral_domains
CREATE TABLE IF NOT EXISTS public.ai_referral_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  provider text NOT NULL,
  surface text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_referral_domains TO service_role;
ALTER TABLE public.ai_referral_domains ENABLE ROW LEVEL SECURITY;

INSERT INTO public.ai_referral_domains (domain, provider, surface) VALUES
  ('chatgpt.com', 'openai', 'ChatGPT'),
  ('chat.openai.com', 'openai', 'ChatGPT'),
  ('openai.com', 'openai', 'OpenAI'),
  ('perplexity.ai', 'perplexity', 'Perplexity'),
  ('www.perplexity.ai', 'perplexity', 'Perplexity'),
  ('claude.ai', 'anthropic', 'Claude'),
  ('gemini.google.com', 'google', 'Gemini'),
  ('bard.google.com', 'google', 'Gemini'),
  ('copilot.microsoft.com', 'microsoft', 'Copilot'),
  ('bing.com', 'microsoft', 'Bing Copilot'),
  ('you.com', 'other', 'You.com'),
  ('poe.com', 'other', 'Poe')
ON CONFLICT (domain) DO NOTHING;

-- 8. rollups
ALTER TABLE public.analytics_daily_rollups
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS evidence_type text NOT NULL DEFAULT 'observed';