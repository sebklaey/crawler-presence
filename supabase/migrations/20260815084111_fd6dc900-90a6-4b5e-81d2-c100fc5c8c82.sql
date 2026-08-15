CREATE TABLE IF NOT EXISTS public.room_plan_links (
  subject_hash text PRIMARY KEY,
  presence_slug text NOT NULL,
  plan text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.room_plan_links TO service_role;
ALTER TABLE public.room_plan_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS room_plan_links_slug_idx ON public.room_plan_links (presence_slug);
UPDATE public.plans SET price_cents = 500 WHERE code = 'plus';
UPDATE public.plans SET price_cents = 2000 WHERE code = 'pro';
UPDATE public.plans SET price_cents = 8000 WHERE code = 'business';