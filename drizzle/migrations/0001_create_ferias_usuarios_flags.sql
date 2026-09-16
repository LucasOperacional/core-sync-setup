CREATE TABLE IF NOT EXISTS public.ferias_usuarios_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_chave text NOT NULL UNIQUE,
  nome text NOT NULL,
  empresa text,
  matricula text,
  person_id bigint,
  person_external_id text,
  lancar_ferias boolean NOT NULL DEFAULT true,
  enviar_aviso boolean NOT NULL DEFAULT true,
  enviar_ferias boolean NOT NULL DEFAULT true,
  exigir_leitura boolean NOT NULL DEFAULT false,
  exigir_aceite boolean NOT NULL DEFAULT false,
  exigir_assinatura boolean NOT NULL DEFAULT false,
  dias integer,
  data_inicio date,
  data_fim date,
  observacao text,
  origem text NOT NULL DEFAULT 'manual',
  atualizado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ferias_usuarios_flags TO authenticated;
GRANT ALL ON public.ferias_usuarios_flags TO service_role;

ALTER TABLE public.ferias_usuarios_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ferias_flags_select" ON public.ferias_usuarios_flags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ferias_flags_insert" ON public.ferias_usuarios_flags
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ferias_flags_update" ON public.ferias_usuarios_flags
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ferias_flags_delete" ON public.ferias_usuarios_flags
  FOR DELETE TO authenticated USING (true);