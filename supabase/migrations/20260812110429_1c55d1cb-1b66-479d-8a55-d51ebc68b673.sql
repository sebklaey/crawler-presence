CREATE TABLE public.presence_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_slug text NOT NULL REFERENCES public.published_presences(slug) ON DELETE CASCADE,
  label text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE UNIQUE INDEX presence_team_members_code_hash_key ON public.presence_team_members (code_hash);
CREATE INDEX presence_team_members_slug_idx ON public.presence_team_members (presence_slug);

GRANT ALL ON public.presence_team_members TO service_role;
REVOKE ALL ON public.presence_team_members FROM anon, authenticated, PUBLIC;
ALTER TABLE public.presence_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team members are backend only" ON public.presence_team_members FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER presence_team_members_updated_at BEFORE UPDATE ON public.presence_team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  presence_slug text,
  status text NOT NULL DEFAULT 'open',
  delivered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_tickets_created_at_idx ON public.support_tickets (created_at DESC);

GRANT ALL ON public.support_tickets TO service_role;
REVOKE ALL ON public.support_tickets FROM anon, authenticated, PUBLIC;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "support tickets are backend only" ON public.support_tickets FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.published_presences
  ADD COLUMN IF NOT EXISTS report_email text,
  ADD COLUMN IF NOT EXISTS report_frequency text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS report_last_sent_at timestamptz;