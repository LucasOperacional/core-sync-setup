CREATE TABLE IF NOT EXISTS public.faltas_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gerente_nome text NOT NULL,
  colaborador text NOT NULL DEFAULT '',
  posto text NOT NULL DEFAULT '',
  cargo text NOT NULL DEFAULT '',
  tipo text NOT NULL DEFAULT '',
  periodo text NOT NULL DEFAULT '',
  faltas integer NOT NULL DEFAULT 0,
  assinatura text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.faltas_lancamentos TO authenticated;
GRANT ALL ON public.faltas_lancamentos TO service_role;

ALTER TABLE public.faltas_lancamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS faltas_lancamentos_select ON public.faltas_lancamentos;
CREATE POLICY faltas_lancamentos_select ON public.faltas_lancamentos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS faltas_lancamentos_admin_write ON public.faltas_lancamentos;
CREATE POLICY faltas_lancamentos_admin_write ON public.faltas_lancamentos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS faltas_lancamentos_gerente_idx ON public.faltas_lancamentos (gerente_nome);

DROP TRIGGER IF EXISTS faltas_lancamentos_updated_at ON public.faltas_lancamentos;
CREATE TRIGGER faltas_lancamentos_updated_at BEFORE UPDATE ON public.faltas_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();