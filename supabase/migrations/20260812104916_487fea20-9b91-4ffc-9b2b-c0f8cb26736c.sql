ALTER TABLE public.published_presences
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS custom_domain_token text,
  ADD COLUMN IF NOT EXISTS custom_domain_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS published_presences_custom_domain_key
  ON public.published_presences (custom_domain)
  WHERE custom_domain IS NOT NULL;