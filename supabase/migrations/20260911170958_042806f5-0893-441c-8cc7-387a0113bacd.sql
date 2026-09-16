-- 1. app_config
CREATE TABLE IF NOT EXISTS public.app_config (
  chave TEXT PRIMARY KEY,
  valor TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_config admins" ON public.app_config FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. user_dashboard_layouts
CREATE TABLE IF NOT EXISTS public.user_dashboard_layouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  dashboard TEXT NOT NULL,
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, dashboard)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_dashboard_layouts TO authenticated;
GRANT ALL ON public.user_dashboard_layouts TO service_role;
ALTER TABLE public.user_dashboard_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dashboard layouts" ON public.user_dashboard_layouts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. faltas_sem_cobertura
CREATE TABLE IF NOT EXISTS public.faltas_sem_cobertura (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  data DATE,
  posto TEXT,
  nome TEXT,
  cargo TEXT,
  motivo TEXT,
  cobertura TEXT,
  horario TEXT,
  empresa TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS faltas_sem_cobertura_created_idx ON public.faltas_sem_cobertura (created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faltas_sem_cobertura TO authenticated;
GRANT ALL ON public.faltas_sem_cobertura TO service_role;
ALTER TABLE public.faltas_sem_cobertura ENABLE ROW LEVEL SECURITY;
CREATE POLICY "faltas own insert" ON public.faltas_sem_cobertura FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "faltas read" ON public.faltas_sem_cobertura FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'diretor'::public.app_role)
    OR private.has_role(auth.uid(), 'cordenador'::public.app_role)
  );
CREATE POLICY "faltas manage gestores" ON public.faltas_sem_cobertura FOR DELETE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'diretor'::public.app_role)
    OR private.has_role(auth.uid(), 'cordenador'::public.app_role)
  );

-- 4. rastreamento_localizacoes
CREATE TABLE IF NOT EXISTS public.rastreamento_localizacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  precisao_metros NUMERIC,
  velocidade NUMERIC,
  direcao NUMERIC,
  tipo_sinal TEXT,
  bateria NUMERIC,
  capturado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rastreamento_capturado_idx ON public.rastreamento_localizacoes (capturado_em DESC);
CREATE INDEX IF NOT EXISTS rastreamento_user_idx ON public.rastreamento_localizacoes (user_id, capturado_em DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreamento_localizacoes TO authenticated;
GRANT ALL ON public.rastreamento_localizacoes TO service_role;
ALTER TABLE public.rastreamento_localizacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rastreio own insert" ON public.rastreamento_localizacoes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rastreio read" ON public.rastreamento_localizacoes FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'diretor'::public.app_role)
    OR private.has_role(auth.uid(), 'cordenador'::public.app_role)
    OR private.has_role(auth.uid(), 'supervisor'::public.app_role)
  );

-- 5. solicitacoes_acesso
CREATE TABLE IF NOT EXISTS public.solicitacoes_acesso (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT,
  email TEXT,
  role_solicitada TEXT,
  departamento TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  observacao TEXT,
  decidido_por UUID,
  decidido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitacoes_acesso TO authenticated;
GRANT ALL ON public.solicitacoes_acesso TO service_role;
ALTER TABLE public.solicitacoes_acesso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solic acesso own read" ON public.solicitacoes_acesso FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "solic acesso admin manage" ON public.solicitacoes_acesso FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- 6. solicitacoes_vagas
CREATE TABLE IF NOT EXISTS public.solicitacoes_vagas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  cargo TEXT,
  posto TEXT,
  localidade TEXT,
  salario TEXT,
  horario TEXT,
  data_inicio TEXT,
  solicitante TEXT,
  fiscal_responsavel TEXT,
  tipo TEXT,
  justificativa TEXT,
  atividade TEXT,
  perfil TEXT,
  arquivo TEXT,
  caminho_pdf TEXT,
  email_destino TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  aprovacao_automatica BOOLEAN NOT NULL DEFAULT false,
  motivo_decisao TEXT,
  pendencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  decidido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS solicitacoes_vagas_created_idx ON public.solicitacoes_vagas (created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitacoes_vagas TO authenticated;
GRANT ALL ON public.solicitacoes_vagas TO service_role;
ALTER TABLE public.solicitacoes_vagas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vagas own insert" ON public.solicitacoes_vagas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vagas read" ON public.solicitacoes_vagas FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'diretor'::public.app_role)
    OR private.has_role(auth.uid(), 'cordenador'::public.app_role)
  );
CREATE POLICY "vagas decide" ON public.solicitacoes_vagas FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'diretor'::public.app_role)
    OR private.has_role(auth.uid(), 'cordenador'::public.app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'diretor'::public.app_role)
    OR private.has_role(auth.uid(), 'cordenador'::public.app_role)
  );

-- 7. monitoramento
CREATE TABLE IF NOT EXISTS public.monitor_cron (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.monitor_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT,
  mensagem TEXT,
  rota TEXT,
  status_http INTEGER,
  origem TEXT,
  enviado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.monitor_heartbeats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT,
  latency_ms INTEGER,
  versao TEXT,
  ambiente TEXT,
  tentativas INTEGER,
  ok BOOLEAN NOT NULL DEFAULT true,
  erro TEXT,
  checks JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.monitor_recovery_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acao TEXT,
  resultado TEXT,
  detalhe TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.monitoring_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  prefixo TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  total_requisicoes INTEGER NOT NULL DEFAULT 0,
  revogado_em TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.monitoring_pings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id UUID REFERENCES public.monitoring_tokens(id) ON DELETE CASCADE,
  endpoint TEXT,
  status INTEGER,
  duracao_ms INTEGER,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS monitoring_pings_created_idx ON public.monitoring_pings (created_at DESC);
CREATE INDEX IF NOT EXISTS monitor_heartbeats_created_idx ON public.monitor_heartbeats (created_at DESC);
CREATE INDEX IF NOT EXISTS monitor_errors_created_idx ON public.monitor_errors (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_cron TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_errors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_heartbeats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_recovery_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_pings TO authenticated;
GRANT ALL ON public.monitor_cron TO service_role;
GRANT ALL ON public.monitor_errors TO service_role;
GRANT ALL ON public.monitor_heartbeats TO service_role;
GRANT ALL ON public.monitor_recovery_log TO service_role;
GRANT ALL ON public.monitoring_tokens TO service_role;
GRANT ALL ON public.monitoring_pings TO service_role;

ALTER TABLE public.monitor_cron ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_recovery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_pings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monitor_cron admins" ON public.monitor_cron FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "monitor_errors admins" ON public.monitor_errors FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "monitor_heartbeats admins" ON public.monitor_heartbeats FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "monitor_recovery_log admins" ON public.monitor_recovery_log FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "monitoring_tokens admins" ON public.monitoring_tokens FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "monitoring_pings admins" ON public.monitoring_pings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- 8. projeto_atualizacoes
CREATE TABLE IF NOT EXISTS public.projeto_atualizacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_arquivo TEXT NOT NULL,
  versao TEXT,
  observacoes TEXT,
  tamanho_bytes BIGINT NOT NULL DEFAULT 0,
  total_arquivos INTEGER NOT NULL DEFAULT 0,
  arquivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'recebido',
  storage_bucket TEXT NOT NULL DEFAULT 'projeto-atualizacoes',
  storage_path TEXT NOT NULL,
  enviado_por UUID,
  aplicado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projeto_atualizacoes TO authenticated;
GRANT ALL ON public.projeto_atualizacoes TO service_role;
ALTER TABLE public.projeto_atualizacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projeto_atualizacoes admins" ON public.projeto_atualizacoes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));