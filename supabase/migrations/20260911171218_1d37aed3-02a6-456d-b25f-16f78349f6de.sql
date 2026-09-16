ALTER TABLE public.solicitacoes_vagas ADD COLUMN IF NOT EXISTS decidido_por UUID;

UPDATE public.monitoring_tokens SET prefixo = '' WHERE prefixo IS NULL;
ALTER TABLE public.monitoring_tokens ALTER COLUMN prefixo SET DEFAULT '';
ALTER TABLE public.monitoring_tokens ALTER COLUMN prefixo SET NOT NULL;

UPDATE public.monitoring_pings SET endpoint = '' WHERE endpoint IS NULL;
ALTER TABLE public.monitoring_pings ALTER COLUMN endpoint SET DEFAULT '';
ALTER TABLE public.monitoring_pings ALTER COLUMN endpoint SET NOT NULL;
UPDATE public.monitoring_pings SET status = 0 WHERE status IS NULL;
ALTER TABLE public.monitoring_pings ALTER COLUMN status SET DEFAULT 0;
ALTER TABLE public.monitoring_pings ALTER COLUMN status SET NOT NULL;

CREATE OR REPLACE FUNCTION public.security_check_rate_limit(
  _identity TEXT,
  _resource TEXT,
  _limit INTEGER,
  _window_seconds INTEGER
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT private.security_check_rate_limit(_identity, _resource, _limit, _window_seconds);
$$;
REVOKE ALL ON FUNCTION public.security_check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;