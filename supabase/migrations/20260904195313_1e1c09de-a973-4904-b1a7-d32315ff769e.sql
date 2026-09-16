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

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

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
CREATE POLICY "gerentes admin write" ON public.gerentes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

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
CREATE POLICY "visitas admin write" ON public.visitas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX visitas_gerente_idx ON public.visitas(gerente_id);
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
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

DROP POLICY IF EXISTS "gerentes admin write" ON public.gerentes;
CREATE POLICY "gerentes admin write" ON public.gerentes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "visitas admin write" ON public.visitas;
CREATE POLICY "visitas admin write" ON public.visitas FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
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

create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_key text not null,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, page_key)
);

alter table public.user_permissions enable row level security;

create policy "Admins can manage permissions"
  on public.user_permissions
  for all
  using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

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

DROP POLICY IF EXISTS "Users can read own permissions" ON public.user_permissions;
CREATE POLICY "Users can read own permissions"
ON public.user_permissions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DO $$
BEGIN
  DROP POLICY IF EXISTS "Administradores podem gerenciar arquivos de faltas" ON public.faltas_arquivos;

  CREATE POLICY "Admins podem inserir arquivos de faltas"
    ON public.faltas_arquivos FOR INSERT TO authenticated
    WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

  CREATE POLICY "Admins podem atualizar arquivos de faltas"
    ON public.faltas_arquivos FOR UPDATE TO authenticated
    USING (private.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

  CREATE POLICY "Admins podem deletar arquivos de faltas"
    ON public.faltas_arquivos FOR DELETE TO authenticated
    USING (private.has_role(auth.uid(), 'admin'::public.app_role));
END $$;

ALTER TABLE public.faltas_arquivos ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'pdf';

DO $$
BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload faltas planilhas" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can read faltas planilhas" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can delete faltas planilhas" ON storage.objects;
  DROP POLICY IF EXISTS "Auth users can delete faltas planilhas" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can upload faltas files" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can read faltas files" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can delete faltas files" ON storage.objects;
  DROP POLICY IF EXISTS "Auth users can delete faltas pdfs" ON storage.objects;
END
$$;

CREATE POLICY "Authenticated users can upload faltas planilhas"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'faltas-planilhas');

CREATE POLICY "Authenticated users can read faltas planilhas"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'faltas-planilhas');

CREATE POLICY "Auth users can delete faltas planilhas"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'faltas-planilhas');

CREATE POLICY "Authenticated users can upload faltas files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'faltas-pdfs');

CREATE POLICY "Authenticated users can read faltas files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'faltas-pdfs');

CREATE POLICY "Auth users can delete faltas pdfs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'faltas-pdfs');

CREATE TABLE IF NOT EXISTS public.atestados_verificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_arquivo text NOT NULL,
  tipo_arquivo text NOT NULL,
  tamanho_arquivo bigint NOT NULL DEFAULT 0,
  hash_sha256 text NOT NULL,
  caminho_storage text NOT NULL,
  classificacao text NOT NULL,
  pontuacao_risco integer NOT NULL DEFAULT 50,
  faixa_risco text NOT NULL DEFAULT 'revisao',
  texto_extraido text NOT NULL DEFAULT '',
  observacao text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.atestados_verificados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verified certificates"
  ON public.atestados_verificados FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all verified certificates"
  ON public.atestados_verificados FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated users can insert verified certificates"
  ON public.atestados_verificados FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update verified certificates"
  ON public.atestados_verificados FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.dados_extraidos_verificacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  nome_paciente text NOT NULL DEFAULT 'Não identificado',
  cpf text NOT NULL DEFAULT 'Não identificado',
  nome_medico text NOT NULL DEFAULT 'Não identificado',
  crm text NOT NULL DEFAULT 'Não identificado',
  uf_crm text NOT NULL DEFAULT 'Não identificado',
  data_emissao text NOT NULL DEFAULT 'Não identificado',
  hora_emissao text NOT NULL DEFAULT 'Não identificado',
  dias_afastamento text NOT NULL DEFAULT 'Não identificado',
  data_inicio_afastamento text NOT NULL DEFAULT 'Não identificado',
  data_fim_afastamento text NOT NULL DEFAULT 'Não identificado',
  nome_clinica text NOT NULL DEFAULT 'Não identificado',
  cnpj_estabelecimento text NOT NULL DEFAULT 'Não identificado',
  codigo_validacao text NOT NULL DEFAULT 'Não identificado',
  qr_code_detectado boolean NOT NULL DEFAULT false,
  qr_code_conteudo text NOT NULL DEFAULT 'Não identificado',
  assinatura_digital_detectada boolean NOT NULL DEFAULT false,
  cid text NOT NULL DEFAULT 'Não identificado',
  cid_descricao text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dados_extraidos_verificacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View extracted data via atestado ownership"
  ON public.dados_extraidos_verificacao FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atestados_verificados a WHERE a.id = atestado_id AND (a.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))));

