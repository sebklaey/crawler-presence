REVOKE EXECUTE ON FUNCTION public.love_cleanup_expired() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sugar_activity(text, text, integer, integer, integer, integer, integer, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sugar_admin_set_frozen(text, boolean, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sugar_append_event(uuid, text, uuid, bigint, uuid, jsonb, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sugar_ensure_account(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sugar_transfer(text, text, bigint, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sugar_verify_ledger(text, integer) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.love_cleanup_expired() TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_activity(text, text, integer, integer, integer, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_admin_set_frozen(text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_append_event(uuid, text, uuid, bigint, uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_ensure_account(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_transfer(text, text, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_verify_ledger(text, integer) TO service_role;