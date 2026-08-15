ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS correlation_id text;

CREATE INDEX IF NOT EXISTS payment_events_status_idx ON public.payment_events (status, lease_expires_at);

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
SET search_path = public
AS $$
DECLARE
  v_row public.payment_events%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  INSERT INTO public.payment_events (
    event_id, event_type, environment, intent_ref, subscription_id, occurred_at,
    status, attempts, lease_expires_at, correlation_id
  ) VALUES (
    p_event_id, p_event_type, p_environment, p_intent_ref, p_subscription_id, p_occurred_at,
    'processing', 1, v_now + make_interval(secs => p_lease_seconds), p_correlation_id
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'claimed', 'attempts', v_row.attempts);
  END IF;

  SELECT * INTO v_row FROM public.payment_events WHERE event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'retry_later', 'attempts', 0);
  END IF;

  IF v_row.status = 'processed' THEN
    RETURN jsonb_build_object('outcome', 'processed', 'attempts', v_row.attempts);
  END IF;

  IF v_row.status = 'exhausted' THEN
    RETURN jsonb_build_object('outcome', 'exhausted', 'attempts', v_row.attempts);
  END IF;

  IF v_row.status IN ('received', 'processing')
     AND v_row.lease_expires_at IS NOT NULL
     AND v_row.lease_expires_at > v_now THEN
    RETURN jsonb_build_object('outcome', 'in_progress', 'attempts', v_row.attempts);
  END IF;

  IF v_row.attempts >= p_max_attempts THEN
    UPDATE public.payment_events
       SET status = 'exhausted', lease_expires_at = NULL, updated_at = v_now
     WHERE event_id = p_event_id;
    RETURN jsonb_build_object('outcome', 'exhausted', 'attempts', v_row.attempts);
  END IF;

  UPDATE public.payment_events
     SET status = 'processing',
         attempts = v_row.attempts + 1,
         lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
         correlation_id = COALESCE(p_correlation_id, v_row.correlation_id),
         error_code = NULL,
         updated_at = v_now
   WHERE event_id = p_event_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('outcome', 'reclaimed', 'attempts', v_row.attempts);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_payment_event(
  p_event_id text,
  p_error_code text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payment_events%ROWTYPE;
BEGIN
  UPDATE public.payment_events
     SET status = CASE WHEN p_error_code IS NULL THEN 'processed' ELSE 'failed' END,
         processed_at = now(),
         lease_expires_at = NULL,
         error_code = left(p_error_code, 64),
         error = NULL,
         correlation_id = COALESCE(p_correlation_id, correlation_id),
         updated_at = now()
   WHERE event_id = p_event_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', v_row.status, 'attempts', v_row.attempts);
END;
$$;

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
  p_occurred_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied boolean := false;
BEGIN
  INSERT INTO public.billing_subscriptions (
    subscription_id, customer_id, status, price_id, product_id, plan, environment,
    current_period_start, current_period_end, scheduled_change_action, scheduled_change_at,
    canceled_at, last_event_occurred_at, updated_at
  ) VALUES (
    p_subscription_id, COALESCE(p_customer_id, 'unknown'), p_status, p_price_id, p_product_id,
    p_plan, p_environment, p_current_period_start, p_current_period_end,
    p_scheduled_change_action, p_scheduled_change_at, p_canceled_at, p_occurred_at, now()
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
         last_event_occurred_at = COALESCE(EXCLUDED.last_event_occurred_at, public.billing_subscriptions.last_event_occurred_at),
         updated_at = now()
   WHERE public.billing_subscriptions.last_event_occurred_at IS NULL
      OR EXCLUDED.last_event_occurred_at IS NULL
      OR EXCLUDED.last_event_occurred_at >= public.billing_subscriptions.last_event_occurred_at;

  GET DIAGNOSTICS v_applied = ROW_COUNT;
  RETURN jsonb_build_object('applied', v_applied, 'stale', NOT v_applied);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_event(text, text, text, text, text, timestamptz, text, integer, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_payment_event(text, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mirror_subscription_monotonic(text, text, text, text, text, text, text, timestamptz, timestamptz, text, timestamptz, timestamptz, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_event(text, text, text, text, text, timestamptz, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_payment_event(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_subscription_monotonic(text, text, text, text, text, text, text, timestamptz, timestamptz, text, timestamptz, timestamptz, timestamptz) TO service_role;