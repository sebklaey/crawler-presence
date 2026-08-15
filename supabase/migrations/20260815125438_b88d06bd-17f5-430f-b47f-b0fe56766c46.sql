-- Crawler Ads: creatives, ad resonance patterns, privacy-preserving delivery bookkeeping.

CREATE TABLE IF NOT EXISTS public.ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.sponsored_campaigns(id) ON DELETE CASCADE,
  product_reference text,
  product_name text NOT NULL,
  product_description text,
  product_category text,
  headline text NOT NULL,
  body text NOT NULL,
  image_reference text,
  image_alt text,
  destination_url text NOT NULL,
  destination_domain text NOT NULL,
  call_to_action text,
  languages text[] NOT NULL DEFAULT ARRAY['en']::text[],
  status text NOT NULL DEFAULT 'draft',
  knowledge_slug text UNIQUE,
  content_version_hash text,
  approved_content_hash text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_creatives_campaign_idx ON public.ad_creatives(campaign_id);
CREATE INDEX IF NOT EXISTS ad_creatives_status_idx ON public.ad_creatives(status);

CREATE TABLE IF NOT EXISTS public.ad_resonance_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid NOT NULL REFERENCES public.ad_creatives(id) ON DELETE CASCADE,
  schema_version text NOT NULL DEFAULT '1.0',
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  intents text[] NOT NULL DEFAULT ARRAY[]::text[],
  languages text[] NOT NULL DEFAULT ARRAY[]::text[],
  content_version_hash text,
  version integer NOT NULL DEFAULT 1,
  created_from_approved_content boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz
);
CREATE INDEX IF NOT EXISTS ad_resonance_patterns_creative_idx ON public.ad_resonance_patterns(creative_id);

CREATE TABLE IF NOT EXISTS public.sponsored_impressions (
  id bigserial PRIMARY KEY,
  creative_id uuid NOT NULL REFERENCES public.ad_creatives(id) ON DELETE CASCADE,
  anonymous_frequency_key text NOT NULL,
  displayed_at timestamptz NOT NULL DEFAULT now(),
  placement_context text NOT NULL DEFAULT 'universal_feed',
  resonance_bucket text,
  language text,
  clicked_at timestamptz,
  hidden_at timestamptz,
  reported_at timestamptz
);
CREATE INDEX IF NOT EXISTS sponsored_impressions_freq_idx
  ON public.sponsored_impressions(anonymous_frequency_key, displayed_at DESC);
CREATE INDEX IF NOT EXISTS sponsored_impressions_creative_idx
  ON public.sponsored_impressions(creative_id, displayed_at DESC);

CREATE TABLE IF NOT EXISTS public.resonance_ad_preferences (
  internal_session_reference text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  consented_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blocked_advertisers (
  subject_hash text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_hash, organization_id)
);

ALTER TABLE public.campaign_reviews ADD COLUMN IF NOT EXISTS creative_id uuid;

GRANT ALL ON public.ad_creatives TO service_role;
GRANT ALL ON public.ad_resonance_patterns TO service_role;
GRANT ALL ON public.sponsored_impressions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.sponsored_impressions_id_seq TO service_role;
GRANT ALL ON public.resonance_ad_preferences TO service_role;
GRANT ALL ON public.blocked_advertisers TO service_role;

ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_resonance_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsored_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resonance_ad_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_advertisers ENABLE ROW LEVEL SECURITY;