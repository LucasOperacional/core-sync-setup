CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity text NOT NULL,
  resource text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity, resource)
);

GRANT SELECT ON public.security_rate_limits TO authenticated;
GRANT ALL ON public.security_rate_limits TO service_role;
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_rate_limits" ON public.security_rate_limits
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.security_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity text NOT NULL,
  reason text NOT NULL,
  severity text NOT NULL DEFAULT 'high',
  blocked_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity)
);

GRANT SELECT ON public.security_blocklist TO authenticated;
GRANT ALL ON public.security_blocklist TO service_role;
ALTER TABLE public.security_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_blocklist" ON public.security_blocklist
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.security_api_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  card_key text NOT NULL,
  resource text NOT NULL,
  outcome text NOT NULL,
  http_status integer,
  latency_ms integer,
  message text,
  severity text NOT NULL DEFAULT 'low',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_api_events_created_at_idx ON public.security_api_events (created_at DESC);
CREATE INDEX IF NOT EXISTS security_api_events_card_idx ON public.security_api_events (card_key);

GRANT SELECT, INSERT ON public.security_api_events TO authenticated;
GRANT ALL ON public.security_api_events TO service_role;
ALTER TABLE public.security_api_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_insert_own_api_events" ON public.security_api_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "users_read_own_api_events" ON public.security_api_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins_read_api_events" ON public.security_api_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.security_check_rate_limit(
  _identity text,
  _resource text,
  _limit integer,
  _window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
  _row public.security_rate_limits;
  _blocked public.security_blocklist;
  _count integer;
BEGIN
  SELECT * INTO _blocked FROM public.security_blocklist
   WHERE identity = _identity AND blocked_until > _now LIMIT 1;
  IF _blocked.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'blocked', true, 'reason', _blocked.reason,
      'retry_after_seconds', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_blocked.blocked_until - _now)))::int),
      'count', 0, 'limit', _limit
    );
  END IF;

  INSERT INTO public.security_rate_limits (identity, resource, window_start, request_count, updated_at)
  VALUES (_identity, _resource, _now, 1, _now)
  ON CONFLICT (identity, resource) DO UPDATE
    SET request_count = CASE
          WHEN public.security_rate_limits.window_start < _now - make_interval(secs => _window_seconds) THEN 1
          ELSE public.security_rate_limits.request_count + 1
        END,
        window_start = CASE
          WHEN public.security_rate_limits.window_start < _now - make_interval(secs => _window_seconds) THEN _now
          ELSE public.security_rate_limits.window_start
        END,
        updated_at = _now
  RETURNING * INTO _row;

  _count := _row.request_count;

  IF _count > _limit THEN
    INSERT INTO public.security_blocklist (identity, reason, severity, blocked_until)
    VALUES (_identity,
            format('Excesso de chamadas em %s (%s/%s por %ss)', _resource, _count, _limit, _window_seconds),
            'high', _now + make_interval(secs => _window_seconds))
    ON CONFLICT (identity) DO UPDATE
      SET reason = EXCLUDED.reason,
          severity = EXCLUDED.severity,
          blocked_until = EXCLUDED.blocked_until,
          created_at = _now;

    RETURN jsonb_build_object(
      'allowed', false, 'blocked', true,
      'reason', format('Limite de %s chamadas por %ss excedido em %s', _limit, _window_seconds, _resource),
      'retry_after_seconds', _window_seconds, 'count', _count, 'limit', _limit
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'blocked', false, 'count', _count, 'limit', _limit,
    'retry_after_seconds', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.security_check_rate_limit(text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_check_rate_limit(text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.security_check_rate_limit(text, text, integer, integer) TO authenticated, service_role;