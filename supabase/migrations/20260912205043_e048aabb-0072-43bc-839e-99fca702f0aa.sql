ALTER TABLE public.roteiros_visita_campo
  ADD COLUMN IF NOT EXISTS relatorio_pdf_path text,
  ADD COLUMN IF NOT EXISTS relatorio_enviado_em timestamptz;