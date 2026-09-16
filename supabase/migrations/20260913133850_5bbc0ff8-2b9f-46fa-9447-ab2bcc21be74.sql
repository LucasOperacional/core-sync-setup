ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS telefone text;

CREATE TABLE public.chegadas_posto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  posto_nexti_id bigint,
  posto_nome text NOT NULL,
  distancia_metros numeric,
  latitude numeric,
  longitude numeric,
  avisado_whatsapp boolean NOT NULL DEFAULT false,
  erro_aviso text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chegadas_posto TO authenticated;
GRANT ALL ON public.chegadas_posto TO service_role;

ALTER TABLE public.chegadas_posto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chegadas_select" ON public.chegadas_posto FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "chegadas_insert" ON public.chegadas_posto FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "chegadas_delete" ON public.chegadas_posto FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_chegadas_posto_user_data ON public.chegadas_posto (user_id, created_at DESC);