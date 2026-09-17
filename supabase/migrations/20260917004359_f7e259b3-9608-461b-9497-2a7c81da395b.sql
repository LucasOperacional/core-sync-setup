ALTER TABLE public.mesa_checkins ADD COLUMN IF NOT EXISTS gerente_relatorio TEXT;
ALTER TABLE public.mesa_checkins ADD COLUMN IF NOT EXISTS gerente_relatorio_em TIMESTAMPTZ;
ALTER TABLE public.mesa_checkins ADD COLUMN IF NOT EXISTS gerente_relatorio_por UUID;