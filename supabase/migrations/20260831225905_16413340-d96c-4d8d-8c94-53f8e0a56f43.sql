CREATE TABLE IF NOT EXISTS public.nexti_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  base_url text NOT NULL DEFAULT '',
  client_id text NOT NULL DEFAULT '',
  client_secret text NOT NULL DEFAULT '',
  username text NOT NULL DEFAULT '',
  token text NOT NULL DEFAULT '',
  token_endpoint text NOT NULL DEFAULT '',
  test_endpoint text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.nexti_config TO authenticated;
GRANT ALL ON public.nexti_config TO service_role;
ALTER TABLE public.nexti_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage nexti config" ON public.nexti_config;
CREATE POLICY "Admins manage nexti config" ON public.nexti_config FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.nexti_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;