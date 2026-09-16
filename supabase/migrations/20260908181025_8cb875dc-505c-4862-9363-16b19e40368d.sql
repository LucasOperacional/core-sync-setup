CREATE TABLE public.faltas_sem_cobertura (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  data DATE,
  posto TEXT NOT NULL DEFAULT '',
  nome TEXT NOT NULL DEFAULT '',
  cargo TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  cobertura TEXT NOT NULL DEFAULT '',
  horario TEXT NOT NULL DEFAULT '',
  empresa TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.faltas_sem_cobertura TO authenticated;
GRANT ALL ON public.faltas_sem_cobertura TO service_role;

ALTER TABLE public.faltas_sem_cobertura ENABLE ROW LEVEL SECURITY;

CREATE POLICY "faltas_sc_insert_own" ON public.faltas_sem_cobertura
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "faltas_sc_select_own" ON public.faltas_sem_cobertura
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "faltas_sc_select_gestores" ON public.faltas_sem_cobertura
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'diretor')
    OR public.has_role(auth.uid(), 'cordenador')
  );

CREATE POLICY "faltas_sc_delete_own" ON public.faltas_sem_cobertura
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "faltas_sc_delete_gestores" ON public.faltas_sem_cobertura
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'diretor')
    OR public.has_role(auth.uid(), 'cordenador')
  );

CREATE INDEX idx_faltas_sc_created_at ON public.faltas_sem_cobertura (created_at DESC);