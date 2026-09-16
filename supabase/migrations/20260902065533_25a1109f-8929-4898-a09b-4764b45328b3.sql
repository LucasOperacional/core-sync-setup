-- ============ LGPD (Lei nº 13.709/2018) ============

-- 1. Configuração geral
CREATE TABLE public.lgpd_config (
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

GRANT SELECT ON public.lgpd_config TO authenticated;
GRANT ALL ON public.lgpd_config TO service_role;
ALTER TABLE public.lgpd_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lgpd_config_read" ON public.lgpd_config FOR SELECT TO authenticated USING (true);

INSERT INTO public.lgpd_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 2. Consentimentos
CREATE TABLE public.lgpd_consents (
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

CREATE INDEX lgpd_consents_user_idx ON public.lgpd_consents (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.lgpd_consents TO authenticated;
GRANT ALL ON public.lgpd_consents TO service_role;
ALTER TABLE public.lgpd_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lgpd_consents_own_read" ON public.lgpd_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lgpd_consents_own_insert" ON public.lgpd_consents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3. Solicitações de titulares
CREATE TABLE public.lgpd_solicitacoes (
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

CREATE INDEX lgpd_solicitacoes_status_idx ON public.lgpd_solicitacoes (status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.lgpd_solicitacoes TO authenticated;
GRANT ALL ON public.lgpd_solicitacoes TO service_role;
ALTER TABLE public.lgpd_solicitacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lgpd_solic_read" ON public.lgpd_solicitacoes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lgpd_solic_insert" ON public.lgpd_solicitacoes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "lgpd_solic_admin_update" ON public.lgpd_solicitacoes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER lgpd_solicitacoes_updated_at BEFORE UPDATE ON public.lgpd_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Incidentes com dados pessoais
CREATE TABLE public.lgpd_incidentes (
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

GRANT SELECT, INSERT, UPDATE ON public.lgpd_incidentes TO authenticated;
GRANT ALL ON public.lgpd_incidentes TO service_role;
ALTER TABLE public.lgpd_incidentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lgpd_incidentes_admin" ON public.lgpd_incidentes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER lgpd_incidentes_updated_at BEFORE UPDATE ON public.lgpd_incidentes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Registro de acessos a dados pessoais
CREATE TABLE public.lgpd_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  recurso text NOT NULL,
  acao text NOT NULL DEFAULT 'leitura',
  titular_ref text NOT NULL DEFAULT '',
  base_legal text NOT NULL DEFAULT 'obrigacao_legal',
  finalidade text NOT NULL DEFAULT '',
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lgpd_acessos_created_idx ON public.lgpd_acessos (created_at DESC);
GRANT SELECT, INSERT ON public.lgpd_acessos TO authenticated;
GRANT ALL ON public.lgpd_acessos TO service_role;
ALTER TABLE public.lgpd_acessos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lgpd_acessos_read" ON public.lgpd_acessos FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lgpd_acessos_insert" ON public.lgpd_acessos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());