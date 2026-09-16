CREATE TABLE public.faltas_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  caminho text NOT NULL,
  tamanho bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.faltas_arquivos TO authenticated;
GRANT ALL ON public.faltas_arquivos TO service_role;

ALTER TABLE public.faltas_arquivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem consultar arquivos de faltas"
  ON public.faltas_arquivos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Administradores podem gerenciar arquivos de faltas"
  ON public.faltas_arquivos FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
