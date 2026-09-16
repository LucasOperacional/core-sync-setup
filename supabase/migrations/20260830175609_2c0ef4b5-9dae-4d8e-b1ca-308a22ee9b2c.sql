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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canais_drm TO authenticated;
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
  tipo text NOT NULL DEFAULT 'pdf',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.faltas_arquivos TO authenticated;
GRANT ALL ON public.faltas_arquivos TO service_role;

ALTER TABLE public.faltas_arquivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem consultar arquivos de faltas"
  ON public.faltas_arquivos FOR SELECT TO authenticated USING (true);

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

CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, page_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
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

CREATE TABLE public.atestados_verificados (
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atestados_verificados TO authenticated;
GRANT ALL ON public.atestados_verificados TO service_role;
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

CREATE TABLE public.dados_extraidos_verificacao (
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dados_extraidos_verificacao TO authenticated;
GRANT ALL ON public.dados_extraidos_verificacao TO service_role;
ALTER TABLE public.dados_extraidos_verificacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View extracted data via atestado ownership"
  ON public.dados_extraidos_verificacao FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id
      AND (a.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

CREATE POLICY "Insert extracted data"
  ON public.dados_extraidos_verificacao FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id AND a.user_id = auth.uid()
    )
  );

CREATE TABLE public.validacoes_atestado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  resultado text NOT NULL,
  detalhes text NOT NULL DEFAULT '',
  origem text NOT NULL DEFAULT '',
  impacto_pontuacao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.validacoes_atestado TO authenticated;
GRANT ALL ON public.validacoes_atestado TO service_role;
ALTER TABLE public.validacoes_atestado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View validations via atestado ownership"
  ON public.validacoes_atestado FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id
      AND (a.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

CREATE POLICY "Insert validations"
  ON public.validacoes_atestado FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id AND a.user_id = auth.uid()
    )
  );

CREATE TABLE public.inconsistencias_atestado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descricao text NOT NULL,
  severidade text NOT NULL DEFAULT 'media',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inconsistencias_atestado TO authenticated;
GRANT ALL ON public.inconsistencias_atestado TO service_role;
ALTER TABLE public.inconsistencias_atestado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View inconsistencies via atestado ownership"
  ON public.inconsistencias_atestado FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id
      AND (a.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

CREATE POLICY "Insert inconsistencies"
  ON public.inconsistencias_atestado FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id AND a.user_id = auth.uid()
    )
  );

CREATE TABLE public.historico_analises_atestado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  acao text NOT NULL,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nome text NOT NULL DEFAULT 'Sistema',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_analises_atestado TO authenticated;
GRANT ALL ON public.historico_analises_atestado TO service_role;
ALTER TABLE public.historico_analises_atestado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View history via atestado ownership"
  ON public.historico_analises_atestado FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id
      AND (a.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

CREATE POLICY "Insert history"
  ON public.historico_analises_atestado FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id AND a.user_id = auth.uid()
    )
  );

CREATE TABLE public.logs_acesso_atestado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acao text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.logs_acesso_atestado TO authenticated;
GRANT ALL ON public.logs_acesso_atestado TO service_role;
ALTER TABLE public.logs_acesso_atestado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view access logs"
  ON public.logs_acesso_atestado FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Insert access logs"
  ON public.logs_acesso_atestado FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_atestados_verificados_user ON public.atestados_verificados(user_id);
CREATE INDEX idx_atestados_verificados_hash ON public.atestados_verificados(hash_sha256);
CREATE INDEX idx_dados_extraidos_atestado ON public.dados_extraidos_verificacao(atestado_id);
CREATE INDEX idx_validacoes_atestado ON public.validacoes_atestado(atestado_id);
CREATE INDEX idx_inconsistencias_atestado ON public.inconsistencias_atestado(atestado_id);
CREATE INDEX idx_historico_analises_atestado ON public.historico_analises_atestado(atestado_id);
CREATE INDEX idx_logs_acesso_atestado ON public.logs_acesso_atestado(atestado_id);
CREATE INDEX idx_logs_acesso_atestado_user ON public.logs_acesso_atestado(user_id);

CREATE POLICY "Authenticated users can upload atestados for verification"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'atestados-verificacao');

CREATE POLICY "Authenticated users can read own atestados verification"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'atestados-verificacao');

CREATE POLICY "Admins can delete atestados verification"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'atestados-verificacao' AND private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.protocolo_cartoes_ponto (
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

CREATE TABLE public.operational_errors (
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
  ON public.operational_errors FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated insert operational_errors"
  ON public.operational_errors FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admin update operational_errors"
  ON public.operational_errors FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.recovery_actions (
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
  ON public.recovery_actions FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated insert recovery_actions"
  ON public.recovery_actions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE public.known_error_solutions (
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
  ON public.known_error_solutions FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));