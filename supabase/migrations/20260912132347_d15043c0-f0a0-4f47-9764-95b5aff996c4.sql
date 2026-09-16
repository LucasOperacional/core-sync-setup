ALTER TABLE public.movimentacoes_posto
  ADD COLUMN nexti_transfer_id text,
  ADD COLUMN nexti_http_status integer,
  ADD COLUMN enviado_nexti_em timestamptz;