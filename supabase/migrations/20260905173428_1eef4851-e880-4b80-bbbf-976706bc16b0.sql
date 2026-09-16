CREATE TABLE public.projeto_atualizacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_arquivo text NOT NULL,
  versao text,
  observacoes text,
  tamanho_bytes bigint NOT NULL DEFAULT 0,
  total_arquivos integer NOT NULL DEFAULT 0,
  arquivos jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido','em_analise','aplicado','recusado')),
  storage_bucket text NOT NULL DEFAULT 'projeto-atualizacoes',
  storage_path text NOT NULL,
  enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aplicado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projeto_atualizacoes TO authenticated;
GRANT ALL ON public.projeto_atualizacoes TO service_role;

ALTER TABLE public.projeto_atualizacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projeto_atualizacoes_read" ON public.projeto_atualizacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "projeto_atualizacoes_insert" ON public.projeto_atualizacoes FOR INSERT TO authenticated WITH CHECK (enviado_por = auth.uid() OR enviado_por IS NULL);
CREATE POLICY "projeto_atualizacoes_update" ON public.projeto_atualizacoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "projeto_atualizacoes_delete" ON public.projeto_atualizacoes FOR DELETE TO authenticated USING (true);

CREATE TRIGGER projeto_atualizacoes_updated_at BEFORE UPDATE ON public.projeto_atualizacoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX projeto_atualizacoes_created_idx ON public.projeto_atualizacoes (created_at DESC);