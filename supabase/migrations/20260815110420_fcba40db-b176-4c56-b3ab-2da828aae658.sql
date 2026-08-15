-- 1. Resonance patterns -------------------------------------------------
CREATE TABLE public.resonance_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_pattern_id text NOT NULL UNIQUE,
  subject_hash text NOT NULL,
  schema_version text NOT NULL DEFAULT '1.0',
  intent text NOT NULL,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  languages text[] NOT NULL DEFAULT '{}',
  broad_region text,
  connection_modes text[] NOT NULL DEFAULT '{}',
  resonance_signature text,
  status text NOT NULL DEFAULT 'searching',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  deleted_at timestamptz
);
CREATE UNIQUE INDEX resonance_patterns_subject_active
  ON public.resonance_patterns (subject_hash) WHERE deleted_at IS NULL;
CREATE INDEX resonance_patterns_status_idx ON public.resonance_patterns (status, expires_at);

GRANT ALL ON public.resonance_patterns TO service_role;
ALTER TABLE public.resonance_patterns ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER resonance_patterns_touch BEFORE UPDATE ON public.resonance_patterns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Match requests ------------------------------------------------------
CREATE TABLE public.match_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_match_id text NOT NULL UNIQUE,
  requester_pattern_id uuid NOT NULL REFERENCES public.resonance_patterns(id) ON DELETE CASCADE,
  candidate_pattern_id uuid NOT NULL REFERENCES public.resonance_patterns(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  safe_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  requester_status text NOT NULL DEFAULT 'pending',
  candidate_status text NOT NULL DEFAULT 'pending',
  state text NOT NULL DEFAULT 'candidate_found',
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  resolved_at timestamptz
);
CREATE INDEX match_requests_requester_idx ON public.match_requests (requester_pattern_id, state);
CREATE INDEX match_requests_candidate_idx ON public.match_requests (candidate_pattern_id, state);

GRANT ALL ON public.match_requests TO service_role;
ALTER TABLE public.match_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER match_requests_touch BEFORE UPDATE ON public.match_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Room participants (write authorisation) -----------------------------
CREATE TABLE public.room_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  subject_hash text NOT NULL,
  public_handle text,
  role text NOT NULL DEFAULT 'participant',
  can_write boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (room_id, subject_hash)
);
CREATE INDEX room_participants_room_idx ON public.room_participants (room_id);

GRANT ALL ON public.room_participants TO service_role;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;

-- 4. Aggregated match analytics -----------------------------------------
CREATE TABLE public.match_events (
  id bigserial PRIMARY KEY,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX match_events_type_idx ON public.match_events (event_type, created_at DESC);

GRANT ALL ON public.match_events TO service_role;
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;

-- 5. Rooms: public pair rooms + legacy private lockdown ------------------
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS public_slug text;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS legacy_private boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS rooms_public_slug_key ON public.rooms (public_slug) WHERE public_slug IS NOT NULL;

UPDATE public.rooms
   SET legacy_private = true
 WHERE visibility IN ('private', 'invite', 'paid');

-- 6. Match belongs to Pro (and Business, which includes Pro features) ----
UPDATE public.plans
   SET entitlements = entitlements || '{"match": true}'::jsonb
 WHERE code IN ('pro', 'business');
UPDATE public.plans
   SET entitlements = entitlements || '{"match": false}'::jsonb
 WHERE code IN ('free', 'plus');