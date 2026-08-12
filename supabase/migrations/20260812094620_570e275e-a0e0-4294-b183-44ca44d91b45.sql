DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mcp_sessions','mcp_rate_limits','published_presences','publish_intents','presence_aliases','presence_analytics_events'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated, PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;