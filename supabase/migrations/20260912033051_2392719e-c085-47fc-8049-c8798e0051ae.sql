CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','user','supervisor','gerente','visualizador','diretor','cordenador','mesa_operacional');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity text NOT NULL,
  resource text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0,
  UNIQUE (identity, resource)
);
GRANT ALL ON public.security_rate_limits TO service_role;
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.security_check_rate_limit(_identity text, _resource text, _limit numeric, _window_seconds numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.security_rate_limits%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM public.security_rate_limits WHERE identity = _identity AND resource = _resource FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.security_rate_limits (identity, resource, window_start, hits)
    VALUES (_identity, _resource, now(), 1)
    RETURNING * INTO rec;
    RETURN jsonb_build_object('allowed', true, 'remaining', _limit - 1);
  END IF;

  IF rec.window_start < now() - make_interval(secs => _window_seconds) THEN
    UPDATE public.security_rate_limits SET window_start = now(), hits = 1 WHERE id = rec.id;
    RETURN jsonb_build_object('allowed', true, 'remaining', _limit - 1);
  END IF;

  IF rec.hits >= _limit THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0);
  END IF;

  UPDATE public.security_rate_limits SET hits = rec.hits + 1 WHERE id = rec.id;
  RETURN jsonb_build_object('allowed', true, 'remaining', _limit - rec.hits - 1);
END;
$$;

DROP POLICY IF EXISTS "authenticated_read_app_files" ON storage.objects;
CREATE POLICY "authenticated_read_app_files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('atestados-verificacao','faltas-planilhas','faltas-pdfs','chat-attachments'));

DROP POLICY IF EXISTS "authenticated_write_app_files" ON storage.objects;
CREATE POLICY "authenticated_write_app_files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('atestados-verificacao','faltas-planilhas','faltas-pdfs','chat-attachments'));

DROP POLICY IF EXISTS "authenticated_update_app_files" ON storage.objects;
CREATE POLICY "authenticated_update_app_files" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('atestados-verificacao','faltas-planilhas','faltas-pdfs','chat-attachments'));

DROP POLICY IF EXISTS "authenticated_delete_app_files" ON storage.objects;
CREATE POLICY "authenticated_delete_app_files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('atestados-verificacao','faltas-planilhas','faltas-pdfs','chat-attachments'));