ALTER TABLE public.nexti_workplaces
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS manager_name text;

UPDATE public.nexti_workplaces SET
  latitude = NULLIF(raw_payload->>'latitude','')::double precision,
  longitude = NULLIF(raw_payload->>'longitude','')::double precision,
  address = NULLIF(raw_payload->>'address',''),
  address_number = NULLIF(raw_payload->>'addressNumber',''),
  district = NULLIF(raw_payload->>'district',''),
  zip_code = NULLIF(raw_payload->>'zipCode',''),
  phone = NULLIF(raw_payload->>'phone',''),
  manager_name = NULLIF(raw_payload->>'managerName',''),
  city = COALESCE(city, NULLIF(raw_payload->>'cityName',''))
WHERE raw_payload IS NOT NULL;

CREATE INDEX IF NOT EXISTS nexti_workplaces_geo_idx ON public.nexti_workplaces (latitude, longitude);