CREATE POLICY "Insert extracted data"
  ON public.dados_extraidos_verificacao FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.atestados_verificados a WHERE a.id = atestado_id AND a.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.validacoes_atestado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  resultado text NOT NULL,
  detalhes text NOT NULL DEFAULT '',
  origem text NOT NULL DEFAULT '',
  impacto_pontuacao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.validacoes_atestado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View validations via atestado ownership"
  ON public.validacoes_atestado FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atestados_verificados a WHERE a.id = atestado_id AND (a.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))));

CREATE POLICY "Insert validations"
  ON public.validacoes_atestado FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.atestados_verificados a WHERE a.id = atestado_id AND a.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.inconsistencias_atestado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descricao text NOT NULL,
  severidade text NOT NULL DEFAULT 'media',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inconsistencias_atestado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View inconsistencies via atestado ownership"
  ON public.inconsistencias_atestado FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atestados_verificados a WHERE a.id = atestado_id AND (a.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))));

CREATE POLICY "Insert inconsistencies"
  ON public.inconsistencias_atestado FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.atestados_verificados a WHERE a.id = atestado_id AND a.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.historico_analises_atestado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  acao text NOT NULL,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nome text NOT NULL DEFAULT 'Sistema',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.historico_analises_atestado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View history via atestado ownership"
  ON public.historico_analises_atestado FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atestados_verificados a WHERE a.id = atestado_id AND (a.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))));

CREATE POLICY "Insert history"
  ON public.historico_analises_atestado FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.atestados_verificados a WHERE a.id = atestado_id AND a.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.logs_acesso_atestado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acao text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.logs_acesso_atestado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view access logs"
  ON public.logs_acesso_atestado FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Insert access logs"
  ON public.logs_acesso_atestado FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_atestados_verificados_user ON public.atestados_verificados(user_id);
CREATE INDEX IF NOT EXISTS idx_atestados_verificados_hash ON public.atestados_verificados(hash_sha256);
CREATE INDEX IF NOT EXISTS idx_dados_extraidos_atestado ON public.dados_extraidos_verificacao(atestado_id);
CREATE INDEX IF NOT EXISTS idx_validacoes_atestado ON public.validacoes_atestado(atestado_id);
CREATE INDEX IF NOT EXISTS idx_inconsistencias_atestado ON public.inconsistencias_atestado(atestado_id);
CREATE INDEX IF NOT EXISTS idx_historico_analises_atestado ON public.historico_analises_atestado(atestado_id);
CREATE INDEX IF NOT EXISTS idx_logs_acesso_atestado ON public.logs_acesso_atestado(atestado_id);
CREATE INDEX IF NOT EXISTS idx_logs_acesso_atestado_user ON public.logs_acesso_atestado(user_id);

CREATE POLICY "Authenticated users can upload atestados for verification"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'atestados-verificacao');

CREATE POLICY "Authenticated users can read own atestados verification"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'atestados-verificacao');

CREATE POLICY "Admins can delete atestados verification"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'atestados-verificacao' AND private.has_role(auth.uid(), 'admin'::public.app_role));

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

CREATE POLICY folhas_pdf_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
);

CREATE POLICY folhas_pdf_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
);

CREATE POLICY folhas_pdf_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
)
WITH CHECK (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
);

CREATE POLICY folhas_pdf_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
);

ALTER TABLE public.protocolos DROP CONSTRAINT IF EXISTS protocolos_user_id_fkey;
ALTER TABLE public.protocolos
  ADD CONSTRAINT protocolos_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS public.funcionarios_ativos_empresa_matricula_key;

