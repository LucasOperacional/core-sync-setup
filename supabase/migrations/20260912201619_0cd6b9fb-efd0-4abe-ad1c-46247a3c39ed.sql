ALTER TABLE public.roteiros_visita_campo
  ADD COLUMN IF NOT EXISTS posto_nexti_id bigint,
  ADD COLUMN IF NOT EXISTS posto_external_id text NOT NULL DEFAULT '';