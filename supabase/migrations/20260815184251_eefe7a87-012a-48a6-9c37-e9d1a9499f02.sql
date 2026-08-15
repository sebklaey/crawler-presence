-- 1. Fencing token for lease ownership + tie-breaker id for the mirror.
ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS claim_token uuid;

ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS last_event_id text;

-- 2. Claim: returns a per-attempt fencing token. Only the holder may finalize.
CREATE OR REPLACE FUNCTION public.claim_payment_event(
  p_event_id text,
  p_event_type text,
  p_environment text,
  p_intent_ref text DEFAULT NULL,
  p_subscription_id text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL,
  p_correlation_id text DEFAULT NULL,
  p_lease_seconds integer DEFAULT 300,
  p_max_attempts integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_events%ROWTYPE;
  v_now timestamptz := pg_catalog.now();
  v_token uuid := pg_catalog.gen_random_uuid();
BEGIN
  INSERT INTO public.payment_events (
    event_id, event_type, environment, intent_ref, subscription_id, occurred_at,
    status, attempts, lease_expires_at, correlation_id, claim_token
  ) VALUES (
    p_event_id, p_event_type, p_environment, p_intent_ref, p_subscription_id, p_occurred_at,
    'processing', 1, v_now + pg_catalog.make_interval(secs => p_lease_seconds), p_correlation_id, v_token
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'outcome', 'claimed', 'attempts', v_row.attempts, 'claim_token', v_token);
  END IF;

  SELECT * INTO v_row FROM public.payment_events WHERE event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'retry_later', 'attempts', 0);
  END IF;

  IF v_row.status = 'processed' THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'processed', 'attempts', v_row.attempts);
  END IF;

  IF v_row.status = 'exhausted' THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'exhausted', 'attempts', v_row.attempts);
  END IF;

  IF v_row.status IN ('received', 'processing')
     AND v_row.lease_expires_at IS NOT NULL
     AND v_row.lease_expires_at > v_now THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'in_progress', 'attempts', v_row.attempts);
  END IF;

  IF v_row.attempts >= p_max_attempts THEN
    UPDATE public.payment_events
       SET status = 'exhausted', lease_expires_at = NULL, claim_token = NULL, updated_at = v_now
     WHERE event_id = p_event_id;
    RETURN pg_catalog.jsonb_build_object('outcome', 'exhausted', 'attempts', v_row.attempts);
  END IF;

  UPDATE public.payment_events
     SET status = 'processing',
         attempts = v_row.attempts + 1,
         lease_expires_at = v_now + pg_catalog.make_interval(secs => p_lease_seconds),
         correlation_id = COALESCE(p_correlation_id, v_row.correlation_id),
         claim_token = v_token,
         error_code = NULL,
         updated_at = v_now
   WHERE event_id = p_event_id
  RETURNING * INTO v_row;

  RETURN pg_catalog.jsonb_build_object(
    'outcome', 'reclaimed', 'attempts', v_row.attempts, 'claim_token', v_token);
END;
$$;

-- 3. Finish: fenced. A stale worker changes nothing and learns it lost the lease.
CREATE OR REPLACE FUNCTION public.finish_payment_event(
  p_event_id text,
  p_claim_token uuid,
  p_error_code text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_events%ROWTYPE;
BEGIN
  IF p_claim_token IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('applied', false, 'reason', 'missing_claim_token');
  END IF;

  UPDATE public.payment_events
     SET status = CASE WHEN p_error_code IS NULL THEN 'processed' ELSE 'failed' END,
         processed_at = pg_catalog.now(),
         lease_expires_at = NULL,
         claim_token = NULL,
         error_code = pg_catalog.left(p_error_code, 64),
         error = NULL,
         correlation_id = COALESCE(p_correlation_id, correlation_id),
         updated_at = pg_catalog.now()
   WHERE event_id = p_event_id
     AND claim_token = p_claim_token
     AND status = 'processing'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('applied', false, 'reason', 'lease_lost');
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'applied', true, 'status', v_row.status, 'attempts', v_row.attempts);
END;
$$;