CREATE UNIQUE INDEX funcionarios_ativos_empresa_matricula_key
  ON public.funcionarios_ativos (empresa, matricula)
  WHERE matricula <> '' AND matricula <> 'Não identificado';

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE TABLE public.arquivos_importados (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_original text NOT NULL,
  formato text NOT NULL DEFAULT 'outro',
  tamanho bigint NOT NULL DEFAULT 0,
  storage_bucket text NOT NULL DEFAULT 'arquivos-dashboards',
  storage_path text NOT NULL,
  dashboard text NOT NULL,
  registros integer NOT NULL DEFAULT 0,
  importado_em timestamp with time zone NOT NULL DEFAULT now(),
  usuario_id uuid,
  usuario_nome text NOT NULL DEFAULT '',
  status_processamento text NOT NULL DEFAULT 'aguardando',
  status_sincronizacao text NOT NULL DEFAULT 'aguardando',
  ultima_sincronizacao timestamp with time zone,
  hash_arquivo text NOT NULL,
  mensagem_erro text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT arquivos_importados_dashboard_check CHECK (dashboard IN ('CONTROL','FALTAS','ATESTADOS')),
  CONSTRAINT arquivos_importados_status_proc_check CHECK (status_processamento IN ('aguardando','processando','processado','erro')),
  CONSTRAINT arquivos_importados_status_sync_check CHECK (status_sincronizacao IN ('aguardando','processando','atualizado','erro')),
  CONSTRAINT arquivos_importados_hash_unico UNIQUE (dashboard, hash_arquivo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arquivos_importados TO authenticated;
GRANT ALL ON public.arquivos_importados TO service_role;
ALTER TABLE public.arquivos_importados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam arquivos importados"
ON public.arquivos_importados FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_arquivos_importados_updated_at
BEFORE UPDATE ON public.arquivos_importados
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX arquivos_importados_dashboard_idx ON public.arquivos_importados (dashboard, importado_em DESC);

CREATE TABLE public.arquivos_sincronizacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  arquivo_id uuid REFERENCES public.arquivos_importados(id) ON DELETE CASCADE,
  dashboard text NOT NULL,
  resultado text NOT NULL,
  mensagem text NOT NULL DEFAULT '',
  registros integer NOT NULL DEFAULT 0,
  usuario_id uuid,
  usuario_nome text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT arquivos_sincronizacoes_dashboard_check CHECK (dashboard IN ('CONTROL','FALTAS','ATESTADOS')),
  CONSTRAINT arquivos_sincronizacoes_resultado_check CHECK (resultado IN ('sucesso','duplicado','sem_alteracao','erro'))
);

GRANT SELECT, INSERT, DELETE ON public.arquivos_sincronizacoes TO authenticated;
GRANT ALL ON public.arquivos_sincronizacoes TO service_role;
ALTER TABLE public.arquivos_sincronizacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam historico de sincronizacao"
ON public.arquivos_sincronizacoes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX arquivos_sincronizacoes_arquivo_idx ON public.arquivos_sincronizacoes (arquivo_id, created_at DESC);

CREATE TABLE public.dashboards_config (
  dashboard text NOT NULL PRIMARY KEY,
  sincronizacao_automatica boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dashboards_config_dashboard_check CHECK (dashboard IN ('CONTROL','FALTAS','ATESTADOS'))
);

GRANT SELECT, INSERT, UPDATE ON public.dashboards_config TO authenticated;
GRANT ALL ON public.dashboards_config TO service_role;
ALTER TABLE public.dashboards_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam configuracao de dashboards"
ON public.dashboards_config FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_dashboards_config_updated_at
BEFORE UPDATE ON public.dashboards_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.dashboards_config (dashboard) VALUES ('CONTROL'), ('FALTAS'), ('ATESTADOS')
ON CONFLICT (dashboard) DO NOTHING;

CREATE POLICY "Admins leem arquivos dos dashboards"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'arquivos-dashboards' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins enviam arquivos dos dashboards"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'arquivos-dashboards' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins atualizam arquivos dos dashboards"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'arquivos-dashboards' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'arquivos-dashboards' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins removem arquivos dos dashboards"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'arquivos-dashboards' AND public.has_role(auth.uid(), 'admin'));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;