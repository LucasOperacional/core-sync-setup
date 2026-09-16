DROP INDEX IF EXISTS public.funcionarios_ativos_empresa_matricula_key;

CREATE UNIQUE INDEX funcionarios_ativos_empresa_matricula_key
  ON public.funcionarios_ativos (empresa, matricula)
  WHERE matricula <> '' AND matricula <> 'Não identificado';