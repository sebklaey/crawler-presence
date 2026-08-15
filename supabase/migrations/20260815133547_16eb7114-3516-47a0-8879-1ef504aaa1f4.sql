CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================== tables ==============================

CREATE TABLE public.sugar_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  public_account_reference text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_minted bigint NOT NULL DEFAULT 0 CHECK (lifetime_minted >= 0),
  lifetime_received bigint NOT NULL DEFAULT 0 CHECK (lifetime_received >= 0),
  lifetime_sent bigint NOT NULL DEFAULT 0 CHECK (lifetime_sent >= 0),
  lifetime_burned_from_gifts bigint NOT NULL DEFAULT 0 CHECK (lifetime_burned_from_gifts >= 0),
  mining_remainder_seconds integer NOT NULL DEFAULT 0 CHECK (mining_remainder_seconds >= 0),
  mining_status text NOT NULL DEFAULT 'idle',
  last_qualified_activity_at timestamptz,
  current_lease_expires_at timestamptz,
  daily_minted_amount bigint NOT NULL DEFAULT 0 CHECK (daily_minted_amount >= 0),
  daily_window_started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  frozen_at timestamptz
);
GRANT ALL ON public.sugar_accounts TO service_role;
ALTER TABLE public.sugar_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sugar_ledger_events (
  sequence_number bigint PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('MINT','TRANSFER_OUT','TRANSFER_IN','BURN','ADMIN_FREEZE','ADMIN_UNFREEZE')),
  account_id uuid NOT NULL REFERENCES public.sugar_accounts(id) ON DELETE RESTRICT,
  counterparty_account_id uuid REFERENCES public.sugar_accounts(id) ON DELETE RESTRICT,
  amount bigint NOT NULL DEFAULT 0 CHECK (amount >= 0),
  transfer_group_id uuid,
  previous_hash text NOT NULL,
  event_hash text NOT NULL,
  server_signature text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sugar_ledger_account_idx ON public.sugar_ledger_events(account_id, sequence_number DESC);