-- 4. Mirror: fail closed on missing ordering information; deterministic ties.
CREATE OR REPLACE FUNCTION public.mirror_subscription_monotonic(
  p_subscription_id text,
  p_customer_id text,
  p_status text,
  p_price_id text,
  p_product_id text,
  p_plan text,
  p_environment text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_scheduled_change_action text,
  p_scheduled_change_at timestamptz,
  p_canceled_at timestamptz,
  p_occurred_at timestamptz,
  p_event_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_existing public.billing_subscriptions%ROWTYPE;
  v_applied integer := 0;
BEGIN
  -- Subscription state may never be mutated by an event we cannot order.
  IF p_occurred_at IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'applied', false, 'stale', false, 'rejected', 'missing_occurred_at');
  END IF;

  SELECT * INTO v_existing FROM public.billing_subscriptions
   WHERE subscription_id = p_subscription_id FOR UPDATE;

  IF FOUND AND v_existing.last_event_occurred_at IS NOT NULL THEN
    IF p_occurred_at < v_existing.last_event_occurred_at THEN
      RETURN pg_catalog.jsonb_build_object('applied', false, 'stale', true);
    END IF;

    IF p_occurred_at = v_existing.last_event_occurred_at THEN
      -- Same instant: only the very same provider event is a safe idempotent
      -- replay. A different event sharing the timestamp is ambiguous and is
      -- rejected instead of resolved by last-writer-wins.
      IF p_event_id IS NOT NULL AND v_existing.last_event_id IS NOT NULL
         AND p_event_id = v_existing.last_event_id THEN
        RETURN pg_catalog.jsonb_build_object(
          'applied', true, 'stale', false, 'idempotent', true);
      END IF;
      RETURN pg_catalog.jsonb_build_object(
        'applied', false, 'stale', false, 'rejected', 'equal_timestamp_conflict');
    END IF;
  END IF;

  INSERT INTO public.billing_subscriptions (
    subscription_id, customer_id, status, price_id, product_id, plan, environment,
    current_period_start, current_period_end, scheduled_change_action, scheduled_change_at,
    canceled_at, last_event_occurred_at, last_event_id, updated_at
  ) VALUES (
    p_subscription_id, COALESCE(p_customer_id, 'unknown'), p_status, p_price_id, p_product_id,
    p_plan, p_environment, p_current_period_start, p_current_period_end,
    p_scheduled_change_action, p_scheduled_change_at, p_canceled_at, p_occurred_at, p_event_id,
    pg_catalog.now()
  )
  ON CONFLICT (subscription_id) DO UPDATE
     SET customer_id = COALESCE(EXCLUDED.customer_id, public.billing_subscriptions.customer_id),
         status = EXCLUDED.status,
         price_id = EXCLUDED.price_id,
         product_id = EXCLUDED.product_id,
         plan = EXCLUDED.plan,
         environment = EXCLUDED.environment,
         current_period_start = EXCLUDED.current_period_start,
         current_period_end = EXCLUDED.current_period_end,
         scheduled_change_action = EXCLUDED.scheduled_change_action,
         scheduled_change_at = EXCLUDED.scheduled_change_at,
         canceled_at = EXCLUDED.canceled_at,
         last_event_occurred_at = EXCLUDED.last_event_occurred_at,
         last_event_id = EXCLUDED.last_event_id,
         updated_at = pg_catalog.now()
     -- Never let an undated or older event overwrite dated state, even when
     -- two deliveries race between the SELECT above and this statement.
     WHERE EXCLUDED.last_event_occurred_at IS NOT NULL
       AND (public.billing_subscriptions.last_event_occurred_at IS NULL
            OR EXCLUDED.last_event_occurred_at >= public.billing_subscriptions.last_event_occurred_at);

  GET DIAGNOSTICS v_applied = ROW_COUNT;
  RETURN pg_catalog.jsonb_build_object('applied', v_applied > 0, 'stale', v_applied = 0);
END;
$$;

-- 5. Lock down execution: PUBLIC first, then the Data API roles.
DROP FUNCTION IF EXISTS public.finish_payment_event(text, text, text);
DROP FUNCTION IF EXISTS public.mirror_subscription_monotonic(
  text, text, text, text, text, text, text, timestamptz, timestamptz, text, timestamptz, timestamptz, timestamptz);

DO $$
DECLARE
  v_fn text;
BEGIN
  FOR v_fn IN
    SELECT pg_catalog.format('public.%I(%s)', p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid))
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', v_fn);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END LOOP;
END;
$$;