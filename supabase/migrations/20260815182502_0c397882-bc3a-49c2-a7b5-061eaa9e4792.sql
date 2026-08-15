-- Additive, idempotent forward repair for provider webhook idempotency + ordering.

-- 1. Audit table that keeps duplicate rows instead of deleting them.
CREATE TABLE IF NOT EXISTS public.payment_event_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id uuid,
  event_id text NOT NULL,
  event_type text,
  environment text,
  intent_ref text,
  subscription_id text,
  occurred_at timestamptz,
  status text,
  quarantined_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.payment_event_duplicates TO service_role;
ALTER TABLE public.payment_event_duplicates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'payment_event_duplicates'
       AND policyname = 'payment event duplicates are backend only'
  ) THEN
    CREATE POLICY "payment event duplicates are backend only"
      ON public.payment_event_duplicates FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'payment_event_duplicates'
       AND policyname = 'Deny all client access'
  ) THEN
    CREATE POLICY "Deny all client access"
      ON public.payment_event_duplicates AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

-- 2. Move pre-existing duplicates aside (keeps the oldest row as canonical).
WITH ranked AS (
  SELECT id, event_id, event_type, environment, intent_ref, subscription_id,
         occurred_at, status,
         row_number() OVER (PARTITION BY event_id ORDER BY created_at ASC, id ASC) AS rn
    FROM public.payment_events
), dupes AS (
  SELECT * FROM ranked WHERE rn > 1
), moved AS (
  INSERT INTO public.payment_event_duplicates
    (original_id, event_id, event_type, environment, intent_ref, subscription_id, occurred_at, status)
  SELECT id, event_id, event_type, environment, intent_ref, subscription_id, occurred_at, status
    FROM dupes
  RETURNING original_id
)
DELETE FROM public.payment_events pe
 USING moved
 WHERE pe.id = moved.original_id;

-- 3. Guarantee the uniqueness the handler relies on (no-op when it exists).
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_event_id_key
  ON public.payment_events (event_id);

CREATE INDEX IF NOT EXISTS payment_events_subscription_occurred_idx
  ON public.payment_events (subscription_id, occurred_at DESC);

-- 4. Monotonic ordering marker for mirrored subscription state.
ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS last_event_occurred_at timestamptz;