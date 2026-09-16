CREATE TABLE public.user_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text,
  user_nome text,
  acao text NOT NULL,
  modulo text NOT NULL DEFAULT 'geral',
  rota text,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.user_activity_logs TO authenticated;
GRANT ALL ON public.user_activity_logs TO service_role;

ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Atividades: registrar as proprias"
  ON public.user_activity_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Atividades: ver as proprias"
  ON public.user_activity_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Atividades: gestores veem todas"
  ON public.user_activity_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cordenador') OR public.has_role(auth.uid(), 'diretor'));

CREATE INDEX user_activity_logs_created_at_idx ON public.user_activity_logs (created_at DESC);
CREATE INDEX user_activity_logs_user_idx ON public.user_activity_logs (user_id, created_at DESC);
CREATE INDEX user_activity_logs_modulo_idx ON public.user_activity_logs (modulo);