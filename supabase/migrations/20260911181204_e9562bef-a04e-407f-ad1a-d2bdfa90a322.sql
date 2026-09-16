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
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lgpd_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  finalidade text NOT NULL DEFAULT 'uso_da_plataforma',
  base_legal text NOT NULL DEFAULT 'consentimento',
  politica_versao text NOT NULL DEFAULT '1.0',
  aceito boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lgpd_consents_user_idx ON public.lgpd_consents (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.lgpd_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  titular_nome text NOT NULL DEFAULT '',
  titular_email text NOT NULL DEFAULT '',
  tipo text NOT NULL DEFAULT 'acesso',
  descricao text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'aberta',
  resposta text NOT NULL DEFAULT '',
  prazo_em date NOT NULL DEFAULT (now() + interval '15 days')::date,
  respondido_por uuid,
  respondido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lgpd_solicitacoes_created_idx ON public.lgpd_solicitacoes (created_at DESC);

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
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lgpd_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recurso text NOT NULL,
  acao text NOT NULL DEFAULT 'leitura',
  titular_ref text NOT NULL DEFAULT '',
  base_legal text NOT NULL DEFAULT 'obrigacao_legal',
  finalidade text NOT NULL DEFAULT '',
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lgpd_acessos_created_idx ON public.lgpd_acessos (created_at DESC);

GRANT SELECT ON public.lgpd_config TO authenticated;
GRANT SELECT, INSERT ON public.lgpd_consents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lgpd_solicitacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lgpd_incidentes TO authenticated;
GRANT SELECT, INSERT ON public.lgpd_acessos TO authenticated;
GRANT ALL ON public.lgpd_config, public.lgpd_consents, public.lgpd_solicitacoes, public.lgpd_incidentes, public.lgpd_acessos TO service_role;

ALTER TABLE public.lgpd_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_incidentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_acessos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lgpd_config_read" ON public.lgpd_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "lgpd_consents_own_read" ON public.lgpd_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lgpd_consents_own_insert" ON public.lgpd_consents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lgpd_solicitacoes_read" ON public.lgpd_solicitacoes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lgpd_solicitacoes_insert" ON public.lgpd_solicitacoes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "lgpd_solicitacoes_admin_update" ON public.lgpd_solicitacoes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "lgpd_incidentes_admin_read" ON public.lgpd_incidentes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lgpd_incidentes_admin_insert" ON public.lgpd_incidentes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lgpd_incidentes_admin_update" ON public.lgpd_incidentes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "lgpd_acessos_read" ON public.lgpd_acessos FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lgpd_acessos_insert" ON public.lgpd_acessos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

INSERT INTO public.lgpd_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;