CREATE TABLE IF NOT EXISTS public.lgpd_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  controlador text NOT NULL DEFAULT '',
  controlador_cnpj text NOT NULL DEFAULT '',
  encarregado_nome text NOT NULL DEFAULT '',
  encarregado_email text NOT NULL DEFAULT '',
  encarregado_telefone text NOT NULL DEFAULT '',
  politica_versao text NOT NULL DEFAULT '1.0',
  politica_texto text NOT NULL DEFAULT '',
  prazo_resposta_dias integer NOT NULL DEFAULT 15,
  retencao_atestados_dias integer NOT NULL DEFAULT 1825,
  retencao_folhas_dias integer NOT NULL DEFAULT 1825,
  retencao_chat_dias integer NOT NULL DEFAULT 365,
  retencao_logs_dias integer NOT NULL DEFAULT 180,
  anonimizar_apos_retencao boolean NOT NULL DEFAULT true,
  banner_consentimento_ativo boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.lgpd_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  finalidade text NOT NULL,
  base_legal text NOT NULL DEFAULT 'consentimento',
  politica_versao text NOT NULL DEFAULT '1.0',
  aceito boolean NOT NULL DEFAULT true,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.lgpd_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  titular_nome text NOT NULL DEFAULT '',
  titular_email text NOT NULL DEFAULT '',
  tipo text NOT NULL DEFAULT 'acesso',
  descricao text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'aberta',
  resposta text NOT NULL DEFAULT '',
  prazo_em date NOT NULL DEFAULT (current_date + 15),
  respondido_por uuid,
  respondido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.lgpd_incidentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  severidade text NOT NULL DEFAULT 'media',
  dados_afetados text NOT NULL DEFAULT '',
  titulares_afetados integer NOT NULL DEFAULT 0,
  detectado_em timestamptz NOT NULL DEFAULT now(),
  comunicado_anpd boolean NOT NULL DEFAULT false,
  comunicado_em timestamptz,
  status text NOT NULL DEFAULT 'aberto',
  medidas text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.lgpd_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  recurso text NOT NULL,
  acao text NOT NULL DEFAULT 'leitura',
  titular_ref text NOT NULL DEFAULT '',
  base_legal text NOT NULL DEFAULT 'obrigacao_legal',
  finalidade text NOT NULL DEFAULT '',
  modulo text NOT NULL DEFAULT '',
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.monitoring_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  prefixo text NOT NULL DEFAULT '',
  token_hash text NOT NULL UNIQUE,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  total_requisicoes integer NOT NULL DEFAULT 0,
  revogado_em timestamptz
);
CREATE TABLE IF NOT EXISTS public.monitoring_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES public.monitoring_tokens(id) ON DELETE CASCADE,
  endpoint text NOT NULL DEFAULT '',
  status integer NOT NULL DEFAULT 0,
  duracao_ms integer,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_dashboard_layouts (
  user_id uuid NOT NULL,
  dashboard text NOT NULL,
  layout jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dashboard)
);
CREATE TABLE IF NOT EXISTS public.solicitacoes_acesso (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  nome text NOT NULL DEFAULT '',
  email text NOT NULL,
  role_solicitada text NOT NULL DEFAULT 'diretor',
  departamento text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pendente',
  observacao text NOT NULL DEFAULT '',
  decidido_por uuid,
  decidido_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.chat_direct_conversations (
  id uuid primary key default gen_random_uuid(),
  nexti_person_id bigint not null unique,
  contato_nome text not null,
  contato_matricula text,
  contato_posto text,
  contato_cargo text,
  status text not null default 'aberta' check (status in ('aberta','em_atendimento','finalizada')),
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  ultima_leitura_nexti timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS public.chat_direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_direct_conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  autor text not null default 'agente' check (autor in ('agente','contato','sistema')),
  content text not null,
  nexti_message_id text,
  entregue boolean not null default true,
  erro_envio text,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS public.chat_direct_transfers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_direct_conversations(id) on delete cascade,
  de_user_id uuid,
  para_user_id uuid,
  motivo text,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  wa_chat_id text not null unique,
  telefone text,
  contato_nome text,
  is_group boolean not null default false,
  status text not null default 'aberta' check (status in ('aberta','em_atendimento','finalizada')),
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  nao_lidas integer not null default 0,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  wa_message_id text,
  direcao text not null check (direcao in ('recebida','enviada','sistema')),
  autor_nome text,
  user_id uuid references auth.users(id) on delete set null,
  content text not null default '',
  media_url text,
  media_type text,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS public.whatsapp_transfers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  de_user_id uuid,
  para_user_id uuid,
  motivo text,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS public.projeto_atualizacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_arquivo text NOT NULL,
  versao text,
  observacoes text,
  tamanho_bytes bigint NOT NULL DEFAULT 0,
  total_arquivos integer NOT NULL DEFAULT 0,
  arquivos jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido','em_analise','aplicado','recusado')),
  storage_bucket text NOT NULL DEFAULT 'projeto-atualizacoes',
  storage_path text NOT NULL,
  enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aplicado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.solicitacoes_vagas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  cargo TEXT NOT NULL,
  posto TEXT,
  localidade TEXT,
  salario TEXT,
  horario TEXT,
  data_inicio TEXT,
  solicitante TEXT,
  tipo TEXT,
  justificativa TEXT,
  atividade TEXT,
  perfil TEXT,
  arquivo TEXT,
  caminho_pdf TEXT,
  email_destino TEXT,
  fiscal_responsavel TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  aprovacao_automatica BOOLEAN NOT NULL DEFAULT false,
  motivo_decisao TEXT,
  pendencias TEXT[] NOT NULL DEFAULT '{}',
  decidido_por UUID,
  decidido_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.app_config (
  chave TEXT PRIMARY KEY,
  valor TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.rastreamento_localizacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  nome text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  precisao_metros double precision,
  velocidade double precision,
  direcao double precision,
  tipo_sinal text,
  bateria integer,
  capturado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.faltas_sem_cobertura (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  data DATE,
  posto TEXT NOT NULL DEFAULT '',
  nome TEXT NOT NULL DEFAULT '',
  cargo TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  cobertura TEXT NOT NULL DEFAULT '',
  horario TEXT NOT NULL DEFAULT '',
  empresa TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.monitor_heartbeats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  versao TEXT,
  ambiente TEXT,
  tentativas INTEGER NOT NULL DEFAULT 1,
  ok BOOLEAN NOT NULL DEFAULT false,
  erro TEXT,
  checks JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.monitor_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  rota TEXT,
  status_http INTEGER,
  origem TEXT,
  enviado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.monitor_recovery_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acao TEXT NOT NULL,
  resultado TEXT NOT NULL,
  detalhe TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.monitor_cron (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.roteiros_visita_campo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  data_visita DATE NOT NULL DEFAULT CURRENT_DATE,
  posto TEXT NOT NULL,
  posto_nexti_id bigint,
  posto_external_id TEXT NOT NULL DEFAULT '',
  cliente TEXT NOT NULL DEFAULT '',
  empresa TEXT NOT NULL DEFAULT '',
  funcao TEXT NOT NULL,
  colaborador TEXT NOT NULL DEFAULT '',
  supervisor TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  respostas JSONB NOT NULL DEFAULT '{}'::jsonb,
  observacoes JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_conformes INTEGER NOT NULL DEFAULT 0,
  total_nao_conformes INTEGER NOT NULL DEFAULT 0,
  total_nao_aplicaveis INTEGER NOT NULL DEFAULT 0,
  criticas_abertas INTEGER NOT NULL DEFAULT 0,
  percentual_conformidade INTEGER NOT NULL DEFAULT 0,
  observacao_geral TEXT NOT NULL DEFAULT '',
  plano_acao TEXT NOT NULL DEFAULT '',
  relatorio_pdf_path TEXT,
  relatorio_enviado_em TIMESTAMPTZ,
  enviado_por_nome TEXT,
  duracao_segundos INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.crt_lancamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  colaborador text NOT NULL,
  person_id text,
  posto_nome text NOT NULL DEFAULT '',
  posto_id text,
  motivo text NOT NULL DEFAULT '',
  inicio timestamptz,
  fim timestamptz,
  supervisor text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pendente',
  substituto TEXT NOT NULL DEFAULT '',
  substituto_person_id TEXT,
  recebeu_vt TEXT NOT NULL DEFAULT '',
  recebeu_refeicao TEXT NOT NULL DEFAULT '',
  valor_receber TEXT NOT NULL DEFAULT '',
  recebido_em DATE,
  lancado_por UUID,
  lancado_por_nome TEXT,
  lancado_em TIMESTAMPTZ,
  enviado_por_nome text,
  assinatura_colaborador text,
  assinatura_token text,
  assinatura_token_expira_em timestamptz,
  assinatura_em timestamptz,
  assinatura_nome text,
  assinatura_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.assinatura_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'pdf',
  campos jsonb NOT NULL DEFAULT '[]'::jsonb,
  original_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.assinatura_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  titulo text NOT NULL,
  tipo text NOT NULL DEFAULT 'pdf',
  status text NOT NULL DEFAULT 'rascunho',
  protocolo text NOT NULL UNIQUE,
  original_path text,
  preenchido_path text,
  assinado_path text,
  hash_sha256 text,
  campos jsonb NOT NULL DEFAULT '[]'::jsonb,
  exige_codigo boolean NOT NULL DEFAULT false,
  expira_em timestamptz,
  criado_por_nome text,
  concluido_em timestamptz,
  cancelado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.assinatura_signatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.assinatura_documentos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text,
  telefone text,
  ordem integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'enviado',
  token_hash text NOT NULL,
  codigo_hash text,
  codigo_expira_em timestamptz,
  assinatura_path text,
  visualizado_em timestamptz,
  assinado_em timestamptz,
  recusado_em timestamptz,
  motivo_recusa text,
  ip text,
  dispositivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.assinatura_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.assinatura_documentos(id) ON DELETE CASCADE,
  signatario_id uuid REFERENCES public.assinatura_signatarios(id) ON DELETE SET NULL,
  evento text NOT NULL,
  detalhe text,
  ip text,
  dispositivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.movimentacoes_posto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_por uuid NOT NULL,
  colaborador text NOT NULL,
  person_id text,
  posto_atual text NOT NULL,
  posto_atual_id text,
  novo_posto text NOT NULL,
  novo_posto_id text,
  data_movimentacao date NOT NULL,
  motivo text NOT NULL DEFAULT '',
  criado_por_nome text,
  nexti_transfer_id text,
  nexti_http_status integer,
  enviado_nexti_em timestamptz,
  status text NOT NULL DEFAULT 'pendente',
  protocolo text NOT NULL,
  person_external_id text,
  novo_posto_external_id text,
  cargo text,
  validacao_detalhe text,
  aprovado_por uuid,
  aprovado_por_nome text,
  aprovado_em timestamptz,
  motivo_recusa text,
  assinatura_colaborador text,
  assinatura_token text,
  assinatura_token_expira_em timestamptz,
  assinatura_em timestamptz,
  assinatura_nome text,
  assinatura_ip text,
  assinatura_dispositivo text,
  assinatura_latitude double precision,
  assinatura_longitude double precision,
  assinatura_precisao_metros double precision,
  assinatura_geo_status text,
  assinatura_declaracao boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nxs_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nxs_company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.nxs_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  papel public.nxs_role NOT NULL DEFAULT 'colaborador',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.nxs_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.nxs_companies(id) ON DELETE CASCADE,
  placa text,
  chassi text,
  codigo text,
  tipo text NOT NULL DEFAULT 'carro',
  modelo text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nxs_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.nxs_companies(id) ON DELETE CASCADE,
  user_id uuid,
  nome text NOT NULL,
  cpf text,
  matricula text,
  telefone text,
  email text,
  unidade text,
  departamento text,
  cargo text,
  funcao text NOT NULL DEFAULT 'colaborador',
  supervisor_id uuid REFERENCES public.nxs_employees(id) ON DELETE SET NULL,
  jornada text,
  foto_url text,
  status text NOT NULL DEFAULT 'ativo',
  external_id text,
  vehicle_id uuid REFERENCES public.nxs_vehicles(id) ON DELETE SET NULL,
  rastreamento_permitido boolean NOT NULL DEFAULT false,
  data_admissao date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nxs_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.nxs_companies(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  numero_serie text,
  tipo text NOT NULL DEFAULT 'celular',
  modelo text,
  imei text,
  sim text,
  employee_id uuid REFERENCES public.nxs_employees(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.nxs_vehicles(id) ON DELETE SET NULL,
  bateria integer,
  ultima_comunicacao timestamptz,
  status public.nxs_device_status NOT NULL DEFAULT 'offline',
  firmware text,
  precisao_gps double precision,
  instalado_em date,
  ingest_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, codigo)
);
CREATE TABLE IF NOT EXISTS public.nxs_location_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.nxs_companies(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.nxs_devices(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.nxs_employees(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.nxs_vehicles(id) ON DELETE SET NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  velocidade double precision,
  direcao double precision,
  precisao double precision,
  bateria integer,
  origem text NOT NULL DEFAULT 'app',
  registrado_em timestamptz NOT NULL DEFAULT now(),
  recebido_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nxs_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.nxs_companies(id) ON DELETE CASCADE,
  codigo text NOT NULL DEFAULT ('ALT-' || upper(encode(gen_random_bytes(4),'hex'))),
  tipo text NOT NULL,
  prioridade text NOT NULL DEFAULT 'media',
  employee_id uuid REFERENCES public.nxs_employees(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.nxs_devices(id) ON DELETE SET NULL,
  latitude double precision,
  longitude double precision,
  descricao text,
  status public.nxs_alert_status NOT NULL DEFAULT 'novo',
  responsavel_id uuid,
  prazo_em timestamptz,
  encerrado_em timestamptz,
  motivo_encerramento text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.roteiro_visita_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roteiro_id uuid NOT NULL REFERENCES public.roteiros_visita_campo(id) ON DELETE CASCADE,
  pergunta_id text NOT NULL DEFAULT '',
  pergunta_texto text NOT NULL DEFAULT '',
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  capturada_em timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  precisao_metros double precision,
  geo_status text NOT NULL DEFAULT 'indisponivel',
  observacao text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text,
  user_nome text,
  acao text NOT NULL,
  modulo text NOT NULL DEFAULT 'geral',
  rota text,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.areas_gerentes_postos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gerente_nome TEXT NOT NULL,
  posto_nome TEXT NOT NULL,
  posto_localidade TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.avaliacoes_gerentes_area (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gerente_nome text NOT NULL,
  mes_referencia text NOT NULL,
  nota_lideranca smallint NOT NULL DEFAULT 3,
  nota_operacao smallint NOT NULL DEFAULT 3,
  nota_comunicacao smallint NOT NULL DEFAULT 3,
  nota_prazos smallint NOT NULL DEFAULT 3,
  nota_cliente smallint NOT NULL DEFAULT 3,
  pontos_fortes text,
  pontos_melhoria text,
  observacoes text,
  avaliador_nome text,
  avaliador_id uuid NOT NULL DEFAULT auth.uid(),
  duracao_segundos integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.chegadas_posto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  posto_nexti_id bigint,
  posto_nome text NOT NULL,
  distancia_metros numeric,
  latitude numeric,
  longitude numeric,
  avisado_whatsapp boolean NOT NULL DEFAULT false,
  erro_aviso text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lgpd_consents_user_idx ON public.lgpd_consents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lgpd_solicitacoes_status_idx ON public.lgpd_solicitacoes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS lgpd_acessos_created_idx ON public.lgpd_acessos (created_at DESC);
CREATE INDEX IF NOT EXISTS monitoring_pings_created_at_idx ON public.monitoring_pings (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS solicitacoes_acesso_user_pendente ON public.solicitacoes_acesso (user_id) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS chat_direct_messages_conv_idx ON public.chat_direct_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS chat_direct_conv_status_idx ON public.chat_direct_conversations(status);
CREATE UNIQUE INDEX IF NOT EXISTS chat_direct_messages_nexti_id_uidx ON public.chat_direct_messages (nexti_message_id) WHERE nexti_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wa_id_idx ON public.whatsapp_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_messages_conv_idx ON public.whatsapp_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_conv_status_idx ON public.whatsapp_conversations(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS projeto_atualizacoes_created_idx ON public.projeto_atualizacoes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_vagas_status ON public.solicitacoes_vagas (status, created_at DESC);
CREATE INDEX IF NOT EXISTS solicitacoes_vagas_created_idx ON public.solicitacoes_vagas (created_at DESC);
CREATE INDEX IF NOT EXISTS rastreamento_localizacoes_user_idx ON public.rastreamento_localizacoes (user_id, capturado_em DESC);
CREATE INDEX IF NOT EXISTS rastreamento_localizacoes_capturado_idx ON public.rastreamento_localizacoes (capturado_em DESC);
CREATE INDEX IF NOT EXISTS idx_faltas_sc_created_at ON public.faltas_sem_cobertura (created_at DESC);
CREATE INDEX IF NOT EXISTS monitor_heartbeats_created_idx ON public.monitor_heartbeats (created_at DESC);
CREATE INDEX IF NOT EXISTS monitor_errors_created_idx ON public.monitor_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS lgpd_solicitacoes_created_idx ON public.lgpd_solicitacoes (created_at DESC);
CREATE INDEX IF NOT EXISTS roteiros_visita_campo_user_data_idx ON public.roteiros_visita_campo (user_id, data_visita DESC);
CREATE INDEX IF NOT EXISTS assinatura_documentos_user_idx ON public.assinatura_documentos (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS assinatura_signatarios_token_idx ON public.assinatura_signatarios (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS assinatura_signatarios_doc_idx ON public.assinatura_signatarios (documento_id, ordem);
CREATE INDEX IF NOT EXISTS assinatura_auditoria_doc_idx ON public.assinatura_auditoria (documento_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS movimentacoes_posto_protocolo_key ON public.movimentacoes_posto (protocolo);
CREATE INDEX IF NOT EXISTS movimentacoes_posto_status_idx ON public.movimentacoes_posto (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS movimentacoes_posto_assinatura_token_key ON public.movimentacoes_posto (assinatura_token) WHERE assinatura_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crt_lancamentos_assinatura_token_idx ON public.crt_lancamentos (assinatura_token) WHERE assinatura_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS nxs_employees_company_idx ON public.nxs_employees (company_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS nxs_devices_token_idx ON public.nxs_devices (ingest_token);
CREATE INDEX IF NOT EXISTS nxs_location_company_time_idx ON public.nxs_location_events (company_id, registrado_em DESC);
CREATE INDEX IF NOT EXISTS nxs_location_device_time_idx ON public.nxs_location_events (device_id, registrado_em DESC);
CREATE INDEX IF NOT EXISTS nxs_alerts_company_status_idx ON public.nxs_alerts (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS roteiro_visita_fotos_roteiro_idx ON public.roteiro_visita_fotos(roteiro_id);
CREATE INDEX IF NOT EXISTS user_activity_logs_created_at_idx ON public.user_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_logs_user_idx ON public.user_activity_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_logs_modulo_idx ON public.user_activity_logs (modulo);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_gerentes_area_gerente ON public.avaliacoes_gerentes_area (gerente_nome);
CREATE INDEX IF NOT EXISTS idx_chegadas_posto_user_data ON public.chegadas_posto (user_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'lgpd_config','lgpd_consents','lgpd_solicitacoes','lgpd_incidentes','lgpd_acessos',
    'monitoring_tokens','monitoring_pings','user_dashboard_layouts','solicitacoes_acesso',
    'chat_direct_conversations','chat_direct_messages','chat_direct_transfers',
    'whatsapp_conversations','whatsapp_messages','whatsapp_transfers',
    'projeto_atualizacoes','solicitacoes_vagas','app_config','rastreamento_localizacoes',
    'faltas_sem_cobertura','monitor_heartbeats','monitor_errors','monitor_recovery_log','monitor_cron',
    'roteiros_visita_campo','crt_lancamentos','assinatura_modelos','assinatura_documentos',
    'assinatura_signatarios','assinatura_auditoria','movimentacoes_posto',
    'nxs_companies','nxs_company_members','nxs_vehicles','nxs_employees','nxs_devices',
    'nxs_location_events','nxs_alerts','roteiro_visita_fotos','user_activity_logs',
    'areas_gerentes_postos','avaliacoes_gerentes_area','chegadas_posto'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.nxs_is_admin_geral(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.nxs_company_members m WHERE m.user_id = _user_id AND m.papel = 'admin_geral');
$$;
CREATE OR REPLACE FUNCTION public.nxs_is_member(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.nxs_is_admin_geral(_user_id)
      OR EXISTS (SELECT 1 FROM public.nxs_company_members m WHERE m.company_id = _company_id AND m.user_id = _user_id);
$$;
CREATE OR REPLACE FUNCTION public.nxs_can_manage(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.nxs_is_admin_geral(_user_id)
      OR EXISTS (SELECT 1 FROM public.nxs_company_members m
                  WHERE m.company_id = _company_id AND m.user_id = _user_id
                    AND m.papel IN ('admin_empresa','gestor'));
$$;
CREATE OR REPLACE FUNCTION public.tem_papel_interno(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','diretor','cordenador','gerente','visualizador','supervisor','mesa_operacional')
  )
$$;
CREATE OR REPLACE FUNCTION public.pode_gerir_atendimento(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','diretor','cordenador','mesa_operacional')
  )
$$;
CREATE OR REPLACE FUNCTION public.pode_ver_conversa(_assigned uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.pode_gerir_atendimento(_user_id)
      OR (public.tem_papel_interno(_user_id) AND (_assigned IS NULL OR _assigned = _user_id))
$$;
CREATE OR REPLACE FUNCTION public.pode_autorizar_movimentacao(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _user_id
      AND r.role IN ('admin','diretor','cordenador')
  );
$$;