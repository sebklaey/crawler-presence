CREATE OR REPLACE FUNCTION public.sugar_append_event(
  p_account uuid,
  p_type text,
  p_counterparty uuid,
  p_amount bigint,
  p_group uuid,
  p_metadata jsonb,
  p_signing_key text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
  v_hash := encode(extensions.digest(v_payload || v_prev, 'sha256'), 'hex');

  INSERT INTO public.sugar_ledger_events (
    sequence_number, event_id, event_type, account_id, counterparty_account_id,
    amount, transfer_group_id, previous_hash, event_hash, server_signature, metadata, created_at
  ) VALUES (
    v_seq, v_event, p_type, p_account, p_counterparty, p_amount, p_group, v_prev, v_hash,
    encode(extensions.hmac(v_hash, coalesce(p_signing_key, ''), 'sha256'), 'hex'), coalesce(p_metadata, '{}'::jsonb), v_created
  );

  UPDATE public.sugar_global_state
     SET latest_sequence_number = v_seq, latest_event_hash = v_hash, updated_at = now()
   WHERE singleton_id = 1;

  RETURN v_seq;
END; $$;

CREATE OR REPLACE FUNCTION public.sugar_verify_ledger(p_signing_key text, p_limit integer DEFAULT 100000)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
    v_hash := encode(extensions.digest(v_payload || v_prev, 'sha256'), 'hex');
    IF v_row.previous_hash <> v_prev OR v_row.event_hash <> v_hash THEN
      RETURN jsonb_build_object('valid', false, 'broken_at', v_row.sequence_number, 'checked', v_checked);
    END IF;
    IF v_row.server_signature <> encode(extensions.hmac(v_hash, coalesce(p_signing_key, ''), 'sha256'), 'hex') THEN
      RETURN jsonb_build_object('valid', false, 'broken_at', v_row.sequence_number, 'checked', v_checked, 'reason', 'signature');
    END IF;
    v_prev := v_hash;
    v_checked := v_checked + 1;
  END LOOP;
  RETURN jsonb_build_object('valid', true, 'checked', v_checked, 'latest_hash', v_prev);
END; $$;