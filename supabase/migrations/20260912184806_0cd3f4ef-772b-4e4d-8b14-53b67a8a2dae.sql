ALTER TABLE public.crt_lancamentos
  ADD COLUMN IF NOT EXISTS assinatura_token text,
  ADD COLUMN IF NOT EXISTS assinatura_token_expira_em timestamptz,
  ADD COLUMN IF NOT EXISTS assinatura_em timestamptz,
  ADD COLUMN IF NOT EXISTS assinatura_nome text,
  ADD COLUMN IF NOT EXISTS assinatura_ip text;

CREATE UNIQUE INDEX IF NOT EXISTS crt_lancamentos_assinatura_token_idx
  ON public.crt_lancamentos (assinatura_token)
  WHERE assinatura_token IS NOT NULL;