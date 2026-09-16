CREATE TABLE IF NOT EXISTS public.protocolo_cartoes_ponto (
  id TEXT PRIMARY KEY,
  numero TEXT NOT NULL,
  empresa TEXT NOT NULL,
  colaboradores JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_geracao TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolo_cartoes_ponto TO authenticated;
GRANT ALL ON public.protocolo_cartoes_ponto TO service_role;

ALTER TABLE public.protocolo_cartoes_ponto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage protocolos"
ON public.protocolo_cartoes_ponto FOR ALL TO authenticated
USING (true) WITH CHECK (true);