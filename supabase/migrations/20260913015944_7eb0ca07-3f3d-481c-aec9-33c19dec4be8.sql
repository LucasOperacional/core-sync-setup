CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity text NOT NULL,
  resource text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0,
  UNIQUE (identity, resource)
);
GRANT SELECT ON public.security_rate_limits TO authenticated;
GRANT ALL ON public.security_rate_limits TO service_role;
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_rate_limits" ON public.security_rate_limits FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TABLE IF NOT EXISTS public.security_blocklist (
  blocked_until text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  identity text NOT NULL,
  reason text NOT NULL,
  severity text NOT NULL DEFAULT ''::text
);
GRANT SELECT ON public.security_blocklist TO authenticated;
GRANT ALL ON public.security_blocklist TO service_role;
ALTER TABLE public.security_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_blocklist" ON public.security_blocklist FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
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
CREATE INDEX IF NOT EXISTS security_api_events_created_at_idx ON public.security_api_events (created_at DESC);
CREATE INDEX IF NOT EXISTS security_api_events_card_idx ON public.security_api_events (card_key);
GRANT SELECT, INSERT ON public.security_api_events TO authenticated;
GRANT ALL ON public.security_api_events TO service_role;
ALTER TABLE public.security_api_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_insert_own_api_events" ON public.security_api_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "users_read_own_api_events" ON public.security_api_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins_read_api_events" ON public.security_api_events FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.security_check_rate_limit(_identity text, _resource text, _limit numeric, _window_seconds numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.security_rate_limits%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM public.security_rate_limits WHERE identity = _identity AND resource = _resource FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.security_rate_limits (identity, resource, window_start, hits)
    VALUES (_identity, _resource, now(), 1)
    RETURNING * INTO rec;
    RETURN jsonb_build_object('allowed', true, 'remaining', _limit - 1);
  END IF;

  IF rec.window_start < now() - make_interval(secs => _window_seconds) THEN
    UPDATE public.security_rate_limits SET window_start = now(), hits = 1 WHERE id = rec.id;
    RETURN jsonb_build_object('allowed', true, 'remaining', _limit - 1);
  END IF;

  IF rec.hits >= _limit THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0);
  END IF;

  UPDATE public.security_rate_limits SET hits = rec.hits + 1 WHERE id = rec.id;
  RETURN jsonb_build_object('allowed', true, 'remaining', _limit - rec.hits - 1);
