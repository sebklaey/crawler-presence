-- Anonymous, capability-based ownership. No user accounts anywhere.

CREATE TABLE public.publish_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_ref text NOT NULL UNIQUE,
  session_token text,
  plan text NOT NULL DEFAULT 'plus',
  status text NOT NULL DEFAULT 'pending',
  environment text NOT NULL DEFAULT 'sandbox',
  stripe_checkout_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  current_period_end timestamp with time zone,
  presence_slug text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days')
);

GRANT ALL ON public.publish_intents TO service_role;

ALTER TABLE public.publish_intents ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: reachable only through the server-side service-role client.

CREATE TRIGGER publish_intents_updated_at
BEFORE UPDATE ON public.publish_intents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX publish_intents_session_idx ON public.publish_intents (session_token);
CREATE INDEX publish_intents_subscription_idx ON public.publish_intents (stripe_subscription_id);

-- Capability-based management of a published Presence.
ALTER TABLE public.published_presences
  ADD COLUMN manage_secret_hash text,
  ADD COLUMN manage_secret_updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN status text NOT NULL DEFAULT 'live',
  ADD COLUMN intent_ref text,
  ADD COLUMN stripe_customer_id text,
  ADD COLUMN stripe_subscription_id text,
  ADD COLUMN subscription_status text,
  ADD COLUMN current_period_end timestamp with time zone,
  ADD COLUMN unpublished_at timestamp with time zone;

-- Never persist a raw management secret again.
ALTER TABLE public.published_presences ALTER COLUMN claim_token DROP NOT NULL;
UPDATE public.published_presences SET claim_token = NULL;

-- Remove every account linkage.
ALTER TABLE public.published_presences DROP COLUMN IF EXISTS owner_user_id;
ALTER TABLE public.mcp_sessions DROP COLUMN IF EXISTS owner_user_id;

DROP FUNCTION IF EXISTS public.has_active_subscription(uuid, text);
DROP TABLE IF EXISTS public.subscriptions;