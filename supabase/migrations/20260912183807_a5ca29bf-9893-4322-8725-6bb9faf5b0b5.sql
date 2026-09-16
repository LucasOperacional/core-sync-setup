ALTER TABLE public.movimentacoes_posto
  ADD COLUMN IF NOT EXISTS assinatura_token text,
  ADD COLUMN IF NOT EXISTS assinatura_token_expira_em timestamptz,
  ADD COLUMN IF NOT EXISTS assinatura_em timestamptz,
  ADD COLUMN IF NOT EXISTS assinatura_nome text,
  ADD COLUMN IF NOT EXISTS assinatura_ip text;

CREATE UNIQUE INDEX IF NOT EXISTS movimentacoes_posto_assinatura_token_key
  ON public.movimentacoes_posto (assinatura_token)
  WHERE assinatura_token IS NOT NULL;