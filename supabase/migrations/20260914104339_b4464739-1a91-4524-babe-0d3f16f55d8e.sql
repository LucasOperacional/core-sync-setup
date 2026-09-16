ALTER TABLE public.nexti_config ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
INSERT INTO public.nexti_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;