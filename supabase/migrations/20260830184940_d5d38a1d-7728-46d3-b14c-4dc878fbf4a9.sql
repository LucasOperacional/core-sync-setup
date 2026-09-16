CREATE TABLE IF NOT EXISTS public.protocolo_arquivos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  protocolo_id UUID NOT NULL REFERENCES public.protocolos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  caminho TEXT NOT NULL,
  tamanho BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS protocolo_arquivos_protocolo_idx ON public.protocolo_arquivos (protocolo_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolo_arquivos TO authenticated;
GRANT ALL ON public.protocolo_arquivos TO service_role;
ALTER TABLE public.protocolo_arquivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "protocolo_arquivos_own" ON public.protocolo_arquivos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.protocolos p WHERE p.id = protocolo_arquivos.protocolo_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.protocolos p WHERE p.id = protocolo_arquivos.protocolo_id AND p.user_id = auth.uid()));
CREATE POLICY "protocolo_arquivos_admin" ON public.protocolo_arquivos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));