CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_hash text NOT NULL,
  room_kind text NOT NULL,
  room_ref text,
  provider_id text NOT NULL,
  provider_label text NOT NULL,
  display_handle text,
  canonical_url text NOT NULL,
  preview_status text NOT NULL DEFAULT 'basic',
  contains_sensitive_contact boolean NOT NULL DEFAULT false,
  is_identity_verified boolean NOT NULL DEFAULT false,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE UNIQUE INDEX IF NOT EXISTS social_posts_idem_idx ON public.social_posts (subject_hash, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS social_posts_dedupe_idx ON public.social_posts (subject_hash, room_kind, room_ref, canonical_url, created_at DESC);
CREATE INDEX IF NOT EXISTS social_posts_expiry_idx ON public.social_posts (expires_at);
GRANT ALL ON public.social_posts TO service_role;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.social_provider_registry (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  category text NOT NULL DEFAULT 'website',
  icon_key text,
  canonical_hosts text[] NOT NULL DEFAULT '{}',
  handle_pattern text,
  profile_url_template text,
  supports_handle boolean NOT NULL DEFAULT true,
  supports_direct_url boolean NOT NULL DEFAULT true,
  supports_public_preview boolean NOT NULL DEFAULT false,
  sensitive_identifier boolean NOT NULL DEFAULT false,
  preview_strategy text NOT NULL DEFAULT 'registry',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.social_provider_registry TO service_role;
ALTER TABLE public.social_provider_registry ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.social_preview_cache (
  normalized_url_hash text PRIMARY KEY,
  provider_id text NOT NULL,
  safe_title text,
  safe_description text,
  safe_avatar_proxy_url text,
  preview_status text NOT NULL DEFAULT 'basic',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
GRANT ALL ON public.social_preview_cache TO service_role;
ALTER TABLE public.social_preview_cache ENABLE ROW LEVEL SECURITY;