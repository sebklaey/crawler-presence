-- ============================ Crawler Love =================================
-- Separate, opt-in romantic compatibility layer. Never derived from the
-- general resonance patterns. Server-only: RLS on, no policies, service_role
-- grants only (same posture as mcp_sessions / published_presences).

CREATE TABLE public.love_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','deleted')),
  relationship_intention text,
  values_data_encrypted text,
  communication_data_encrypted text,
  connection_style_data_encrypted text,
  conflict_style_data_encrypted text,
  daily_rhythm_data_encrypted text,
  partner_preferences_encrypted text,
  broad_region_encrypted text,
  preferred_languages text[] NOT NULL DEFAULT '{}',
  human_readable_summary_encrypted text,
  love_vector_encrypted text,
  love_vector_version integer NOT NULL DEFAULT 1,
  love_vector_integrity_hash text,
  love_enabled boolean NOT NULL DEFAULT false,
  love_discoverable boolean NOT NULL DEFAULT false,
  allow_love_match_requests boolean NOT NULL DEFAULT false,
  public_pair_room_consent boolean NOT NULL DEFAULT false,
  adult_status text NOT NULL DEFAULT 'unknown'
    CHECK (adult_status IN ('unknown','self_attested','verified')),
  consent_version text,
  consented_at timestamptz,
  activated_at timestamptz,
  paused_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX love_profiles_pool_idx ON public.love_profiles (status, love_discoverable)
  WHERE deleted_at IS NULL;

GRANT ALL ON public.love_profiles TO service_role;
ALTER TABLE public.love_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.love_interview_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_hash text NOT NULL UNIQUE,
  current_question text,
  answers_encrypted text,
  progress integer NOT NULL DEFAULT 0,
  adult_status text NOT NULL DEFAULT 'unknown'
    CHECK (adult_status IN ('unknown','self_attested','verified')),
  consent_version text,
  consented_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX love_interview_drafts_expiry_idx ON public.love_interview_drafts (expires_at);

GRANT ALL ON public.love_interview_drafts TO service_role;
ALTER TABLE public.love_interview_drafts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.love_match_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_match_id text NOT NULL UNIQUE,
  requester_subject_hash text NOT NULL,
  candidate_subject_hash text NOT NULL,
  requester_score_internal integer,
  candidate_score_internal integer,
  match_reasons_safe jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'candidate_found'
    CHECK (status IN ('candidate_found','awaiting_sender_confirmation','pending_recipient',
                      'accepted','declined','blocked','reported','expired','cancelled','room_created')),
  requester_confirmed_at timestamptz,
  candidate_responded_at timestamptz,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  idempotency_key text UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX love_match_requests_requester_idx ON public.love_match_requests (requester_subject_hash, status);
CREATE INDEX love_match_requests_candidate_idx ON public.love_match_requests (candidate_subject_hash, status);

GRANT ALL ON public.love_match_requests TO service_role;
ALTER TABLE public.love_match_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.love_profile_blocks (
  blocker_subject_hash text NOT NULL,
  blocked_subject_hash text NOT NULL,
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_subject_hash, blocked_subject_hash)
);

GRANT ALL ON public.love_profile_blocks TO service_role;
ALTER TABLE public.love_profile_blocks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER love_profiles_touch BEFORE UPDATE ON public.love_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER love_interview_drafts_touch BEFORE UPDATE ON public.love_interview_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER love_match_requests_touch BEFORE UPDATE ON public.love_match_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Retention: unconfirmed interview drafts die after 24h, stale requests expire.
CREATE OR REPLACE FUNCTION public.love_cleanup_expired()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_drafts integer;
  v_requests integer;
BEGIN
  DELETE FROM public.love_interview_drafts WHERE expires_at <= now();
  GET DIAGNOSTICS v_drafts = ROW_COUNT;

  UPDATE public.love_match_requests
     SET status = 'expired'
   WHERE status IN ('candidate_found','awaiting_sender_confirmation','pending_recipient')
     AND expires_at <= now();
  GET DIAGNOSTICS v_requests = ROW_COUNT;

  RETURN json_build_object('deleted_love_drafts', v_drafts, 'expired_love_requests', v_requests);
END;
$function$;