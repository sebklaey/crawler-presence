-- Forward, idempotent repair: publish intents must not hold raw draft session
-- capabilities. Lookup moves to a SHA-256 hash with the same
-- "crawler-session-v1" domain separator the application uses.
alter table public.publish_intents
  add column if not exists session_token_hash text;

create index if not exists publish_intents_session_hash_idx
  on public.publish_intents (session_token_hash)
  where session_token_hash is not null;

create extension if not exists pgcrypto with schema extensions;

update public.publish_intents
   set session_token_hash = encode(
         extensions.digest('crawler-session-v1:' || session_token, 'sha256'), 'hex')
 where session_token is not null
   and session_token not like 'redacted:%'
   and session_token_hash is null;

update public.publish_intents
   set session_token = 'redacted:' || left(session_token_hash, 32)
 where session_token is not null
   and session_token not like 'redacted:%'
   and session_token_hash is not null;