-- 1. Approved public sources per presence -------------------------------
CREATE TABLE public.presence_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL REFERENCES public.published_presences(slug) ON DELETE CASCADE,
  url text NOT NULL,
  label text,
  approved boolean NOT NULL DEFAULT true,
  scan_frequency text NOT NULL DEFAULT 'weekly',
  last_scanned_at timestamptz,
  last_status text,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX presence_sources_slug_url_key ON public.presence_sources (presence_slug, url);
CREATE INDEX presence_sources_scan_idx ON public.presence_sources (last_scanned_at NULLS FIRST);
GRANT ALL ON public.presence_sources TO service_role;
ALTER TABLE public.presence_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presence sources are backend only" ON public.presence_sources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Deny all client access" ON public.presence_sources AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER presence_sources_updated_at BEFORE UPDATE ON public.presence_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Snapshots ------------------------------------------------------------
CREATE TABLE public.source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.presence_sources(id) ON DELETE CASCADE,
  presence_slug text NOT NULL,
  fingerprint text NOT NULL,
  excerpt text,
  byte_size integer,
  http_status integer,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_snapshots_source_idx ON public.source_snapshots (source_id, fetched_at DESC);
GRANT ALL ON public.source_snapshots TO service_role;
ALTER TABLE public.source_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "source snapshots are backend only" ON public.source_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Deny all client access" ON public.source_snapshots AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 3. Detected changes -----------------------------------------------------
CREATE TABLE public.source_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.presence_sources(id) ON DELETE CASCADE,
  presence_slug text NOT NULL,
  classification text NOT NULL,
  summary text NOT NULL,
  evidence text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_changes_slug_idx ON public.source_changes (presence_slug, detected_at DESC);
GRANT ALL ON public.source_changes TO service_role;
ALTER TABLE public.source_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "source changes are backend only" ON public.source_changes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Deny all client access" ON public.source_changes AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER source_changes_updated_at BEFORE UPDATE ON public.source_changes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Improvement recommendations -----------------------------------------
CREATE TABLE public.improvement_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL REFERENCES public.published_presences(slug) ON DELETE CASCADE,
  change_id uuid REFERENCES public.source_changes(id) ON DELETE SET NULL,
  kind text NOT NULL,
  field_path text NOT NULL,
  current_value text,
  proposed_value text,
  issue text NOT NULL,
  evidence text,
  expected_benefit text,
  affected_files text[] NOT NULL DEFAULT '{}',
  confidence text NOT NULL DEFAULT 'medium',
  verification_status text NOT NULL DEFAULT 'unverified',
  state text NOT NULL DEFAULT 'detected',
  decided_at timestamptz,
  published_at timestamptz,
  rejection_reason text,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX improvement_recommendations_dedupe_key ON public.improvement_recommendations (presence_slug, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX improvement_recommendations_slug_idx ON public.improvement_recommendations (presence_slug, state, created_at DESC);
GRANT ALL ON public.improvement_recommendations TO service_role;
ALTER TABLE public.improvement_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recommendations are backend only" ON public.improvement_recommendations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Deny all client access" ON public.improvement_recommendations AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER improvement_recommendations_updated_at BEFORE UPDATE ON public.improvement_recommendations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Explainable health score --------------------------------------------
CREATE TABLE public.presence_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL REFERENCES public.published_presences(slug) ON DELETE CASCADE,
  score integer NOT NULL,
  state text NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX presence_health_scores_slug_idx ON public.presence_health_scores (presence_slug, computed_at DESC);
GRANT ALL ON public.presence_health_scores TO service_role;
ALTER TABLE public.presence_health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "health scores are backend only" ON public.presence_health_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Deny all client access" ON public.presence_health_scores AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 6. Notification log (idempotency + rate limiting) -----------------------
CREATE TABLE public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text,
  event_type text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  recipient text,
  dedupe_key text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notification_events_dedupe_key ON public.notification_events (dedupe_key);
CREATE INDEX notification_events_slug_idx ON public.notification_events (presence_slug, created_at DESC);
GRANT ALL ON public.notification_events TO service_role;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification events are backend only" ON public.notification_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Deny all client access" ON public.notification_events AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 7. Cancellation feedback ------------------------------------------------
CREATE TABLE public.cancellation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text,
  plan text,
  reason_code text NOT NULL,
  comment text,
  outcome text NOT NULL DEFAULT 'canceled',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cancellation_feedback_created_idx ON public.cancellation_feedback (created_at DESC);
GRANT ALL ON public.cancellation_feedback TO service_role;
ALTER TABLE public.cancellation_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cancellation feedback is backend only" ON public.cancellation_feedback FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Deny all client access" ON public.cancellation_feedback AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 8. Baseline + notification preferences on the presence itself ----------
ALTER TABLE public.published_presences
  ADD COLUMN IF NOT EXISTS baseline jsonb,
  ADD COLUMN IF NOT EXISTS baseline_at timestamptz,
  ADD COLUMN IF NOT EXISTS notify_source_changes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_billing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_reports boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_source_scan_at timestamptz;