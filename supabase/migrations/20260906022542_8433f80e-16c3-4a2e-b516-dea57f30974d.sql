CREATE TABLE public.rastreamento_localizacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  nome text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  precisao_metros double precision,
  velocidade double precision,
  direcao double precision,
  tipo_sinal text,
  bateria integer,
  capturado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rastreamento_localizacoes_user_idx ON public.rastreamento_localizacoes (user_id, capturado_em DESC);
CREATE INDEX rastreamento_localizacoes_capturado_idx ON public.rastreamento_localizacoes (capturado_em DESC);

GRANT SELECT, INSERT, DELETE ON public.rastreamento_localizacoes TO authenticated;
GRANT ALL ON public.rastreamento_localizacoes TO service_role;

ALTER TABLE public.rastreamento_localizacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rastreamento_insert_own" ON public.rastreamento_localizacoes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rastreamento_select_own" ON public.rastreamento_localizacoes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "rastreamento_select_gestores" ON public.rastreamento_localizacoes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'diretor')
    OR public.has_role(auth.uid(), 'cordenador')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "rastreamento_delete_gestores" ON public.rastreamento_localizacoes
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'diretor')
  );