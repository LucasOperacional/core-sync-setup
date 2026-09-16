CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL PRIMARY KEY,
  nome TEXT,
  email TEXT,
  departamento TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_select" ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

CREATE TABLE IF NOT EXISTS public.protocolos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  empresa TEXT,
  observacoes TEXT,
  data_entrega DATE NOT NULL DEFAULT current_date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolos TO authenticated;
GRANT ALL ON public.protocolos TO service_role;
ALTER TABLE public.protocolos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "protocolos_own_select" ON public.protocolos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "protocolos_own_insert" ON public.protocolos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "protocolos_own_update" ON public.protocolos FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "protocolos_own_delete" ON public.protocolos FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "protocolos_admin_all" ON public.protocolos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));
CREATE TRIGGER protocolos_updated_at BEFORE UPDATE ON public.protocolos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.protocolo_folhas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  protocolo_id UUID NOT NULL REFERENCES public.protocolos(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  pagina INTEGER,
  arquivo TEXT,
  colaborador TEXT NOT NULL DEFAULT '',
  empresa TEXT NOT NULL DEFAULT '',
  posto TEXT NOT NULL DEFAULT '',
  cargo TEXT NOT NULL DEFAULT '',
  matricula TEXT NOT NULL DEFAULT '',
  admissao TEXT NOT NULL DEFAULT '',
  conferido BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS protocolo_folhas_protocolo_ordem_idx ON public.protocolo_folhas (protocolo_id, ordem);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolo_folhas TO authenticated;
GRANT ALL ON public.protocolo_folhas TO service_role;
ALTER TABLE public.protocolo_folhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "protocolo_folhas_own" ON public.protocolo_folhas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.protocolos p WHERE p.id = protocolo_folhas.protocolo_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.protocolos p WHERE p.id = protocolo_folhas.protocolo_id AND p.user_id = auth.uid()));
CREATE POLICY "protocolo_folhas_admin" ON public.protocolo_folhas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

ALTER TABLE public.funcionarios_ativos
  ADD COLUMN IF NOT EXISTS nome_normalizado TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS empresa_normalizada TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.funcionarios_ativos
  ALTER COLUMN empresa SET DEFAULT '',
  ALTER COLUMN cargo SET DEFAULT '',
  ALTER COLUMN posto SET DEFAULT '',
  ALTER COLUMN matricula SET DEFAULT '';
CREATE INDEX IF NOT EXISTS funcionarios_ativos_nome_norm_idx ON public.funcionarios_ativos (nome_normalizado);

CREATE OR REPLACE FUNCTION public.owns_protocolo_path(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.protocolos p
    WHERE p.id::text = split_part(_name, '/', 1)
      AND (p.user_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  )
$$;
REVOKE ALL ON FUNCTION public.owns_protocolo_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_protocolo_path(text) TO authenticated, service_role;

DROP POLICY IF EXISTS folhas_pdf_select ON storage.objects;
DROP POLICY IF EXISTS folhas_pdf_insert ON storage.objects;
DROP POLICY IF EXISTS folhas_pdf_update ON storage.objects;
DROP POLICY IF EXISTS folhas_pdf_delete ON storage.objects;
CREATE POLICY folhas_pdf_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'folhas-pdf' AND public.owns_protocolo_path(name));
CREATE POLICY folhas_pdf_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'folhas-pdf' AND public.owns_protocolo_path(name));
CREATE POLICY folhas_pdf_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'folhas-pdf' AND public.owns_protocolo_path(name))
  WITH CHECK (bucket_id = 'folhas-pdf' AND public.owns_protocolo_path(name));
CREATE POLICY folhas_pdf_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'folhas-pdf' AND public.owns_protocolo_path(name));