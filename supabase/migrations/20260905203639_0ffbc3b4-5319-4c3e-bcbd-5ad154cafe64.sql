CREATE TABLE public.app_config (
  chave TEXT PRIMARY KEY,
  valor TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_config_select" ON public.app_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_config_admin_write" ON public.app_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'diretor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'diretor'));
GRANT INSERT, UPDATE, DELETE ON public.app_config TO authenticated;
INSERT INTO public.app_config (chave, valor) VALUES ('vagas_email_destino', 'recrutamento@operacional.cloud');