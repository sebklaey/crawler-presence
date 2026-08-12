-- Make the fail-closed, backend-only access model explicit for these tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mcp_sessions','mcp_rate_limits','presence_aliases',
    'presence_analytics_events','publish_intents','published_presences'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "Deny all client access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Deny all client access" ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t);
    EXECUTE format(
      'COMMENT ON TABLE public.%I IS %L', t,
      'Backend-only table. No client (anon/authenticated) access: privileges revoked and a restrictive deny-all RLS policy is in place. All access goes through trusted server code using the service role.');
  END LOOP;
END $$;