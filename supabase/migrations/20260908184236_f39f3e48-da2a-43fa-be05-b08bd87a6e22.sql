-- lovable-cron-fallback-reviewed: 1440 runs/day; heartbeat de disponibilidade exigido pelo painel central a cada minuto
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('monitor-heartbeat-minuto')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monitor-heartbeat-minuto');

SELECT cron.schedule(
  'monitor-heartbeat-minuto',
  '* * * * *',
  $$
  SELECT extensions.http_post(
    url := 'https://project--5300fe80-e9a2-4988-b187-c7e591896ac0.lovable.app/api/public/monitor-heartbeat',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT token FROM public.monitor_cron ORDER BY created_at LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);