END;
$$;
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
CREATE INDEX IF NOT EXISTS nexti_checklist_answers_date_idx ON public.nexti_checklist_answers (answer_date DESC);
CREATE INDEX IF NOT EXISTS nexti_checklist_answers_workplace_idx ON public.nexti_checklist_answers (workplace_id);
CREATE INDEX IF NOT EXISTS nexti_checklist_answers_person_idx ON public.nexti_checklist_answers (person_id);
GRANT SELECT ON public.nexti_checklists TO authenticated;
GRANT ALL ON public.nexti_checklists TO service_role;
GRANT SELECT ON public.nexti_checklist_answers TO authenticated;
GRANT ALL ON public.nexti_checklist_answers TO service_role;
ALTER TABLE public.nexti_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexti_checklist_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados leem checklists" ON public.nexti_checklists
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados leem respostas de checklist" ON public.nexti_checklist_answers
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER nexti_checklists_updated_at BEFORE UPDATE ON public.nexti_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER nexti_checklist_answers_updated_at BEFORE UPDATE ON public.nexti_checklist_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $wrap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='nexti_checklist_answers') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.nexti_checklist_answers; END IF; END $wrap$;
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
GRANT SELECT ON public.lgpd_config TO authenticated;
GRANT ALL ON public.lgpd_config TO service_role;
ALTER TABLE public.lgpd_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lgpd_config_read" ON public.lgpd_config FOR SELECT TO authenticated USING (true);
INSERT INTO public.lgpd_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.lgpd_consents (
  aceito boolean NOT NULL DEFAULT false,
  base_legal text NOT NULL DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalidade text NOT NULL DEFAULT ''::text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  politica_versao text NOT NULL DEFAULT ''::text,
  user_id uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS lgpd_consents_user_idx ON public.lgpd_consents (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.lgpd_consents TO authenticated;
GRANT ALL ON public.lgpd_consents TO service_role;
ALTER TABLE public.lgpd_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lgpd_consents_own_read" ON public.lgpd_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lgpd_consents_own_insert" ON public.lgpd_consents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid
);
CREATE INDEX IF NOT EXISTS lgpd_solicitacoes_status_idx ON public.lgpd_solicitacoes (status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.lgpd_solicitacoes TO authenticated;
GRANT ALL ON public.lgpd_solicitacoes TO service_role;
ALTER TABLE public.lgpd_solicitacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lgpd_solic_read" ON public.lgpd_solicitacoes FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lgpd_solic_insert" ON public.lgpd_solicitacoes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "lgpd_solic_admin_update" ON public.lgpd_solicitacoes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER lgpd_solicitacoes_updated_at BEFORE UPDATE ON public.lgpd_solicitacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
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
  titulo text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.lgpd_incidentes TO authenticated;
GRANT ALL ON public.lgpd_incidentes TO service_role;
ALTER TABLE public.lgpd_incidentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lgpd_incidentes_admin" ON public.lgpd_incidentes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER lgpd_incidentes_updated_at BEFORE UPDATE ON public.lgpd_incidentes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
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
CREATE INDEX IF NOT EXISTS lgpd_acessos_created_idx ON public.lgpd_acessos (created_at DESC);
GRANT SELECT, INSERT ON public.lgpd_acessos TO authenticated;
GRANT ALL ON public.lgpd_acessos TO service_role;
ALTER TABLE public.lgpd_acessos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lgpd_acessos_read" ON public.lgpd_acessos FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lgpd_acessos_insert" ON public.lgpd_acessos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
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
CREATE POLICY "Admins gerenciam tokens de monitoramento"
ON public.monitoring_tokens FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
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
CREATE INDEX IF NOT EXISTS monitoring_pings_created_at_idx ON public.monitoring_pings (created_at DESC);
GRANT SELECT ON public.monitoring_pings TO authenticated;
GRANT ALL ON public.monitoring_pings TO service_role;
ALTER TABLE public.monitoring_pings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins veem pings de monitoramento"
ON public.monitoring_pings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "nexti_checklists_select_roles" ON public.nexti_checklists FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
CREATE POLICY "nexti_checklist_answers_select_roles" ON public.nexti_checklist_answers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
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
CREATE POLICY "Usuario gerencia seu proprio layout" ON public.user_dashboard_layouts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_dashboard_layouts_updated_at BEFORE UPDATE ON public.user_dashboard_layouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
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
  status text NOT NULL DEFAULT 'pendente'::text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS solicitacoes_acesso_user_pendente ON public.solicitacoes_acesso (user_id) WHERE status = 'pendente';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitacoes_acesso TO authenticated;
GRANT ALL ON public.solicitacoes_acesso TO service_role;
ALTER TABLE public.solicitacoes_acesso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuario ve a propria solicitacao" ON public.solicitacoes_acesso
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Usuario cria a propria solicitacao" ON public.solicitacoes_acesso
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admin atualiza solicitacoes" ON public.solicitacoes_acesso
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin remove solicitacoes" ON public.solicitacoes_acesso
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER solicitacoes_acesso_updated_at BEFORE UPDATE ON public.solicitacoes_acesso
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
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
CREATE INDEX IF NOT EXISTS chat_direct_messages_conv_idx ON public.chat_direct_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS chat_direct_conv_status_idx ON public.chat_direct_conversations(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_direct_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_direct_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_direct_transfers TO authenticated;
GRANT ALL ON public.chat_direct_conversations, public.chat_direct_messages, public.chat_direct_transfers TO service_role;
ALTER TABLE public.chat_direct_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_direct_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_direct_conv_auth" ON public.chat_direct_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "chat_direct_msg_auth" ON public.chat_direct_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "chat_direct_transf_auth" ON public.chat_direct_transfers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER chat_direct_conversations_updated_at BEFORE UPDATE ON public.chat_direct_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();