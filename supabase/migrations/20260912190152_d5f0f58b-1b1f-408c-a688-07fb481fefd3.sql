ALTER TABLE public.movimentacoes_posto
  ADD COLUMN IF NOT EXISTS assinatura_dispositivo text,
  ADD COLUMN IF NOT EXISTS assinatura_latitude double precision,
  ADD COLUMN IF NOT EXISTS assinatura_longitude double precision,
  ADD COLUMN IF NOT EXISTS assinatura_precisao_metros double precision,
  ADD COLUMN IF NOT EXISTS assinatura_geo_status text,
  ADD COLUMN IF NOT EXISTS assinatura_declaracao boolean NOT NULL DEFAULT false;