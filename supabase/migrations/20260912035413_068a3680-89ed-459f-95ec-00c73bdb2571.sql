ALTER TABLE public.nexti_config ALTER COLUMN client_id TYPE text USING client_id::text;
ALTER TABLE public.nexti_config ALTER COLUMN client_id SET DEFAULT '';
UPDATE public.nexti_config SET client_id = '' WHERE client_id IS NULL;