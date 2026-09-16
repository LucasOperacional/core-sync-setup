CREATE TABLE IF NOT EXISTS public.protocolo_cartoes_ponto (
  id TEXT PRIMARY KEY,
  numero TEXT NOT NULL,
  empresa TEXT NOT NULL,
  colaboradores JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_geracao TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolo_cartoes_ponto TO authenticated;
GRANT ALL ON public.protocolo_cartoes_ponto TO service_role;

ALTER TABLE public.protocolo_cartoes_ponto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage protocolos"
ON public.protocolo_cartoes_ponto FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.operational_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  page text NOT NULL DEFAULT '/',
  component text,
  error_type text NOT NULL,
  message text NOT NULL,
  technical_details text,
  severity text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'detected'
    CHECK (status IN ('detected', 'recovering', 'resolved', 'failed', 'pending_review')),
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_errors TO authenticated;
GRANT ALL ON public.operational_errors TO service_role;
ALTER TABLE public.operational_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read operational_errors"
  ON public.operational_errors FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'));

CREATE POLICY "Authenticated insert operational_errors"
  ON public.operational_errors FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admin update operational_errors"
  ON public.operational_errors FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'));

CREATE TABLE IF NOT EXISTS public.recovery_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_id text NOT NULL,
  action text NOT NULL,
  result text NOT NULL DEFAULT 'success'
    CHECK (result IN ('success', 'failure', 'skipped')),
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL DEFAULT 0,
  automatic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_actions TO authenticated;
GRANT ALL ON public.recovery_actions TO service_role;
ALTER TABLE public.recovery_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read recovery_actions"
  ON public.recovery_actions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'));

CREATE POLICY "Authenticated insert recovery_actions"
  ON public.recovery_actions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.known_error_solutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_signature text NOT NULL UNIQUE,
  description text NOT NULL,
  authorized_solution text NOT NULL,
  max_retries integer NOT NULL DEFAULT 3,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.known_error_solutions TO authenticated;
GRANT ALL ON public.known_error_solutions TO service_role;
ALTER TABLE public.known_error_solutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage known_error_solutions"
  ON public.known_error_solutions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'));

CREATE TABLE public.colaboradores_ponto (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa text NOT NULL,
  nome text NOT NULL,
  cargo text NOT NULL,
  posto text NOT NULL,
  matricula text NOT NULL,
  revisar boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT colaboradores_ponto_empresa_matricula_key UNIQUE (empresa, matricula)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores_ponto TO authenticated;
GRANT ALL ON public.colaboradores_ponto TO service_role;
ALTER TABLE public.colaboradores_ponto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "colaboradores_ponto_auth_all" ON public.colaboradores_ponto FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_colaboradores_ponto_updated_at BEFORE UPDATE ON public.colaboradores_ponto FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE SEQUENCE public.protocolo_ponto_numero_seq START 1;
GRANT USAGE, SELECT ON SEQUENCE public.protocolo_ponto_numero_seq TO authenticated;
GRANT ALL ON SEQUENCE public.protocolo_ponto_numero_seq TO service_role;

CREATE TABLE public.protocolos_ponto (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_protocolo text NOT NULL UNIQUE DEFAULT ('PROT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.protocolo_ponto_numero_seq')::text, 5, '0')),
  empresa text NOT NULL,
  data_criacao timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Entregue')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolos_ponto TO authenticated;
GRANT ALL ON public.protocolos_ponto TO service_role;
ALTER TABLE public.protocolos_ponto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "protocolos_ponto_auth_all" ON public.protocolos_ponto FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.protocolo_ponto_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  protocolo_id uuid NOT NULL REFERENCES public.protocolos_ponto(id) ON DELETE CASCADE,
  empresa text NOT NULL,
  nome text NOT NULL,
  cargo text NOT NULL,
  posto text NOT NULL,
  matricula text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX protocolo_ponto_itens_protocolo_id_idx ON public.protocolo_ponto_itens(protocolo_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolo_ponto_itens TO authenticated;
GRANT ALL ON public.protocolo_ponto_itens TO service_role;
ALTER TABLE public.protocolo_ponto_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "protocolo_ponto_itens_auth_all" ON public.protocolo_ponto_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.funcionarios_ativos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa text NOT NULL,
  nome text NOT NULL,
  cargo text NOT NULL,
  posto text NOT NULL,
  matricula text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  revisar boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX funcionarios_ativos_empresa_matricula_key
  ON public.funcionarios_ativos (empresa, matricula);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.funcionarios_ativos TO authenticated;
GRANT ALL ON public.funcionarios_ativos TO service_role;

ALTER TABLE public.funcionarios_ativos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados gerenciam funcionarios ativos"
  ON public.funcionarios_ativos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_funcionarios_ativos_updated_at
  BEFORE UPDATE ON public.funcionarios_ativos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

ALTER TABLE public.protocolos DROP CONSTRAINT IF EXISTS protocolos_user_id_fkey;
ALTER TABLE public.protocolos
  ADD CONSTRAINT protocolos_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.protocolo_arquivos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  protocolo_id UUID NOT NULL REFERENCES public.protocolos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  caminho TEXT NOT NULL,
  tamanho BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS protocolo_arquivos_protocolo_idx ON public.protocolo_arquivos (protocolo_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolo_arquivos TO authenticated;
GRANT ALL ON public.protocolo_arquivos TO service_role;
ALTER TABLE public.protocolo_arquivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "protocolo_arquivos_own" ON public.protocolo_arquivos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.protocolos p WHERE p.id = protocolo_arquivos.protocolo_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.protocolos p WHERE p.id = protocolo_arquivos.protocolo_id AND p.user_id = auth.uid()));
CREATE POLICY "protocolo_arquivos_admin" ON public.protocolo_arquivos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));