ALTER TABLE public.roteiros_visita_campo ADD COLUMN IF NOT EXISTS duracao_segundos integer;
ALTER TABLE public.avaliacoes_gerentes_area ADD COLUMN IF NOT EXISTS duracao_segundos integer;