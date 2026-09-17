ALTER TABLE public.mesa_relatorios ADD COLUMN IF NOT EXISTS gerente_nome TEXT;
ALTER TABLE public.mesa_relatorios ALTER COLUMN posto_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mesa_relatorios_gerente_data_uniq ON public.mesa_relatorios (gerente_nome, data) WHERE posto_id IS NULL;