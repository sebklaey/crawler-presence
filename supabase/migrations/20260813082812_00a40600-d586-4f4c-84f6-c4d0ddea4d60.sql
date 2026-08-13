ALTER TABLE public.published_presences
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS published_presences_status_idx ON public.published_presences (status);
CREATE INDEX IF NOT EXISTS published_presences_custom_domain_idx ON public.published_presences (custom_domain);
CREATE INDEX IF NOT EXISTS presence_aliases_alias_kind_idx ON public.presence_aliases (alias, alias_kind);