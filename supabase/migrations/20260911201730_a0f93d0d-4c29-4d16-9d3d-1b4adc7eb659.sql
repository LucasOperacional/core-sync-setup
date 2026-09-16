ALTER TABLE public.crt_lancamentos
  ADD COLUMN IF NOT EXISTS lancado_por UUID,
  ADD COLUMN IF NOT EXISTS lancado_por_nome TEXT,
  ADD COLUMN IF NOT EXISTS lancado_em TIMESTAMPTZ;