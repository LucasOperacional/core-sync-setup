CREATE TABLE public.avaliacoes_gerentes_area (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gerente_nome text NOT NULL,
  mes_referencia text NOT NULL,
  nota_lideranca smallint NOT NULL DEFAULT 3,
  nota_operacao smallint NOT NULL DEFAULT 3,
  nota_comunicacao smallint NOT NULL DEFAULT 3,
  nota_prazos smallint NOT NULL DEFAULT 3,
  nota_cliente smallint NOT NULL DEFAULT 3,
  pontos_fortes text,
  pontos_melhoria text,
  observacoes text,
  avaliador_nome text,
  avaliador_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.avaliacoes_gerentes_area TO authenticated;
GRANT ALL ON public.avaliacoes_gerentes_area TO service_role;

ALTER TABLE public.avaliacoes_gerentes_area ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avaliacoes_select" ON public.avaliacoes_gerentes_area
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "avaliacoes_insert" ON public.avaliacoes_gerentes_area
  FOR INSERT TO authenticated WITH CHECK (avaliador_id = auth.uid());

CREATE POLICY "avaliacoes_update" ON public.avaliacoes_gerentes_area
  FOR UPDATE TO authenticated
  USING (avaliador_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (avaliador_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "avaliacoes_delete" ON public.avaliacoes_gerentes_area
  FOR DELETE TO authenticated
  USING (avaliador_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_avaliacoes_gerentes_area_gerente ON public.avaliacoes_gerentes_area (gerente_nome);

CREATE TRIGGER update_avaliacoes_gerentes_area_updated_at
  BEFORE UPDATE ON public.avaliacoes_gerentes_area
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();