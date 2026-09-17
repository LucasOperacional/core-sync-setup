CREATE TABLE public.mesa_relatorios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  posto_id UUID NOT NULL REFERENCES public.mesa_postos_servico(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  relatorio TEXT NOT NULL,
  registrado_por UUID REFERENCES auth.users(id),
  registrado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (posto_id, data)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesa_relatorios TO authenticated;
GRANT ALL ON public.mesa_relatorios TO service_role;
ALTER TABLE public.mesa_relatorios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuários logados veem relatórios" ON public.mesa_relatorios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Usuários logados registram relatórios" ON public.mesa_relatorios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Usuários logados atualizam relatórios" ON public.mesa_relatorios FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Usuários logados apagam relatórios" ON public.mesa_relatorios FOR DELETE TO authenticated USING (true);