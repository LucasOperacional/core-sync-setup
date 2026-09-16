ALTER TABLE public.nexti_workplaces ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.nexti_workplaces ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS telefone text;