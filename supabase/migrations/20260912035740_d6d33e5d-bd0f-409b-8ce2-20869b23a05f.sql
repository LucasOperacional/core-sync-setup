ALTER TABLE public.crt_lancamentos
  ALTER COLUMN person_id TYPE text USING person_id::text,
  ALTER COLUMN posto_id TYPE text USING posto_id::text,
  ALTER COLUMN substituto_person_id TYPE text USING substituto_person_id::text;