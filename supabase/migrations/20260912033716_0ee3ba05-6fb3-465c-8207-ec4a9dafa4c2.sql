CREATE TABLE IF NOT EXISTS public.nexti_sync_errors (
  created_at timestamptz NOT NULL DEFAULT now(),
  etapa text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  mensagem text NOT NULL,
  modulo text NOT NULL,
  run_id uuid,
  status_http numeric
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_sync_errors TO authenticated;
GRANT ALL ON public.nexti_sync_errors TO service_role;
ALTER TABLE public.nexti_sync_errors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_sync_errors_authenticated_all" ON public.nexti_sync_errors;
CREATE POLICY "nexti_sync_errors_authenticated_all" ON public.nexti_sync_errors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.nexti_sync_runs (
  atualizados numeric NOT NULL DEFAULT 0,
  com_erro numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalizado_em text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  ignorados numeric NOT NULL DEFAULT 0,
  importados numeric NOT NULL DEFAULT 0,
  iniciado_em text NOT NULL DEFAULT ''::text,
  mensagem text,
  modo text NOT NULL DEFAULT ''::text,
  modulo text NOT NULL,
  paginas numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT ''::text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_sync_runs TO authenticated;
GRANT ALL ON public.nexti_sync_runs TO service_role;
ALTER TABLE public.nexti_sync_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_sync_runs_authenticated_all" ON public.nexti_sync_runs;
CREATE POLICY "nexti_sync_runs_authenticated_all" ON public.nexti_sync_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_nexti_sync_runs ON public.nexti_sync_runs;
CREATE TRIGGER set_updated_at_nexti_sync_runs BEFORE UPDATE ON public.nexti_sync_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.nexti_workplaces (
  active boolean,
  city text,
  client_name text,
  company_id numeric,
  company_name text,
  cost_center text,
  created_at timestamptz NOT NULL DEFAULT now(),
  department text,
  external_id uuid,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  name text,
  nexti_id numeric NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_workplaces TO authenticated;
GRANT ALL ON public.nexti_workplaces TO service_role;
ALTER TABLE public.nexti_workplaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_workplaces_authenticated_all" ON public.nexti_workplaces;
CREATE POLICY "nexti_workplaces_authenticated_all" ON public.nexti_workplaces FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_nexti_workplaces ON public.nexti_workplaces;
CREATE TRIGGER set_updated_at_nexti_workplaces BEFORE UPDATE ON public.nexti_workplaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.operational_errors (
  component text,
  created_at timestamptz NOT NULL DEFAULT now(),
  error_type text NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  message text NOT NULL,
  page text NOT NULL DEFAULT ''::text,
  retry_count numeric NOT NULL DEFAULT 0,
  severity text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT ''::text,
  technical_details text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  user_id uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_errors TO authenticated;
GRANT ALL ON public.operational_errors TO service_role;
ALTER TABLE public.operational_errors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "operational_errors_authenticated_all" ON public.operational_errors;
CREATE POLICY "operational_errors_authenticated_all" ON public.operational_errors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.profiles (
  created_at timestamptz NOT NULL DEFAULT now(),
  departamento text,
  email text,
  id uuid PRIMARY KEY NOT NULL,
  nome text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_authenticated_all" ON public.profiles;
CREATE POLICY "profiles_authenticated_all" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.projeto_atualizacoes (
  aplicado_em text,
  arquivos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  enviado_por text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  nome_arquivo text NOT NULL,
  observacoes text,
  status text NOT NULL DEFAULT ''::text,
  storage_bucket text NOT NULL DEFAULT ''::text,
  storage_path text NOT NULL,
  tamanho_bytes numeric NOT NULL DEFAULT 0,
  total_arquivos numeric NOT NULL DEFAULT 0,
  versao text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projeto_atualizacoes TO authenticated;
GRANT ALL ON public.projeto_atualizacoes TO service_role;
ALTER TABLE public.projeto_atualizacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projeto_atualizacoes_authenticated_all" ON public.projeto_atualizacoes;
CREATE POLICY "projeto_atualizacoes_authenticated_all" ON public.projeto_atualizacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.protocolo_arquivos (
  caminho text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  protocolo_id uuid NOT NULL,
  tamanho numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolo_arquivos TO authenticated;
GRANT ALL ON public.protocolo_arquivos TO service_role;
ALTER TABLE public.protocolo_arquivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "protocolo_arquivos_authenticated_all" ON public.protocolo_arquivos;
CREATE POLICY "protocolo_arquivos_authenticated_all" ON public.protocolo_arquivos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.protocolo_cartoes_ponto (
  colaboradores jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  data_geracao text NOT NULL,
  empresa text NOT NULL,
  id uuid PRIMARY KEY NOT NULL,
  numero text NOT NULL,
  status text NOT NULL DEFAULT ''::text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolo_cartoes_ponto TO authenticated;
GRANT ALL ON public.protocolo_cartoes_ponto TO service_role;
ALTER TABLE public.protocolo_cartoes_ponto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "protocolo_cartoes_ponto_authenticated_all" ON public.protocolo_cartoes_ponto;
CREATE POLICY "protocolo_cartoes_ponto_authenticated_all" ON public.protocolo_cartoes_ponto FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.protocolo_folhas (
  admissao text NOT NULL DEFAULT ''::text,
  arquivo text,
  cargo text NOT NULL DEFAULT ''::text,
  colaborador text NOT NULL DEFAULT ''::text,
  conferido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  empresa text NOT NULL DEFAULT ''::text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  matricula text NOT NULL DEFAULT ''::text,
  ordem numeric NOT NULL,
  pagina numeric,
  posto text NOT NULL DEFAULT ''::text,
  protocolo_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolo_folhas TO authenticated;
GRANT ALL ON public.protocolo_folhas TO service_role;
ALTER TABLE public.protocolo_folhas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "protocolo_folhas_authenticated_all" ON public.protocolo_folhas;
CREATE POLICY "protocolo_folhas_authenticated_all" ON public.protocolo_folhas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.protocolo_ponto_itens (
  cargo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  empresa text NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  matricula text NOT NULL,
  nome text NOT NULL,
  posto text NOT NULL,
  protocolo_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolo_ponto_itens TO authenticated;
GRANT ALL ON public.protocolo_ponto_itens TO service_role;
ALTER TABLE public.protocolo_ponto_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "protocolo_ponto_itens_authenticated_all" ON public.protocolo_ponto_itens;
CREATE POLICY "protocolo_ponto_itens_authenticated_all" ON public.protocolo_ponto_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.protocolos (
  created_at timestamptz NOT NULL DEFAULT now(),
  data_entrega text NOT NULL DEFAULT ''::text,
  empresa text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  observacoes text,
  titulo text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolos TO authenticated;
GRANT ALL ON public.protocolos TO service_role;
ALTER TABLE public.protocolos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "protocolos_authenticated_all" ON public.protocolos;
CREATE POLICY "protocolos_authenticated_all" ON public.protocolos FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_protocolos ON public.protocolos;
CREATE TRIGGER set_updated_at_protocolos BEFORE UPDATE ON public.protocolos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.protocolos_ponto (
  created_at timestamptz NOT NULL DEFAULT now(),
  data_criacao text NOT NULL DEFAULT ''::text,
  empresa text NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  numero_protocolo text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT ''::text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolos_ponto TO authenticated;
GRANT ALL ON public.protocolos_ponto TO service_role;
ALTER TABLE public.protocolos_ponto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "protocolos_ponto_authenticated_all" ON public.protocolos_ponto;
CREATE POLICY "protocolos_ponto_authenticated_all" ON public.protocolos_ponto FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.rastreamento_localizacoes (
  bateria numeric,
  capturado_em text NOT NULL DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  direcao numeric,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  nome text,
  precisao_metros numeric,
  tipo_sinal text,
  user_id uuid NOT NULL,
  velocidade numeric
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreamento_localizacoes TO authenticated;
GRANT ALL ON public.rastreamento_localizacoes TO service_role;
ALTER TABLE public.rastreamento_localizacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rastreamento_localizacoes_authenticated_all" ON public.rastreamento_localizacoes;
CREATE POLICY "rastreamento_localizacoes_authenticated_all" ON public.rastreamento_localizacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.recovery_actions (
  action text NOT NULL,
  automatic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  duration_ms numeric NOT NULL DEFAULT 0,
  error_id uuid NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  result text NOT NULL DEFAULT ''::text,
  timestamp timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_actions TO authenticated;
GRANT ALL ON public.recovery_actions TO service_role;
ALTER TABLE public.recovery_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recovery_actions_authenticated_all" ON public.recovery_actions;
CREATE POLICY "recovery_actions_authenticated_all" ON public.recovery_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.roteiros_visita_campo (
  cliente text NOT NULL DEFAULT ''::text,
  colaborador text NOT NULL DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  criticas_abertas numeric NOT NULL DEFAULT 0,
  data_visita text NOT NULL DEFAULT ''::text,
  empresa text NOT NULL DEFAULT ''::text,
  funcao text NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  motivo text NOT NULL DEFAULT ''::text,
  observacao_geral text NOT NULL DEFAULT ''::text,
  observacoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  percentual_conformidade numeric NOT NULL DEFAULT 0,
  plano_acao text NOT NULL DEFAULT ''::text,
  posto text NOT NULL,
  respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  supervisor text NOT NULL DEFAULT ''::text,
  total_conformes numeric NOT NULL DEFAULT 0,
  total_nao_aplicaveis numeric NOT NULL DEFAULT 0,
  total_nao_conformes numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roteiros_visita_campo TO authenticated;
GRANT ALL ON public.roteiros_visita_campo TO service_role;
ALTER TABLE public.roteiros_visita_campo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "roteiros_visita_campo_authenticated_all" ON public.roteiros_visita_campo;
CREATE POLICY "roteiros_visita_campo_authenticated_all" ON public.roteiros_visita_campo FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_roteiros_visita_campo ON public.roteiros_visita_campo;
CREATE TRIGGER set_updated_at_roteiros_visita_campo BEFORE UPDATE ON public.roteiros_visita_campo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.security_api_events (
  card_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  http_status numeric,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  latency_ms numeric,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text NOT NULL,
  resource text NOT NULL,
  severity text NOT NULL DEFAULT ''::text,
  user_id uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_api_events TO authenticated;
GRANT ALL ON public.security_api_events TO service_role;
ALTER TABLE public.security_api_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "security_api_events_authenticated_all" ON public.security_api_events;
CREATE POLICY "security_api_events_authenticated_all" ON public.security_api_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  admin_approved boolean,
  admin_approved_at timestamptz,
  admin_approved_by text,
  allows_rollback boolean,
  created_at timestamptz,
  description text NOT NULL,
  event_type text NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  ip_address text,
  metadata jsonb,
  requires_admin_approval boolean,
  rolled_back boolean,
  rolled_back_at timestamptz,
  severity text NOT NULL DEFAULT ''::text,
  user_agent text,
  user_id uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "security_audit_log_authenticated_all" ON public.security_audit_log;
CREATE POLICY "security_audit_log_authenticated_all" ON public.security_audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.security_blocklist (
  blocked_until text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  identity text NOT NULL,
  reason text NOT NULL,
  severity text NOT NULL DEFAULT ''::text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_blocklist TO authenticated;
GRANT ALL ON public.security_blocklist TO service_role;
ALTER TABLE public.security_blocklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "security_blocklist_authenticated_all" ON public.security_blocklist;
CREATE POLICY "security_blocklist_authenticated_all" ON public.security_blocklist FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.solicitacoes_acesso (
  created_at timestamptz NOT NULL DEFAULT now(),
  decidido_em text,
  decidido_por text,
  departamento text,
  email text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  nome text,
  observacao text,
  role_solicitada text,
  status text NOT NULL DEFAULT ''::text,
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitacoes_acesso TO authenticated;
GRANT ALL ON public.solicitacoes_acesso TO service_role;
ALTER TABLE public.solicitacoes_acesso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "solicitacoes_acesso_authenticated_all" ON public.solicitacoes_acesso;
CREATE POLICY "solicitacoes_acesso_authenticated_all" ON public.solicitacoes_acesso FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.solicitacoes_vagas (
  aprovacao_automatica boolean NOT NULL DEFAULT false,
  arquivo text,
  atividade text,
  caminho_pdf text,
  cargo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  data_inicio text,
  decidido_em text,
  decidido_por text,
  email_destino text,
  fiscal_responsavel text,
  horario text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  justificativa text,
  localidade text,
  motivo_decisao text,
  pendencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  perfil text,
  posto text,
  salario text,
  solicitante text,
  status text NOT NULL DEFAULT ''::text,
  tipo text,
  user_id uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitacoes_vagas TO authenticated;
GRANT ALL ON public.solicitacoes_vagas TO service_role;
ALTER TABLE public.solicitacoes_vagas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "solicitacoes_vagas_authenticated_all" ON public.solicitacoes_vagas;
CREATE POLICY "solicitacoes_vagas_authenticated_all" ON public.solicitacoes_vagas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.user_dashboard_layouts (
  created_at timestamptz NOT NULL DEFAULT now(),
  dashboard text NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_dashboard_layouts TO authenticated;
GRANT ALL ON public.user_dashboard_layouts TO service_role;
ALTER TABLE public.user_dashboard_layouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_dashboard_layouts_authenticated_all" ON public.user_dashboard_layouts;
CREATE POLICY "user_dashboard_layouts_authenticated_all" ON public.user_dashboard_layouts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_user_dashboard_layouts ON public.user_dashboard_layouts;
CREATE TRIGGER set_updated_at_user_dashboard_layouts BEFORE UPDATE ON public.user_dashboard_layouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.user_permissions (
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  page_key text NOT NULL,
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_permissions_authenticated_all" ON public.user_permissions;
CREATE POLICY "user_permissions_authenticated_all" ON public.user_permissions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.user_profiles (
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  department text NOT NULL DEFAULT ''::text,
  display_name text NOT NULL DEFAULT ''::text,
  id uuid PRIMARY KEY NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_profiles_authenticated_all" ON public.user_profiles;
CREATE POLICY "user_profiles_authenticated_all" ON public.user_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_user_profiles ON public.user_profiles;
CREATE TRIGGER set_updated_at_user_profiles BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.validacoes_atestado (
  atestado_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  descricao text NOT NULL,
  detalhes text NOT NULL DEFAULT ''::text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  impacto_pontuacao numeric NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT ''::text,
  resultado text NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validacoes_atestado TO authenticated;
GRANT ALL ON public.validacoes_atestado TO service_role;
ALTER TABLE public.validacoes_atestado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "validacoes_atestado_authenticated_all" ON public.validacoes_atestado;
CREATE POLICY "validacoes_atestado_authenticated_all" ON public.validacoes_atestado FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.visitas (
  arquivo text NOT NULL DEFAULT ''::text,
  bairro text NOT NULL DEFAULT ''::text,
  cargo text NOT NULL DEFAULT ''::text,
  chave text NOT NULL,
  cidade text NOT NULL DEFAULT ''::text,
  cliente text NOT NULL DEFAULT ''::text,
  conformes numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  duracao_min numeric,
  endereco text NOT NULL DEFAULT ''::text,
  fim text,
  gerente_id uuid,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  inicio text,
  local text NOT NULL DEFAULT ''::text,
  nao_conformes numeric NOT NULL DEFAULT 0,
  posto text NOT NULL DEFAULT ''::text,
  relatos jsonb NOT NULL DEFAULT '{}'::jsonb,
  responsavel text NOT NULL DEFAULT ''::text,
  respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  uf text NOT NULL DEFAULT ''::text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitas TO authenticated;
GRANT ALL ON public.visitas TO service_role;
ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "visitas_authenticated_all" ON public.visitas;
CREATE POLICY "visitas_authenticated_all" ON public.visitas FOR ALL TO authenticated USING (true) WITH CHECK (true);
DO $$ BEGIN
  ALTER TABLE public.ai_messages ADD CONSTRAINT ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.arquivos ADD CONSTRAINT arquivos_gerente_id_fkey FOREIGN KEY (gerente_id) REFERENCES public.gerentes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.arquivos_sincronizacoes ADD CONSTRAINT arquivos_sincronizacoes_arquivo_id_fkey FOREIGN KEY (arquivo_id) REFERENCES public.arquivos_importados(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.assinatura_auditoria ADD CONSTRAINT assinatura_auditoria_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.assinatura_documentos(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.assinatura_auditoria ADD CONSTRAINT assinatura_auditoria_signatario_id_fkey FOREIGN KEY (signatario_id) REFERENCES public.assinatura_signatarios(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;