GRANT ALL ON public.sugar_ledger_events TO service_role;
ALTER TABLE public.sugar_ledger_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sugar_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_account_id uuid NOT NULL REFERENCES public.sugar_accounts(id) ON DELETE RESTRICT,
  recipient_account_id uuid NOT NULL REFERENCES public.sugar_accounts(id) ON DELETE RESTRICT,
  requested_amount bigint NOT NULL CHECK (requested_amount > 0),
  recipient_amount bigint NOT NULL CHECK (recipient_amount >= 0),
  burned_amount bigint NOT NULL CHECK (burned_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected','failed')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (sender_account_id, idempotency_key)
);
GRANT ALL ON public.sugar_transfers TO service_role;
ALTER TABLE public.sugar_transfers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sugar_global_state (
  singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  maximum_supply bigint NOT NULL DEFAULT 10000000 CHECK (maximum_supply > 0),
  current_supply bigint NOT NULL DEFAULT 0 CHECK (current_supply >= 0),
  lifetime_minted bigint NOT NULL DEFAULT 0,
  lifetime_burned bigint NOT NULL DEFAULT 0,
  latest_sequence_number bigint NOT NULL DEFAULT 0,
  latest_event_hash text NOT NULL DEFAULT repeat('0', 64),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sugar_global_state TO service_role;
ALTER TABLE public.sugar_global_state ENABLE ROW LEVEL SECURITY;
INSERT INTO public.sugar_global_state (singleton_id) VALUES (1);

CREATE TABLE public.sugar_mining_leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.sugar_accounts(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  qualified_seconds integer NOT NULL DEFAULT 0 CHECK (qualified_seconds >= 0),
  source_action text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','settled','expired','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sugar_leases_account_idx ON public.sugar_mining_leases(account_id, created_at DESC);
CREATE UNIQUE INDEX sugar_leases_one_active ON public.sugar_mining_leases(account_id) WHERE status = 'active';
GRANT ALL ON public.sugar_mining_leases TO service_role;
ALTER TABLE public.sugar_mining_leases ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER sugar_accounts_touch BEFORE UPDATE ON public.sugar_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- append-only guard: no updates or deletes on ledger events
CREATE OR REPLACE FUNCTION public.sugar_ledger_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'SUGAR_LEDGER_APPEND_ONLY';
END; $$;

CREATE TRIGGER sugar_ledger_no_update BEFORE UPDATE OR DELETE ON public.sugar_ledger_events
  FOR EACH ROW EXECUTE FUNCTION public.sugar_ledger_append_only();

-- ============================== helpers ==============================

CREATE OR REPLACE FUNCTION public.sugar_append_event(
  p_account uuid,
  p_type text,
  p_counterparty uuid,
  p_amount bigint,
  p_group uuid,
  p_metadata jsonb,
  p_signing_key text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seq bigint;
  v_prev text;
  v_payload text;
  v_hash text;
  v_created timestamptz := now();
  v_event uuid := gen_random_uuid();
BEGIN
  SELECT latest_sequence_number + 1, latest_event_hash
    INTO v_seq, v_prev
    FROM public.sugar_global_state WHERE singleton_id = 1 FOR UPDATE;

  v_payload := concat_ws('|', v_seq::text, v_event::text, p_type, p_account::text,
                         coalesce(p_counterparty::text, ''), p_amount::text,
                         coalesce(p_group::text, ''), to_char(v_created AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.USOF'));
  v_hash := encode(digest(v_payload || v_prev, 'sha256'), 'hex');

  INSERT INTO public.sugar_ledger_events (
    sequence_number, event_id, event_type, account_id, counterparty_account_id,
    amount, transfer_group_id, previous_hash, event_hash, server_signature, metadata, created_at
  ) VALUES (
    v_seq, v_event, p_type, p_account, p_counterparty, p_amount, p_group, v_prev, v_hash,
    encode(hmac(v_hash, coalesce(p_signing_key, ''), 'sha256'), 'hex'), coalesce(p_metadata, '{}'::jsonb), v_created
  );

  UPDATE public.sugar_global_state
     SET latest_sequence_number = v_seq, latest_event_hash = v_hash, updated_at = now()
   WHERE singleton_id = 1;

  RETURN v_seq;
END; $$;

CREATE OR REPLACE FUNCTION public.sugar_ensure_account(p_user_key text)
RETURNS public.sugar_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_account public.sugar_accounts%ROWTYPE;
BEGIN
  IF p_user_key IS NULL OR length(trim(p_user_key)) = 0 THEN
    RAISE EXCEPTION 'SUGAR_IDENTITY_REQUIRED';
  END IF;
  SELECT * INTO v_account FROM public.sugar_accounts WHERE user_id = p_user_key;
  IF NOT FOUND THEN
    INSERT INTO public.sugar_accounts (user_id) VALUES (p_user_key)
      ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_account FROM public.sugar_accounts WHERE user_id = p_user_key;
  END IF;
  RETURN v_account;
END; $$;

-- ============================== mining ==============================

CREATE OR REPLACE FUNCTION public.sugar_activity(
  p_user_key text,
  p_source_action text,
  p_lease_seconds integer,
  p_activity_window_seconds integer,
  p_minutes_per_unit integer,
  p_daily_cap integer,
  p_min_age_hours integer,
  p_signing_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account public.sugar_accounts%ROWTYPE;
  v_state public.sugar_global_state%ROWTYPE;
  v_now timestamptz := now();
  v_elapsed integer := 0;
  v_seconds integer;
  v_units bigint;
  v_allowed bigint;
  v_headroom bigint;
  v_minted bigint := 0;
  v_status text;
  v_reason text := null;
BEGIN
  PERFORM public.sugar_ensure_account(p_user_key);
  SELECT * INTO v_account FROM public.sugar_accounts WHERE user_id = p_user_key FOR UPDATE;

  -- roll the 24h mining window
  IF v_account.daily_window_started_at < v_now - interval '24 hours' THEN
    v_account.daily_window_started_at := v_now;
    v_account.daily_minted_amount := 0;
  END IF;

  -- accumulate qualified seconds since the previous activity, capped by the window
  IF v_account.last_qualified_activity_at IS NOT NULL
     AND v_account.current_lease_expires_at IS NOT NULL
     AND v_account.current_lease_expires_at > v_account.last_qualified_activity_at THEN
    v_elapsed := GREATEST(0, LEAST(
      EXTRACT(EPOCH FROM (LEAST(v_now, v_account.current_lease_expires_at) - v_account.last_qualified_activity_at))::integer,
      p_activity_window_seconds));
  END IF;

  IF v_account.frozen_at IS NOT NULL THEN
    v_elapsed := 0;
    v_reason := 'frozen';
  END IF;

  IF v_account.created_at > v_now - make_interval(hours => p_min_age_hours) THEN
    v_elapsed := 0;
    v_reason := 'trust_period';
  END IF;

  v_seconds := v_account.mining_remainder_seconds + v_elapsed;
  v_units := (v_seconds / (p_minutes_per_unit * 60))::bigint;

  IF v_units > 0 THEN
    SELECT * INTO v_state FROM public.sugar_global_state WHERE singleton_id = 1 FOR UPDATE;
    v_allowed := GREATEST(0, p_daily_cap::bigint - v_account.daily_minted_amount);
    v_headroom := GREATEST(0, v_state.maximum_supply - v_state.current_supply);
    v_minted := LEAST(v_units, v_allowed, v_headroom);

    IF v_minted > 0 THEN
      PERFORM public.sugar_append_event(v_account.id, 'MINT', NULL, v_minted, NULL,
        jsonb_build_object('source_action', p_source_action), p_signing_key);
      UPDATE public.sugar_global_state
         SET current_supply = current_supply + v_minted,
             lifetime_minted = lifetime_minted + v_minted,
             updated_at = now()
       WHERE singleton_id = 1;
      v_account.balance := v_account.balance + v_minted;
      v_account.lifetime_minted := v_account.lifetime_minted + v_minted;
      v_account.daily_minted_amount := v_account.daily_minted_amount + v_minted;
    END IF;

    IF v_allowed = 0 THEN v_reason := 'daily_cap'; END IF;
    IF v_headroom = 0 THEN v_reason := 'max_supply'; END IF;
    v_seconds := v_seconds - (v_minted * p_minutes_per_unit * 60);
  END IF;

  -- start or extend a single lease
  UPDATE public.sugar_mining_leases
     SET status = 'expired'
   WHERE account_id = v_account.id AND status = 'active' AND expires_at <= v_now;

  IF v_reason IS NULL THEN
    UPDATE public.sugar_mining_leases
       SET expires_at = v_now + make_interval(secs => p_lease_seconds),
           qualified_seconds = qualified_seconds + v_elapsed,
           source_action = p_source_action
     WHERE account_id = v_account.id AND status = 'active';
    IF NOT FOUND THEN
      INSERT INTO public.sugar_mining_leases (account_id, expires_at, qualified_seconds, source_action)
      VALUES (v_account.id, v_now + make_interval(secs => p_lease_seconds), v_elapsed, p_source_action);
    END IF;
    v_status := 'active';
  ELSE
    UPDATE public.sugar_mining_leases SET status = 'settled'
     WHERE account_id = v_account.id AND status = 'active';
    v_status := 'paused';
  END IF;

  UPDATE public.sugar_accounts
     SET balance = v_account.balance,
         lifetime_minted = v_account.lifetime_minted,
         daily_minted_amount = v_account.daily_minted_amount,
         daily_window_started_at = v_account.daily_window_started_at,
         mining_remainder_seconds = v_seconds,
         mining_status = v_status,
         last_qualified_activity_at = v_now,
         current_lease_expires_at = CASE WHEN v_reason IS NULL
           THEN v_now + make_interval(secs => p_lease_seconds) ELSE NULL END
   WHERE id = v_account.id;

  SELECT * INTO v_state FROM public.sugar_global_state WHERE singleton_id = 1;

  RETURN jsonb_build_object(
    'minted_now', v_minted,
    'mining_status', v_status,
    'paused_reason', v_reason,
    'balance', v_account.balance,
    'lifetime_minted', v_account.lifetime_minted,
    'daily_minted', v_account.daily_minted_amount,
    'progress_seconds', v_seconds,
    'lease_expires_at', CASE WHEN v_reason IS NULL THEN (v_now + make_interval(secs => p_lease_seconds)) ELSE NULL END,
    'global_supply', v_state.current_supply,
    'global_maximum_supply', v_state.maximum_supply
  );
END; $$;

-- ============================== transfer ==============================

CREATE OR REPLACE FUNCTION public.sugar_transfer(
  p_sender_key text,
  p_recipient_key text,
  p_amount bigint,
  p_idempotency_key text,
  p_signing_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender public.sugar_accounts%ROWTYPE;
  v_recipient public.sugar_accounts%ROWTYPE;
  v_existing public.sugar_transfers%ROWTYPE;
  v_group uuid := gen_random_uuid();
  v_recv bigint;
  v_burn bigint;
  v_first uuid;
  v_second uuid;
  v_transfer uuid;
BEGIN
  IF p_amount IS NULL OR p_amount < 10 OR p_amount % 10 <> 0 THEN
    RAISE EXCEPTION 'SUGAR_INVALID_AMOUNT';
  END IF;
  IF p_sender_key = p_recipient_key THEN
    RAISE EXCEPTION 'SUGAR_SELF_TRANSFER';
  END IF;

  PERFORM public.sugar_ensure_account(p_sender_key);
  PERFORM public.sugar_ensure_account(p_recipient_key);

  -- deterministic lock order avoids deadlocks between concurrent transfers
  SELECT id INTO v_first FROM public.sugar_accounts WHERE user_id = p_sender_key;
  SELECT id INTO v_second FROM public.sugar_accounts WHERE user_id = p_recipient_key;
  IF v_first > v_second THEN
    PERFORM 1 FROM public.sugar_accounts WHERE id = v_second FOR UPDATE;
    PERFORM 1 FROM public.sugar_accounts WHERE id = v_first FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.sugar_accounts WHERE id = v_first FOR UPDATE;
    PERFORM 1 FROM public.sugar_accounts WHERE id = v_second FOR UPDATE;
  END IF;

  SELECT * INTO v_sender FROM public.sugar_accounts WHERE id = v_first;
  SELECT * INTO v_recipient FROM public.sugar_accounts WHERE id = v_second;

  SELECT * INTO v_existing FROM public.sugar_transfers
   WHERE sender_account_id = v_sender.id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'status', v_existing.status,
      'sender_spends', v_existing.requested_amount, 'recipient_receives', v_existing.recipient_amount,
      'burned', v_existing.burned_amount, 'balance', v_sender.balance);
  END IF;

  IF v_sender.frozen_at IS NOT NULL OR v_recipient.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'SUGAR_ACCOUNT_FROZEN';
  END IF;
  IF v_sender.balance < p_amount THEN
    RAISE EXCEPTION 'SUGAR_INSUFFICIENT_BALANCE';
  END IF;

  v_recv := p_amount * 3 / 10;
  v_burn := p_amount - v_recv;

  INSERT INTO public.sugar_transfers (sender_account_id, recipient_account_id, requested_amount,
    recipient_amount, burned_amount, status, idempotency_key)
  VALUES (v_sender.id, v_recipient.id, p_amount, v_recv, v_burn, 'pending', p_idempotency_key)
  RETURNING id INTO v_transfer;

  PERFORM public.sugar_append_event(v_sender.id, 'TRANSFER_OUT', v_recipient.id, p_amount, v_group, '{}'::jsonb, p_signing_key);
  PERFORM public.sugar_append_event(v_recipient.id, 'TRANSFER_IN', v_sender.id, v_recv, v_group, '{}'::jsonb, p_signing_key);
  PERFORM public.sugar_append_event(v_sender.id, 'BURN', v_recipient.id, v_burn, v_group, '{}'::jsonb, p_signing_key);

  UPDATE public.sugar_accounts
     SET balance = balance - p_amount,
         lifetime_sent = lifetime_sent + p_amount,
         lifetime_burned_from_gifts = lifetime_burned_from_gifts + v_burn
   WHERE id = v_sender.id;

  UPDATE public.sugar_accounts
     SET balance = balance + v_recv,
         lifetime_received = lifetime_received + v_recv
   WHERE id = v_recipient.id;

  UPDATE public.sugar_global_state
     SET current_supply = current_supply - v_burn,
         lifetime_burned = lifetime_burned + v_burn,
         updated_at = now()
   WHERE singleton_id = 1;

  UPDATE public.sugar_transfers SET status = 'completed', completed_at = now() WHERE id = v_transfer;

  SELECT * INTO v_sender FROM public.sugar_accounts WHERE id = v_first;

  RETURN jsonb_build_object('duplicate', false, 'status', 'completed',
    'sender_spends', p_amount, 'recipient_receives', v_recv, 'burned', v_burn,
    'balance', v_sender.balance);
END; $$;

-- ============================== integrity ==============================

CREATE OR REPLACE FUNCTION public.sugar_verify_ledger(p_signing_key text, p_limit integer DEFAULT 100000)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row record;
  v_prev text := repeat('0', 64);
  v_payload text;
  v_hash text;
  v_checked bigint := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM public.sugar_ledger_events ORDER BY sequence_number ASC LIMIT p_limit
  LOOP
    v_payload := concat_ws('|', v_row.sequence_number::text, v_row.event_id::text, v_row.event_type,
      v_row.account_id::text, coalesce(v_row.counterparty_account_id::text, ''), v_row.amount::text,
      coalesce(v_row.transfer_group_id::text, ''),
      to_char(v_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.USOF'));
    v_hash := encode(digest(v_payload || v_prev, 'sha256'), 'hex');
    IF v_row.previous_hash <> v_prev OR v_row.event_hash <> v_hash THEN
      RETURN jsonb_build_object('valid', false, 'broken_at', v_row.sequence_number, 'checked', v_checked);
    END IF;
    IF v_row.server_signature <> encode(hmac(v_hash, coalesce(p_signing_key, ''), 'sha256'), 'hex') THEN
      RETURN jsonb_build_object('valid', false, 'broken_at', v_row.sequence_number, 'checked', v_checked, 'reason', 'signature');
    END IF;
    v_prev := v_hash;
    v_checked := v_checked + 1;
  END LOOP;
  RETURN jsonb_build_object('valid', true, 'checked', v_checked, 'latest_hash', v_prev);
END; $$;

CREATE OR REPLACE FUNCTION public.sugar_admin_set_frozen(p_user_key text, p_frozen boolean, p_signing_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_account public.sugar_accounts%ROWTYPE;
BEGIN
  PERFORM public.sugar_ensure_account(p_user_key);
  SELECT * INTO v_account FROM public.sugar_accounts WHERE user_id = p_user_key FOR UPDATE;
  UPDATE public.sugar_accounts SET frozen_at = CASE WHEN p_frozen THEN now() ELSE NULL END
   WHERE id = v_account.id;
  PERFORM public.sugar_append_event(v_account.id,
    CASE WHEN p_frozen THEN 'ADMIN_FREEZE' ELSE 'ADMIN_UNFREEZE' END,
    NULL, 0, NULL, '{}'::jsonb, p_signing_key);
  RETURN jsonb_build_object('frozen', p_frozen);
END; $$;