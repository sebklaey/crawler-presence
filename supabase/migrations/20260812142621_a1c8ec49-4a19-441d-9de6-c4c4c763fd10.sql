CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  intent_ref text,
  subscription_id text,
  occurred_at timestamptz,
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'received',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payment_events_event_id_key ON public.payment_events (event_id);
CREATE INDEX payment_events_intent_ref_idx ON public.payment_events (intent_ref);
CREATE INDEX payment_events_created_at_idx ON public.payment_events (created_at DESC);

GRANT ALL ON public.payment_events TO service_role;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment events are backend only"
  ON public.payment_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Deny all client access"
  ON public.payment_events AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TRIGGER payment_events_updated_at
  BEFORE UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.published_presences
  ADD COLUMN IF NOT EXISTS publication_state text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS publication_error text,
  ADD COLUMN IF NOT EXISTS published_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.publish_intents
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS last_event_id text;

CREATE INDEX IF NOT EXISTS publish_intents_status_idx ON public.publish_intents (status, created_at DESC);