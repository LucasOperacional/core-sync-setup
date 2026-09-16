CREATE TABLE public.funcionarios_ativos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa text NOT NULL,
  nome text NOT NULL,
  cargo text NOT NULL,
  posto text NOT NULL,
  matricula text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  revisar boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX funcionarios_ativos_empresa_matricula_key
  ON public.funcionarios_ativos (empresa, matricula);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.funcionarios_ativos TO authenticated;
GRANT ALL ON public.funcionarios_ativos TO service_role;

ALTER TABLE public.funcionarios_ativos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados gerenciam funcionarios ativos"
  ON public.funcionarios_ativos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_funcionarios_ativos_updated_at
  BEFORE UPDATE ON public.funcionarios_ativos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();