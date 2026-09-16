ALTER TABLE public.nexti_workplaces
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TYPE public.nxs_device_status ADD VALUE IF NOT EXISTS 'bloqueado';