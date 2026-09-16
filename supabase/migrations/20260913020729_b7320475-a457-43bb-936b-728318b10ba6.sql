DROP POLICY IF EXISTS "rastreio read" ON public.rastreamento_localizacoes;
CREATE POLICY "rastreio read" ON public.rastreamento_localizacoes FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'diretor'::public.app_role)
    OR private.has_role(auth.uid(), 'cordenador'::public.app_role)
    OR private.has_role(auth.uid(), 'supervisor'::public.app_role)
  );
DROP POLICY IF EXISTS "solic acesso own read" ON public.solicitacoes_acesso;
CREATE POLICY "solic acesso own read" ON public.solicitacoes_acesso FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "solic acesso admin manage" ON public.solicitacoes_acesso;
CREATE POLICY "solic acesso admin manage" ON public.solicitacoes_acesso FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX IF NOT EXISTS solicitacoes_vagas_created_idx ON public.solicitacoes_vagas (created_at DESC);
DROP POLICY IF EXISTS "vagas own insert" ON public.solicitacoes_vagas;
CREATE POLICY "vagas own insert" ON public.solicitacoes_vagas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "vagas read" ON public.solicitacoes_vagas;
CREATE POLICY "vagas read" ON public.solicitacoes_vagas FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'diretor'::public.app_role)
    OR private.has_role(auth.uid(), 'cordenador'::public.app_role)
  );
DROP POLICY IF EXISTS "vagas decide" ON public.solicitacoes_vagas;
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
CREATE INDEX IF NOT EXISTS monitoring_pings_created_idx ON public.monitoring_pings (created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_errors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_heartbeats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_recovery_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_pings TO authenticated;
DROP POLICY IF EXISTS "monitor_errors admins" ON public.monitor_errors;
CREATE POLICY "monitor_errors admins" ON public.monitor_errors FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "monitor_heartbeats admins" ON public.monitor_heartbeats;
CREATE POLICY "monitor_heartbeats admins" ON public.monitor_heartbeats FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "monitor_recovery_log admins" ON public.monitor_recovery_log;
CREATE POLICY "monitor_recovery_log admins" ON public.monitor_recovery_log FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "monitoring_tokens admins" ON public.monitoring_tokens;
CREATE POLICY "monitoring_tokens admins" ON public.monitoring_tokens FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "monitoring_pings admins" ON public.monitoring_pings;
CREATE POLICY "monitoring_pings admins" ON public.monitoring_pings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "projeto_atualizacoes admins" ON public.projeto_atualizacoes;
CREATE POLICY "projeto_atualizacoes admins" ON public.projeto_atualizacoes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER TABLE public.solicitacoes_vagas ADD COLUMN IF NOT EXISTS decidido_por UUID;
UPDATE public.monitoring_tokens SET prefixo = '' WHERE prefixo IS NULL;
ALTER TABLE public.monitoring_tokens ALTER COLUMN prefixo SET DEFAULT '';
ALTER TABLE public.monitoring_tokens ALTER COLUMN prefixo SET NOT NULL;
UPDATE public.monitoring_pings SET endpoint = '' WHERE endpoint IS NULL;
ALTER TABLE public.monitoring_pings ALTER COLUMN endpoint SET DEFAULT '';
ALTER TABLE public.monitoring_pings ALTER COLUMN endpoint SET NOT NULL;
UPDATE public.monitoring_pings SET status = 0 WHERE status IS NULL;
ALTER TABLE public.monitoring_pings ALTER COLUMN status SET DEFAULT 0;
ALTER TABLE public.monitoring_pings ALTER COLUMN status SET NOT NULL;
CREATE INDEX IF NOT EXISTS lgpd_solicitacoes_created_idx ON public.lgpd_solicitacoes (created_at DESC);
GRANT ALL ON public.lgpd_config, public.lgpd_consents, public.lgpd_solicitacoes, public.lgpd_incidentes, public.lgpd_acessos TO service_role;
DROP POLICY IF EXISTS "lgpd_solicitacoes_read" ON public.lgpd_solicitacoes;
CREATE POLICY "lgpd_solicitacoes_read" ON public.lgpd_solicitacoes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "lgpd_solicitacoes_insert" ON public.lgpd_solicitacoes;
CREATE POLICY "lgpd_solicitacoes_insert" ON public.lgpd_solicitacoes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "lgpd_solicitacoes_admin_update" ON public.lgpd_solicitacoes;
CREATE POLICY "lgpd_solicitacoes_admin_update" ON public.lgpd_solicitacoes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "lgpd_incidentes_admin_read" ON public.lgpd_incidentes;
CREATE POLICY "lgpd_incidentes_admin_read" ON public.lgpd_incidentes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "lgpd_incidentes_admin_insert" ON public.lgpd_incidentes;
CREATE POLICY "lgpd_incidentes_admin_insert" ON public.lgpd_incidentes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "lgpd_incidentes_admin_update" ON public.lgpd_incidentes;
CREATE POLICY "lgpd_incidentes_admin_update" ON public.lgpd_incidentes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.lgpd_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
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
CREATE INDEX IF NOT EXISTS roteiros_visita_campo_user_data_idx ON public.roteiros_visita_campo (user_id, data_visita DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roteiros_visita_campo TO authenticated;
GRANT ALL ON public.roteiros_visita_campo TO service_role;
ALTER TABLE public.roteiros_visita_campo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Supervisores gerenciam seus roteiros" ON public.roteiros_visita_campo;
CREATE POLICY "Supervisores gerenciam seus roteiros"
ON public.roteiros_visita_campo FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins visualizam todos os roteiros" ON public.roteiros_visita_campo;
CREATE POLICY "Admins visualizam todos os roteiros"
ON public.roteiros_visita_campo FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS update_roteiros_visita_campo_updated_at ON public.roteiros_visita_campo;
CREATE TRIGGER update_roteiros_visita_campo_updated_at
BEFORE UPDATE ON public.roteiros_visita_campo
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.crt_lancamentos (
  colaborador text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  criado_por uuid,
  enviado_por_nome text,
  fim text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  inicio text,
  lancado_em text,
  lancado_por uuid,
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
DROP POLICY IF EXISTS "crt_select_auth" ON public.crt_lancamentos;
CREATE POLICY "crt_select_auth" ON public.crt_lancamentos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "crt_insert_auth" ON public.crt_lancamentos;
CREATE POLICY "crt_insert_auth" ON public.crt_lancamentos FOR INSERT TO authenticated WITH CHECK (auth.uid() = criado_por OR criado_por IS NULL);
DROP POLICY IF EXISTS "crt_update_own_or_admin" ON public.crt_lancamentos;
CREATE POLICY "crt_update_own_or_admin" ON public.crt_lancamentos FOR UPDATE TO authenticated USING (auth.uid() = criado_por OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "crt_delete_own_or_admin" ON public.crt_lancamentos;
CREATE POLICY "crt_delete_own_or_admin" ON public.crt_lancamentos FOR DELETE TO authenticated USING (auth.uid() = criado_por OR public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS update_crt_lancamentos_updated_at ON public.crt_lancamentos;
CREATE TRIGGER update_crt_lancamentos_updated_at BEFORE UPDATE ON public.crt_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.assinatura_modelos (
  campos jsonb NOT NULL DEFAULT '[]'::jsonb,
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
DROP POLICY IF EXISTS "modelos_owner" ON public.assinatura_modelos;
CREATE POLICY "modelos_owner" ON public.assinatura_modelos FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS assinatura_modelos_updated_at ON public.assinatura_modelos;
CREATE TRIGGER assinatura_modelos_updated_at BEFORE UPDATE ON public.assinatura_modelos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();