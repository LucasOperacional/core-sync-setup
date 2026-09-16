CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.gerentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  cargo text NOT NULL DEFAULT '',
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gerentes TO authenticated;
GRANT ALL ON public.gerentes TO service_role;
ALTER TABLE public.gerentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gerentes readable" ON public.gerentes FOR SELECT TO authenticated USING (true);

CREATE TABLE public.visitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gerente_id uuid REFERENCES public.gerentes(id) ON DELETE SET NULL,
  cliente text NOT NULL DEFAULT '',
  local text NOT NULL DEFAULT '',
  posto text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  uf text NOT NULL DEFAULT '',
  responsavel text NOT NULL DEFAULT '',
  cargo text NOT NULL DEFAULT '',
  inicio text,
  fim text,
  duracao_min integer,
  respostas jsonb NOT NULL DEFAULT '[]'::jsonb,
  conformes integer NOT NULL DEFAULT 0,
  nao_conformes integer NOT NULL DEFAULT 0,
  relatos jsonb NOT NULL DEFAULT '[]'::jsonb,
  arquivo text NOT NULL DEFAULT '',
  chave text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitas TO authenticated;
GRANT ALL ON public.visitas TO service_role;
ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visitas readable" ON public.visitas FOR SELECT TO authenticated USING (true);

CREATE INDEX visitas_gerente_idx ON public.visitas(gerente_id);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE POLICY "gerentes admin write" ON public.gerentes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "visitas admin write" ON public.visitas FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.arquivos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gerente_id uuid REFERENCES public.gerentes(id) ON DELETE SET NULL,
  nome text NOT NULL,
  caminho text NOT NULL UNIQUE,
  tamanho integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arquivos TO authenticated;
GRANT ALL ON public.arquivos TO service_role;

ALTER TABLE public.arquivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arquivos readable" ON public.arquivos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "arquivos admin write" ON public.arquivos
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX arquivos_gerente_id_idx ON public.arquivos(gerente_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_arquivos_updated_at BEFORE UPDATE ON public.arquivos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "relatorios read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'relatorios');

CREATE POLICY "relatorios admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'relatorios' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "relatorios admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'relatorios' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "relatorios admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'relatorios' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.canais_drm (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, url text NOT NULL, ativo boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'pendente', latencia_ms integer, ultima_verificacao timestamptz, erro_verificacao text, criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.canais_drm TO authenticated;
GRANT ALL ON public.canais_drm TO service_role;
ALTER TABLE public.canais_drm ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuários autenticados podem consultar canais" ON public.canais_drm FOR SELECT TO authenticated USING (true);
CREATE POLICY "Administradores podem gerenciar canais" ON public.canais_drm FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER update_canais_drm_updated_at BEFORE UPDATE ON public.canais_drm FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.faltas_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  caminho text NOT NULL,
  tamanho bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.faltas_arquivos TO authenticated;
GRANT ALL ON public.faltas_arquivos TO service_role;

ALTER TABLE public.faltas_arquivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem consultar arquivos de faltas"
  ON public.faltas_arquivos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Administradores podem gerenciar arquivos de faltas"
  ON public.faltas_arquivos FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, page_key)
);

GRANT SELECT ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage permissions"
  ON public.user_permissions
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users can read own permissions"
ON public.user_permissions FOR SELECT TO authenticated
USING (auth.uid() = user_id);