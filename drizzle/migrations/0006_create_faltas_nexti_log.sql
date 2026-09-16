CREATE TABLE public.faltas_nexti_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid,
  usuario_nome text,
  person_id bigint,
  person_external_id text,
  colaborador text,
  situacao_id bigint,
  situacao_nome text,
  data_inicio date,
  data_fim date,
  observacao text,
  status text NOT NULL,
  motivo text,
  validacoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  forcado boolean NOT NULL DEFAULT false,
  http_status integer,
  resposta text
);

CREATE INDEX idx_faltas_nexti_log_created_at ON public.faltas_nexti_log (created_at DESC);
CREATE INDEX idx_faltas_nexti_log_person ON public.faltas_nexti_log (person_id, data_inicio);

GRANT SELECT ON public.faltas_nexti_log TO authenticated;
GRANT ALL ON public.faltas_nexti_log TO service_role;

ALTER TABLE public.faltas_nexti_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY faltas_nexti_log_select_interno ON public.faltas_nexti_log
  FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));
