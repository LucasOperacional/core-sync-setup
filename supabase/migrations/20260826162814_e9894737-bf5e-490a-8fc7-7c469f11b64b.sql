CREATE TABLE public.arquivos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gerente_id uuid REFERENCES public.gerentes(id) ON DELETE SET NULL,
  nome text NOT NULL,
  caminho text NOT NULL UNIQUE,
  tamanho integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arquivos TO authenticated;
GRANT ALL ON public.arquivos TO service_role;

ALTER TABLE public.arquivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arquivos readable" ON public.arquivos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "arquivos admin write" ON public.arquivos
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX arquivos_gerente_id_idx ON public.arquivos(gerente_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_arquivos_updated_at BEFORE UPDATE ON public.arquivos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "relatorios read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'relatorios');

CREATE POLICY "relatorios admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'relatorios' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "relatorios admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'relatorios' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "relatorios admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'relatorios' AND private.has_role(auth.uid(), 'admin'::app_role));