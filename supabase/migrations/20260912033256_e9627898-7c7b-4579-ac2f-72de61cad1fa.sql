CREATE TABLE IF NOT EXISTS public.ai_conversations (
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  provider text,
  title text NOT NULL DEFAULT ''::text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_conversations_authenticated_all" ON public.ai_conversations;
CREATE POLICY "ai_conversations_authenticated_all" ON public.ai_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_ai_conversations ON public.ai_conversations;
CREATE TRIGGER set_updated_at_ai_conversations BEFORE UPDATE ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.ai_messages (
  content text NOT NULL,
  conversation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  model text,
  provider text,
  role text NOT NULL,
  status text NOT NULL DEFAULT ''::text,
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_messages_authenticated_all" ON public.ai_messages;
CREATE POLICY "ai_messages_authenticated_all" ON public.ai_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  valor text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_config_authenticated_all" ON public.app_config;
CREATE POLICY "app_config_authenticated_all" ON public.app_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_app_config ON public.app_config;
CREATE TRIGGER set_updated_at_app_config BEFORE UPDATE ON public.app_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.arquivos (
  caminho text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  gerente_id uuid,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tamanho numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arquivos TO authenticated;
GRANT ALL ON public.arquivos TO service_role;
ALTER TABLE public.arquivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "arquivos_authenticated_all" ON public.arquivos;
CREATE POLICY "arquivos_authenticated_all" ON public.arquivos FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_arquivos ON public.arquivos;
CREATE TRIGGER set_updated_at_arquivos BEFORE UPDATE ON public.arquivos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.arquivos_importados (
  created_at timestamptz NOT NULL DEFAULT now(),
  dashboard text NOT NULL,
  formato text NOT NULL DEFAULT ''::text,
  hash_arquivo text NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  importado_em text NOT NULL DEFAULT ''::text,
  mensagem_erro text,
  nome_original text NOT NULL,
  registros numeric NOT NULL DEFAULT 0,
  status_processamento text NOT NULL DEFAULT ''::text,
  status_sincronizacao text NOT NULL DEFAULT ''::text,
  storage_bucket text NOT NULL DEFAULT ''::text,
  storage_path text NOT NULL,
  tamanho numeric NOT NULL DEFAULT 0,
  ultima_sincronizacao text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid,
  usuario_nome text NOT NULL DEFAULT ''::text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arquivos_importados TO authenticated;
GRANT ALL ON public.arquivos_importados TO service_role;
ALTER TABLE public.arquivos_importados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "arquivos_importados_authenticated_all" ON public.arquivos_importados;
CREATE POLICY "arquivos_importados_authenticated_all" ON public.arquivos_importados FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_arquivos_importados ON public.arquivos_importados;
CREATE TRIGGER set_updated_at_arquivos_importados BEFORE UPDATE ON public.arquivos_importados FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.arquivos_sincronizacoes (
  arquivo_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  dashboard text NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  mensagem text NOT NULL DEFAULT ''::text,
  registros numeric NOT NULL DEFAULT 0,
  resultado text NOT NULL,
  usuario_id uuid,
  usuario_nome text NOT NULL DEFAULT ''::text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arquivos_sincronizacoes TO authenticated;
GRANT ALL ON public.arquivos_sincronizacoes TO service_role;
ALTER TABLE public.arquivos_sincronizacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "arquivos_sincronizacoes_authenticated_all" ON public.arquivos_sincronizacoes;
CREATE POLICY "arquivos_sincronizacoes_authenticated_all" ON public.arquivos_sincronizacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.assinatura_auditoria (
  created_at timestamptz NOT NULL DEFAULT now(),
  detalhe text,
  dispositivo text,
  documento_id uuid NOT NULL,
  evento text NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  ip text,
  signatario_id uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinatura_auditoria TO authenticated;
GRANT ALL ON public.assinatura_auditoria TO service_role;
ALTER TABLE public.assinatura_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assinatura_auditoria_authenticated_all" ON public.assinatura_auditoria;
CREATE POLICY "assinatura_auditoria_authenticated_all" ON public.assinatura_auditoria FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.assinatura_documentos (
  assinado_path text,
  campos jsonb NOT NULL DEFAULT '{}'::jsonb,
  cancelado_em text,
  concluido_em text,
  created_at timestamptz NOT NULL DEFAULT now(),
  criado_por_nome text,
  exige_codigo boolean NOT NULL DEFAULT false,
  expira_em text,
  hash_sha256 text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  original_path text,
  preenchido_path text,
  protocolo text NOT NULL,
  status text NOT NULL DEFAULT ''::text,
  tipo text NOT NULL DEFAULT ''::text,
  titulo text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinatura_documentos TO authenticated;
GRANT ALL ON public.assinatura_documentos TO service_role;
ALTER TABLE public.assinatura_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assinatura_documentos_authenticated_all" ON public.assinatura_documentos;
CREATE POLICY "assinatura_documentos_authenticated_all" ON public.assinatura_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_assinatura_documentos ON public.assinatura_documentos;
CREATE TRIGGER set_updated_at_assinatura_documentos BEFORE UPDATE ON public.assinatura_documentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.assinatura_modelos (
  campos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  original_path text,
  tipo text NOT NULL DEFAULT ''::text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinatura_modelos TO authenticated;
GRANT ALL ON public.assinatura_modelos TO service_role;
ALTER TABLE public.assinatura_modelos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assinatura_modelos_authenticated_all" ON public.assinatura_modelos;
CREATE POLICY "assinatura_modelos_authenticated_all" ON public.assinatura_modelos FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_assinatura_modelos ON public.assinatura_modelos;
CREATE TRIGGER set_updated_at_assinatura_modelos BEFORE UPDATE ON public.assinatura_modelos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.assinatura_signatarios (
  assinado_em text,
  assinatura_path text,
  codigo_expira_em text,
  codigo_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispositivo text,
  documento_id uuid NOT NULL,
  email text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  ip text,
  motivo_recusa text,
  nome text NOT NULL,
  ordem numeric NOT NULL DEFAULT 0,
  recusado_em text,
  status text NOT NULL DEFAULT ''::text,
  telefone text,
  token_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  visualizado_em text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinatura_signatarios TO authenticated;
GRANT ALL ON public.assinatura_signatarios TO service_role;
ALTER TABLE public.assinatura_signatarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assinatura_signatarios_authenticated_all" ON public.assinatura_signatarios;
CREATE POLICY "assinatura_signatarios_authenticated_all" ON public.assinatura_signatarios FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_assinatura_signatarios ON public.assinatura_signatarios;
CREATE TRIGGER set_updated_at_assinatura_signatarios BEFORE UPDATE ON public.assinatura_signatarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.atestados_verificados (
  caminho_storage text NOT NULL,
  classificacao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  faixa_risco text NOT NULL DEFAULT ''::text,
  hash_sha256 text NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  nome_arquivo text NOT NULL,
  observacao text NOT NULL DEFAULT ''::text,
  pontuacao_risco numeric NOT NULL DEFAULT 0,
  tamanho_arquivo numeric NOT NULL DEFAULT 0,
  texto_extraido text NOT NULL DEFAULT ''::text,
  tipo_arquivo text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atestados_verificados TO authenticated;
GRANT ALL ON public.atestados_verificados TO service_role;
ALTER TABLE public.atestados_verificados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atestados_verificados_authenticated_all" ON public.atestados_verificados;
CREATE POLICY "atestados_verificados_authenticated_all" ON public.atestados_verificados FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_atestados_verificados ON public.atestados_verificados;
CREATE TRIGGER set_updated_at_atestados_verificados BEFORE UPDATE ON public.atestados_verificados FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.canais_drm (
  ativo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  criado_por text,
  erro_verificacao text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  latencia_ms numeric,
  nome text NOT NULL,
  status text NOT NULL DEFAULT ''::text,
  ultima_verificacao text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  url text NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canais_drm TO authenticated;
GRANT ALL ON public.canais_drm TO service_role;
ALTER TABLE public.canais_drm ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "canais_drm_authenticated_all" ON public.canais_drm;
CREATE POLICY "canais_drm_authenticated_all" ON public.canais_drm FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_canais_drm ON public.canais_drm;
CREATE TRIGGER set_updated_at_canais_drm BEFORE UPDATE ON public.canais_drm FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.chat_message_reads (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  room_id uuid NOT NULL,
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_message_reads TO authenticated;
GRANT ALL ON public.chat_message_reads TO service_role;
ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_message_reads_authenticated_all" ON public.chat_message_reads;
CREATE POLICY "chat_message_reads_authenticated_all" ON public.chat_message_reads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.chat_messages (
  attachment_name text,
  attachment_type text,
  attachment_url text,
  content text NOT NULL DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  edited boolean NOT NULL DEFAULT false,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_messages_authenticated_all" ON public.chat_messages;
CREATE POLICY "chat_messages_authenticated_all" ON public.chat_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_chat_messages ON public.chat_messages;
CREATE TRIGGER set_updated_at_chat_messages BEFORE UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.chat_queue_agents (
  added_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL,
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_queue_agents TO authenticated;
GRANT ALL ON public.chat_queue_agents TO service_role;
ALTER TABLE public.chat_queue_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_queue_agents_authenticated_all" ON public.chat_queue_agents;
CREATE POLICY "chat_queue_agents_authenticated_all" ON public.chat_queue_agents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.chat_queue_conversations (
  assigned_at timestamptz,
  assigned_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL,
  room_id uuid NOT NULL,
  started_by text,
  status text NOT NULL DEFAULT ''::text,
  subject text NOT NULL DEFAULT ''::text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_queue_conversations TO authenticated;
GRANT ALL ON public.chat_queue_conversations TO service_role;
ALTER TABLE public.chat_queue_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_queue_conversations_authenticated_all" ON public.chat_queue_conversations;
CREATE POLICY "chat_queue_conversations_authenticated_all" ON public.chat_queue_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_chat_queue_conversations ON public.chat_queue_conversations;
CREATE TRIGGER set_updated_at_chat_queue_conversations BEFORE UPDATE ON public.chat_queue_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.chat_queues (
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  department text NOT NULL DEFAULT ''::text,
  description text NOT NULL DEFAULT ''::text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_queues TO authenticated;
GRANT ALL ON public.chat_queues TO service_role;
ALTER TABLE public.chat_queues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_queues_authenticated_all" ON public.chat_queues;
CREATE POLICY "chat_queues_authenticated_all" ON public.chat_queues FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_chat_queues ON public.chat_queues;
CREATE TRIGGER set_updated_at_chat_queues BEFORE UPDATE ON public.chat_queues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.chat_room_members (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  role text NOT NULL DEFAULT ''::text,
  room_id uuid NOT NULL,
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_room_members TO authenticated;
GRANT ALL ON public.chat_room_members TO service_role;
ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_room_members_authenticated_all" ON public.chat_room_members;
CREATE POLICY "chat_room_members_authenticated_all" ON public.chat_room_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT ''::text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_rooms TO authenticated;
GRANT ALL ON public.chat_rooms TO service_role;
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_rooms_authenticated_all" ON public.chat_rooms;
CREATE POLICY "chat_rooms_authenticated_all" ON public.chat_rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_chat_rooms ON public.chat_rooms;
CREATE TRIGGER set_updated_at_chat_rooms BEFORE UPDATE ON public.chat_rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.colaboradores_ponto (
  cargo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  empresa text NOT NULL,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  matricula text NOT NULL,
  nome text NOT NULL,
  posto text NOT NULL,
  revisar boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores_ponto TO authenticated;
GRANT ALL ON public.colaboradores_ponto TO service_role;
ALTER TABLE public.colaboradores_ponto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "colaboradores_ponto_authenticated_all" ON public.colaboradores_ponto;
CREATE POLICY "colaboradores_ponto_authenticated_all" ON public.colaboradores_ponto FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_colaboradores_ponto ON public.colaboradores_ponto;
CREATE TRIGGER set_updated_at_colaboradores_ponto BEFORE UPDATE ON public.colaboradores_ponto FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.crt_lancamentos (
  colaborador text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  criado_por text,
  enviado_por_nome text,
  fim text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  inicio text,
  lancado_em text,
  lancado_por text,
  lancado_por_nome text,
  motivo text NOT NULL DEFAULT ''::text,
  person_id uuid,
  posto_id uuid,
  posto_nome text NOT NULL DEFAULT ''::text,
  recebeu_refeicao text NOT NULL DEFAULT ''::text,
  recebeu_vt text NOT NULL DEFAULT ''::text,
  recebido_em text,
  status text NOT NULL DEFAULT ''::text,
  substituto text NOT NULL DEFAULT ''::text,
  substituto_person_id uuid,
  supervisor text NOT NULL DEFAULT ''::text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  valor_receber text NOT NULL DEFAULT ''::text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crt_lancamentos TO authenticated;
GRANT ALL ON public.crt_lancamentos TO service_role;
ALTER TABLE public.crt_lancamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crt_lancamentos_authenticated_all" ON public.crt_lancamentos;
CREATE POLICY "crt_lancamentos_authenticated_all" ON public.crt_lancamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_crt_lancamentos ON public.crt_lancamentos;
CREATE TRIGGER set_updated_at_crt_lancamentos BEFORE UPDATE ON public.crt_lancamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.dados_extraidos_verificacao (
  assinatura_digital_detectada boolean NOT NULL DEFAULT false,
  atestado_id uuid NOT NULL,
  cid text NOT NULL DEFAULT ''::text,
  cid_descricao text NOT NULL DEFAULT ''::text,
  cnpj_estabelecimento text NOT NULL DEFAULT ''::text,
  codigo_validacao text NOT NULL DEFAULT ''::text,
  cpf text NOT NULL DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  crm text NOT NULL DEFAULT ''::text,
  data_emissao text NOT NULL DEFAULT ''::text,
  data_fim_afastamento text NOT NULL DEFAULT ''::text,
  data_inicio_afastamento text NOT NULL DEFAULT ''::text,
  dias_afastamento text NOT NULL DEFAULT ''::text,
  hora_emissao text NOT NULL DEFAULT ''::text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  nome_clinica text NOT NULL DEFAULT ''::text,
  nome_medico text NOT NULL DEFAULT ''::text,
  nome_paciente text NOT NULL DEFAULT ''::text,
  qr_code_conteudo text NOT NULL DEFAULT ''::text,
  qr_code_detectado boolean NOT NULL DEFAULT false,
  uf_crm text NOT NULL DEFAULT ''::text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dados_extraidos_verificacao TO authenticated;
GRANT ALL ON public.dados_extraidos_verificacao TO service_role;
ALTER TABLE public.dados_extraidos_verificacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dados_extraidos_verificacao_authenticated_all" ON public.dados_extraidos_verificacao;
CREATE POLICY "dados_extraidos_verificacao_authenticated_all" ON public.dados_extraidos_verificacao FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.dashboards_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  dashboard text NOT NULL,
  sincronizacao_automatica boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboards_config TO authenticated;
GRANT ALL ON public.dashboards_config TO service_role;
ALTER TABLE public.dashboards_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dashboards_config_authenticated_all" ON public.dashboards_config;
CREATE POLICY "dashboards_config_authenticated_all" ON public.dashboards_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_dashboards_config ON public.dashboards_config;
CREATE TRIGGER set_updated_at_dashboards_config BEFORE UPDATE ON public.dashboards_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.faltas_arquivos (
  caminho text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tamanho numeric NOT NULL DEFAULT 0,
  tipo text NOT NULL DEFAULT ''::text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faltas_arquivos TO authenticated;
GRANT ALL ON public.faltas_arquivos TO service_role;
ALTER TABLE public.faltas_arquivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "faltas_arquivos_authenticated_all" ON public.faltas_arquivos;
CREATE POLICY "faltas_arquivos_authenticated_all" ON public.faltas_arquivos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.faltas_sem_cobertura (
  cargo text,
  cobertura text,
  created_at timestamptz NOT NULL DEFAULT now(),
  data text,
  empresa text,
  horario text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  motivo text,
  nome text,
  posto text,
  user_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faltas_sem_cobertura TO authenticated;
GRANT ALL ON public.faltas_sem_cobertura TO service_role;
ALTER TABLE public.faltas_sem_cobertura ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "faltas_sem_cobertura_authenticated_all" ON public.faltas_sem_cobertura;
CREATE POLICY "faltas_sem_cobertura_authenticated_all" ON public.faltas_sem_cobertura FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.funcionarios_ativos (
  ativo boolean NOT NULL DEFAULT false,
  cargo text NOT NULL DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  empresa text NOT NULL DEFAULT ''::text,
  empresa_normalizada text NOT NULL DEFAULT ''::text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  matricula text NOT NULL DEFAULT ''::text,
  nome text NOT NULL,
  nome_normalizado text NOT NULL DEFAULT ''::text,
  posto text NOT NULL DEFAULT ''::text,
  revisar boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funcionarios_ativos TO authenticated;
GRANT ALL ON public.funcionarios_ativos TO service_role;
ALTER TABLE public.funcionarios_ativos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funcionarios_ativos_authenticated_all" ON public.funcionarios_ativos;
CREATE POLICY "funcionarios_ativos_authenticated_all" ON public.funcionarios_ativos FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_updated_at_funcionarios_ativos ON public.funcionarios_ativos;
CREATE TRIGGER set_updated_at_funcionarios_ativos BEFORE UPDATE ON public.funcionarios_ativos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();