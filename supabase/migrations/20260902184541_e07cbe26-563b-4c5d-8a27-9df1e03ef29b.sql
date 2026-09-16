CREATE TABLE public.monitoring_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  prefixo text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  total_requisicoes integer NOT NULL DEFAULT 0,
  revogado_em timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_tokens TO authenticated;
GRANT ALL ON public.monitoring_tokens TO service_role;
ALTER TABLE public.monitoring_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam tokens de monitoramento"
ON public.monitoring_tokens FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.monitoring_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES public.monitoring_tokens(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  status integer NOT NULL,
  duracao_ms integer,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX monitoring_pings_created_at_idx ON public.monitoring_pings (created_at DESC);

GRANT SELECT ON public.monitoring_pings TO authenticated;
GRANT ALL ON public.monitoring_pings TO service_role;
ALTER TABLE public.monitoring_pings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem pings de monitoramento"
ON public.monitoring_pings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));