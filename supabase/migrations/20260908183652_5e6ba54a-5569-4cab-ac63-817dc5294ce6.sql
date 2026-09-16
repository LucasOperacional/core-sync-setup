CREATE TABLE public.monitor_heartbeats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  versao TEXT,
  ambiente TEXT,
  tentativas INTEGER NOT NULL DEFAULT 1,
  ok BOOLEAN NOT NULL DEFAULT false,
  erro TEXT,
  checks JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.monitor_heartbeats TO authenticated;
GRANT ALL ON public.monitor_heartbeats TO service_role;
ALTER TABLE public.monitor_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins veem heartbeats" ON public.monitor_heartbeats FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.monitor_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  rota TEXT,
  status_http INTEGER,
  origem TEXT,
  enviado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.monitor_errors TO authenticated;
GRANT ALL ON public.monitor_errors TO service_role;
ALTER TABLE public.monitor_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins veem erros do monitor" ON public.monitor_errors FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.monitor_recovery_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acao TEXT NOT NULL,
  resultado TEXT NOT NULL,
  detalhe TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.monitor_recovery_log TO authenticated;
GRANT ALL ON public.monitor_recovery_log TO service_role;
ALTER TABLE public.monitor_recovery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins veem recuperacao" ON public.monitor_recovery_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.monitor_cron (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.monitor_cron TO service_role;
ALTER TABLE public.monitor_cron ENABLE ROW LEVEL SECURITY;

INSERT INTO public.monitor_cron (token) VALUES (encode(gen_random_bytes(32), 'hex'));

CREATE INDEX monitor_heartbeats_created_idx ON public.monitor_heartbeats (created_at DESC);
CREATE INDEX monitor_errors_created_idx ON public.monitor_errors (created_at DESC);