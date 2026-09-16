CREATE TABLE public.movimentacoes_posto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_por uuid NOT NULL,
  colaborador text NOT NULL,
  person_id text,
  posto_atual text NOT NULL,
  posto_atual_id text,
  novo_posto text NOT NULL,
  novo_posto_id text,
  data_movimentacao date NOT NULL,
  motivo text NOT NULL DEFAULT '',
  criado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimentacoes_posto TO authenticated;
GRANT ALL ON public.movimentacoes_posto TO service_role;

ALTER TABLE public.movimentacoes_posto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view workplace movements"
ON public.movimentacoes_posto
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create workplace movements"
ON public.movimentacoes_posto
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = criado_por);

CREATE POLICY "Users can update their workplace movements"
ON public.movimentacoes_posto
FOR UPDATE
TO authenticated
USING (auth.uid() = criado_por)
WITH CHECK (auth.uid() = criado_por);

CREATE POLICY "Users can delete their workplace movements"
ON public.movimentacoes_posto
FOR DELETE
TO authenticated
USING (auth.uid() = criado_por);

CREATE TRIGGER set_updated_at_movimentacoes_posto
BEFORE UPDATE ON public.movimentacoes_posto
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();