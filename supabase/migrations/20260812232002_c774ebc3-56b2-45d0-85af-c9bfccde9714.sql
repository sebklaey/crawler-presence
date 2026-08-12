CREATE TABLE public.funnel_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  presence_slug TEXT,
  plan TEXT,
  from_step TEXT,
  to_step TEXT,
  error_category TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX funnel_events_type_time_idx ON public.funnel_events (event_type, occurred_at DESC);
CREATE INDEX funnel_events_session_idx ON public.funnel_events (session_hash, occurred_at DESC);

GRANT ALL ON public.funnel_events TO service_role;

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;