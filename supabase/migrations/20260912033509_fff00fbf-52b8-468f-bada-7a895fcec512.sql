CREATE TABLE IF NOT EXISTS public.gerentes (
  cargo text NOT NULL DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  email text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gerentes TO authenticated;
GRANT ALL ON public.gerentes TO service_role;
ALTER TABLE public.gerentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gerentes_authenticated_all" ON public.gerentes;
CREATE POLICY "gerentes_authenticated_all" ON public.gerentes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.historico_analises_atestado (
  acao text NOT NULL,
  atestado_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  observacao text,
  usuario_id uuid,
  usuario_nome text NOT NULL DEFAULT ''::text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_analises_atestado TO authenticated;
GRANT ALL ON public.historico_analises_atestado TO service_role;
ALTER TABLE public.historico_analises_atestado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historico_analises_atestado_authenticated_all" ON public.historico_analises_atestado;
CREATE POLICY "historico_analises_atestado_authenticated_all" ON public.historico_analises_atestado FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.ia_training_data (
  active boolean NOT NULL DEFAULT false,
  answer text,
  category text NOT NULL DEFAULT ''::text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  question text,
  title text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_training_data TO authenticated;
GRANT ALL ON public.ia_training_data TO service_role;
ALTER TABLE public.ia_training_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ia_training_data_authenticated_all" ON public.ia_training_data;
CREATE POLICY "ia_training_data_authenticated_all" ON public.ia_training_data FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_ia_training_data ON public.ia_training_data;
CREATE TRIGGER set_updated_at_ia_training_data BEFORE UPDATE ON public.ia_training_data FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.inconsistencias_atestado (
  atestado_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  descricao text NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  severidade text NOT NULL DEFAULT ''::text,
  tipo text NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inconsistencias_atestado TO authenticated;
GRANT ALL ON public.inconsistencias_atestado TO service_role;
ALTER TABLE public.inconsistencias_atestado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inconsistencias_atestado_authenticated_all" ON public.inconsistencias_atestado;
CREATE POLICY "inconsistencias_atestado_authenticated_all" ON public.inconsistencias_atestado FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.known_error_solutions (
  active boolean NOT NULL DEFAULT false,
  authorized_solution text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL,
  error_signature text NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  max_retries numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.known_error_solutions TO authenticated;
GRANT ALL ON public.known_error_solutions TO service_role;
ALTER TABLE public.known_error_solutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "known_error_solutions_authenticated_all" ON public.known_error_solutions;
CREATE POLICY "known_error_solutions_authenticated_all" ON public.known_error_solutions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_known_error_solutions ON public.known_error_solutions;
CREATE TRIGGER set_updated_at_known_error_solutions BEFORE UPDATE ON public.known_error_solutions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.lgpd_acessos (
  acao text NOT NULL DEFAULT ''::text,
  base_legal text NOT NULL DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  finalidade text NOT NULL DEFAULT ''::text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  recurso text NOT NULL,
  titular_ref text NOT NULL DEFAULT ''::text,
  user_id uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lgpd_acessos TO authenticated;
GRANT ALL ON public.lgpd_acessos TO service_role;
ALTER TABLE public.lgpd_acessos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lgpd_acessos_authenticated_all" ON public.lgpd_acessos;
CREATE POLICY "lgpd_acessos_authenticated_all" ON public.lgpd_acessos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.lgpd_config (
  anonimizar_apos_retencao boolean NOT NULL DEFAULT false,
  banner_consentimento_ativo boolean NOT NULL DEFAULT false,
  controlador text NOT NULL DEFAULT ''::text,
  controlador_cnpj text NOT NULL DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  encarregado_email text NOT NULL DEFAULT ''::text,
  encarregado_nome text NOT NULL DEFAULT ''::text,
  encarregado_telefone text NOT NULL DEFAULT ''::text,
  id boolean PRIMARY KEY NOT NULL,
  politica_texto text NOT NULL DEFAULT ''::text,
  politica_versao text NOT NULL DEFAULT ''::text,
  prazo_resposta_dias numeric NOT NULL DEFAULT 0,
  retencao_atestados_dias numeric NOT NULL DEFAULT 0,
  retencao_chat_dias numeric NOT NULL DEFAULT 0,
  retencao_folhas_dias numeric NOT NULL DEFAULT 0,
  retencao_logs_dias numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lgpd_config TO authenticated;
GRANT ALL ON public.lgpd_config TO service_role;
ALTER TABLE public.lgpd_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lgpd_config_authenticated_all" ON public.lgpd_config;
CREATE POLICY "lgpd_config_authenticated_all" ON public.lgpd_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_lgpd_config ON public.lgpd_config;
CREATE TRIGGER set_updated_at_lgpd_config BEFORE UPDATE ON public.lgpd_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.lgpd_consents (
  aceito boolean NOT NULL DEFAULT false,
  base_legal text NOT NULL DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalidade text NOT NULL DEFAULT ''::text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  politica_versao text NOT NULL DEFAULT ''::text,
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lgpd_consents TO authenticated;
GRANT ALL ON public.lgpd_consents TO service_role;
ALTER TABLE public.lgpd_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lgpd_consents_authenticated_all" ON public.lgpd_consents;
CREATE POLICY "lgpd_consents_authenticated_all" ON public.lgpd_consents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.lgpd_incidentes (
  comunicado_anpd boolean NOT NULL DEFAULT false,
  comunicado_em text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  dados_afetados text NOT NULL DEFAULT ''::text,
  descricao text NOT NULL DEFAULT ''::text,
  detectado_em text NOT NULL DEFAULT ''::text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  medidas text NOT NULL DEFAULT ''::text,
  severidade text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT ''::text,
  titulares_afetados numeric NOT NULL DEFAULT 0,
  titulo text NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lgpd_incidentes TO authenticated;
GRANT ALL ON public.lgpd_incidentes TO service_role;
ALTER TABLE public.lgpd_incidentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lgpd_incidentes_authenticated_all" ON public.lgpd_incidentes;
CREATE POLICY "lgpd_incidentes_authenticated_all" ON public.lgpd_incidentes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.lgpd_solicitacoes (
  created_at timestamptz NOT NULL DEFAULT now(),
  descricao text NOT NULL DEFAULT ''::text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  prazo_em text NOT NULL DEFAULT ''::text,
  respondido_em text,
  respondido_por text,
  resposta text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT ''::text,
  tipo text NOT NULL DEFAULT ''::text,
  titular_email text NOT NULL DEFAULT ''::text,
  titular_nome text NOT NULL DEFAULT ''::text,
  user_id uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lgpd_solicitacoes TO authenticated;
GRANT ALL ON public.lgpd_solicitacoes TO service_role;
ALTER TABLE public.lgpd_solicitacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lgpd_solicitacoes_authenticated_all" ON public.lgpd_solicitacoes;
CREATE POLICY "lgpd_solicitacoes_authenticated_all" ON public.lgpd_solicitacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.logs_acesso_atestado (
  acao text NOT NULL,
  atestado_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  ip_address text,
  user_agent text,
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logs_acesso_atestado TO authenticated;
GRANT ALL ON public.logs_acesso_atestado TO service_role;
ALTER TABLE public.logs_acesso_atestado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "logs_acesso_atestado_authenticated_all" ON public.logs_acesso_atestado;
CREATE POLICY "logs_acesso_atestado_authenticated_all" ON public.logs_acesso_atestado FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.monitor_cron (
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  token text NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_cron TO authenticated;
GRANT ALL ON public.monitor_cron TO service_role;
ALTER TABLE public.monitor_cron ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monitor_cron_authenticated_all" ON public.monitor_cron;
CREATE POLICY "monitor_cron_authenticated_all" ON public.monitor_cron FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.monitor_errors (
  created_at timestamptz NOT NULL DEFAULT now(),
  enviado boolean NOT NULL DEFAULT false,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  mensagem text,
  origem text,
  rota text,
  status_http numeric,
  tipo text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_errors TO authenticated;
GRANT ALL ON public.monitor_errors TO service_role;
ALTER TABLE public.monitor_errors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monitor_errors_authenticated_all" ON public.monitor_errors;
CREATE POLICY "monitor_errors_authenticated_all" ON public.monitor_errors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.monitor_heartbeats (
  ambiente text,
  checks jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  erro text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  latency_ms numeric,
  ok boolean NOT NULL DEFAULT false,
  status text,
  tentativas numeric,
  versao text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_heartbeats TO authenticated;
GRANT ALL ON public.monitor_heartbeats TO service_role;
ALTER TABLE public.monitor_heartbeats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monitor_heartbeats_authenticated_all" ON public.monitor_heartbeats;
CREATE POLICY "monitor_heartbeats_authenticated_all" ON public.monitor_heartbeats FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.monitor_recovery_log (
  acao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  detalhe text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  resultado text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_recovery_log TO authenticated;
GRANT ALL ON public.monitor_recovery_log TO service_role;
ALTER TABLE public.monitor_recovery_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monitor_recovery_log_authenticated_all" ON public.monitor_recovery_log;
CREATE POLICY "monitor_recovery_log_authenticated_all" ON public.monitor_recovery_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.monitoring_pings (
  created_at timestamptz NOT NULL DEFAULT now(),
  duracao_ms numeric,
  endpoint text NOT NULL DEFAULT ''::text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  ip text,
  status numeric NOT NULL DEFAULT 0,
  token_id uuid,
  user_agent text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_pings TO authenticated;
GRANT ALL ON public.monitoring_pings TO service_role;
ALTER TABLE public.monitoring_pings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monitoring_pings_authenticated_all" ON public.monitoring_pings;
CREATE POLICY "monitoring_pings_authenticated_all" ON public.monitoring_pings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.monitoring_tokens (
  created_at timestamptz NOT NULL DEFAULT now(),
  criado_por text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  last_used_at timestamptz,
  nome text NOT NULL,
  prefixo text NOT NULL DEFAULT ''::text,
  revogado_em text,
  token_hash text NOT NULL,
  total_requisicoes numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_tokens TO authenticated;
GRANT ALL ON public.monitoring_tokens TO service_role;
ALTER TABLE public.monitoring_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monitoring_tokens_authenticated_all" ON public.monitoring_tokens;
CREATE POLICY "monitoring_tokens_authenticated_all" ON public.monitoring_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.nexti_absences (
  absence_situation_external_id uuid,
  absence_situation_id numeric,
  cid_code text,
  cid_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finish_date_time text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  last_update text,
  medical_doctor_crm text,
  medical_doctor_name text,
  nexti_id numeric NOT NULL,
  note text,
  person_external_id uuid,
  person_id numeric,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  removed boolean NOT NULL DEFAULT false,
  start_date_time text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_absences TO authenticated;
GRANT ALL ON public.nexti_absences TO service_role;
ALTER TABLE public.nexti_absences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_absences_authenticated_all" ON public.nexti_absences;
CREATE POLICY "nexti_absences_authenticated_all" ON public.nexti_absences FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_nexti_absences ON public.nexti_absences;
CREATE TRIGGER set_updated_at_nexti_absences BEFORE UPDATE ON public.nexti_absences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.nexti_areas (
  created_at timestamptz NOT NULL DEFAULT now(),
  external_id uuid,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  name text,
  nexti_id numeric NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_areas TO authenticated;
GRANT ALL ON public.nexti_areas TO service_role;
ALTER TABLE public.nexti_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_areas_authenticated_all" ON public.nexti_areas;
CREATE POLICY "nexti_areas_authenticated_all" ON public.nexti_areas FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_nexti_areas ON public.nexti_areas;
CREATE TRIGGER set_updated_at_nexti_areas BEFORE UPDATE ON public.nexti_areas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.nexti_careers (
  career_group_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  external_id uuid,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  name text,
  nexti_id numeric NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_careers TO authenticated;
GRANT ALL ON public.nexti_careers TO service_role;
ALTER TABLE public.nexti_careers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_careers_authenticated_all" ON public.nexti_careers;
CREATE POLICY "nexti_careers_authenticated_all" ON public.nexti_careers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_nexti_careers ON public.nexti_careers;
CREATE TRIGGER set_updated_at_nexti_careers BEFORE UPDATE ON public.nexti_careers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.nexti_checklist_answers (
  answer_date text,
  checklist_id numeric,
  checklist_name text,
  checklist_type_id numeric,
  cidade text,
  cliente text,
  conformes numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  device_code text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  itens jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  nao_conformes numeric NOT NULL DEFAULT 0,
  nexti_id numeric NOT NULL,
  person_id numeric,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_date text,
  register_date text,
  supervisor_nome text,
  total_perguntas numeric NOT NULL DEFAULT 0,
  uf text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  workplace_id numeric,
  workplace_name text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_checklist_answers TO authenticated;
GRANT ALL ON public.nexti_checklist_answers TO service_role;
ALTER TABLE public.nexti_checklist_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_checklist_answers_authenticated_all" ON public.nexti_checklist_answers;
CREATE POLICY "nexti_checklist_answers_authenticated_all" ON public.nexti_checklist_answers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_nexti_checklist_answers ON public.nexti_checklist_answers;
CREATE TRIGGER set_updated_at_nexti_checklist_answers BEFORE UPDATE ON public.nexti_checklist_answers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.nexti_checklists (
  checklist_type_id numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  finish_date_time text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  name text,
  nexti_id numeric NOT NULL,
  questions jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  start_date_time text,
  status_id numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  workplace_ids numeric[] NOT NULL DEFAULT '{}'::numeric[]
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_checklists TO authenticated;
GRANT ALL ON public.nexti_checklists TO service_role;
ALTER TABLE public.nexti_checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_checklists_authenticated_all" ON public.nexti_checklists;
CREATE POLICY "nexti_checklists_authenticated_all" ON public.nexti_checklists FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_nexti_checklists ON public.nexti_checklists;
CREATE TRIGGER set_updated_at_nexti_checklists BEFORE UPDATE ON public.nexti_checklists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.nexti_clockings (
  clocking_collector_name text,
  clocking_date text,
  clocking_type_id numeric,
  clocking_type_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  external_person_id uuid,
  external_workplace_id uuid,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  last_update text,
  nexti_id numeric NOT NULL,
  person_id numeric,
  person_name text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_date text,
  removed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  workplace_id numeric
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_clockings TO authenticated;
GRANT ALL ON public.nexti_clockings TO service_role;
ALTER TABLE public.nexti_clockings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_clockings_authenticated_all" ON public.nexti_clockings;
CREATE POLICY "nexti_clockings_authenticated_all" ON public.nexti_clockings FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_nexti_clockings ON public.nexti_clockings;
CREATE TRIGGER set_updated_at_nexti_clockings BEFORE UPDATE ON public.nexti_clockings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.nexti_companies (
  active boolean,
  company_name text,
  company_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  external_id uuid,
  fantasy_name text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  nexti_id numeric NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_companies TO authenticated;
GRANT ALL ON public.nexti_companies TO service_role;
ALTER TABLE public.nexti_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_companies_authenticated_all" ON public.nexti_companies;
CREATE POLICY "nexti_companies_authenticated_all" ON public.nexti_companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_nexti_companies ON public.nexti_companies;
CREATE TRIGGER set_updated_at_nexti_companies BEFORE UPDATE ON public.nexti_companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.nexti_config (
  base_url text NOT NULL DEFAULT ''::text,
  client_id uuid NOT NULL,
  client_secret text NOT NULL DEFAULT ''::text,
  enabled boolean NOT NULL DEFAULT false,
  id boolean PRIMARY KEY NOT NULL,
  test_endpoint text NOT NULL DEFAULT ''::text,
  token text NOT NULL DEFAULT ''::text,
  token_endpoint text NOT NULL DEFAULT ''::text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  username text NOT NULL DEFAULT ''::text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_config TO authenticated;
GRANT ALL ON public.nexti_config TO service_role;
ALTER TABLE public.nexti_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_config_authenticated_all" ON public.nexti_config;
CREATE POLICY "nexti_config_authenticated_all" ON public.nexti_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_nexti_config ON public.nexti_config;
CREATE TRIGGER set_updated_at_nexti_config BEFORE UPDATE ON public.nexti_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.nexti_document_types (
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  is_atestado boolean NOT NULL DEFAULT false,
  name text,
  nexti_id numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_document_types TO authenticated;
GRANT ALL ON public.nexti_document_types TO service_role;
ALTER TABLE public.nexti_document_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_document_types_authenticated_all" ON public.nexti_document_types;
CREATE POLICY "nexti_document_types_authenticated_all" ON public.nexti_document_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_nexti_document_types ON public.nexti_document_types;
CREATE TRIGGER set_updated_at_nexti_document_types BEFORE UPDATE ON public.nexti_document_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.nexti_documents (
  created_at timestamptz NOT NULL DEFAULT now(),
  document_type_customer_id numeric,
  document_type_customer_name text,
  document_url text,
  due_date text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  issue_date text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  nexti_id numeric NOT NULL,
  note text,
  person_id numeric,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  workplace_id numeric
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_documents TO authenticated;
GRANT ALL ON public.nexti_documents TO service_role;
ALTER TABLE public.nexti_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_documents_authenticated_all" ON public.nexti_documents;
CREATE POLICY "nexti_documents_authenticated_all" ON public.nexti_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_nexti_documents ON public.nexti_documents;
CREATE TRIGGER set_updated_at_nexti_documents BEFORE UPDATE ON public.nexti_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.nexti_persons (
  admission_date text,
  career_id numeric,
  career_name text,
  company_id numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  demission_date text,
  external_id uuid,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  matricula text,
  nexti_id numeric NOT NULL,
  nome text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  situacao text,
  situacao_id numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  workplace_id numeric,
  workplace_name text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexti_persons TO authenticated;
GRANT ALL ON public.nexti_persons TO service_role;
ALTER TABLE public.nexti_persons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nexti_persons_authenticated_all" ON public.nexti_persons;
CREATE POLICY "nexti_persons_authenticated_all" ON public.nexti_persons FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_nexti_persons ON public.nexti_persons;
CREATE TRIGGER set_updated_at_nexti_persons BEFORE UPDATE ON public.nexti_persons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();