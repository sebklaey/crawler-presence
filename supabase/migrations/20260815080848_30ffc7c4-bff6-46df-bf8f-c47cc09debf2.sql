CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('room-retention-hourly')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'room-retention-hourly');

SELECT cron.schedule(
  'room-retention-hourly',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://crawler.today/api/public/room-retention',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'REPORTS_CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
