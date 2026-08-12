CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL REFERENCES public.published_presences(slug) ON DELETE CASCADE,
  event_type text NOT NULL,
  source_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  anonymous_session_hash text,
  resource_path text,
  referrer_category text,
  public_source_url text,
  entity_match text,
  confidence numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_slug_time ON public.analytics_events (presence_slug, occurred_at DESC);
CREATE INDEX analytics_events_source ON public.analytics_events (presence_slug, source_type);
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all client access" ON public.analytics_events AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "analytics events are backend only" ON public.analytics_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.visibility_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL REFERENCES public.published_presences(slug) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_key text NOT NULL,
  prompt_version text NOT NULL DEFAULT 'v1',
  tested_at timestamptz NOT NULL DEFAULT now(),
  entity_mentioned boolean NOT NULL DEFAULT false,
  description_correct boolean,
  source_cited boolean NOT NULL DEFAULT false,
  position integer,
  detected_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  result_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visibility_benchmarks_slug_time ON public.visibility_benchmarks (presence_slug, tested_at DESC);
GRANT ALL ON public.visibility_benchmarks TO service_role;
ALTER TABLE public.visibility_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all client access" ON public.visibility_benchmarks AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "benchmarks are backend only" ON public.visibility_benchmarks FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.analytics_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL REFERENCES public.published_presences(slug) ON DELETE CASCADE,
  integration_type text NOT NULL,
  connection_status text NOT NULL DEFAULT 'not_connected',
  last_synced_at timestamptz,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (presence_slug, integration_type)
);
GRANT ALL ON public.analytics_integrations TO service_role;
ALTER TABLE public.analytics_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all client access" ON public.analytics_integrations AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "integrations are backend only" ON public.analytics_integrations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER analytics_integrations_updated_at BEFORE UPDATE ON public.analytics_integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.analytics_daily_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL REFERENCES public.published_presences(slug) ON DELETE CASCADE,
  date date NOT NULL,
  source_type text NOT NULL,
  event_type text NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  unique_sessions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (presence_slug, date, source_type, event_type)
);
CREATE INDEX analytics_daily_rollups_slug_date ON public.analytics_daily_rollups (presence_slug, date DESC);
GRANT ALL ON public.analytics_daily_rollups TO service_role;
ALTER TABLE public.analytics_daily_rollups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all client access" ON public.analytics_daily_rollups AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "rollups are backend only" ON public.analytics_daily_rollups FOR ALL TO service_role USING (true) WITH CHECK (true);