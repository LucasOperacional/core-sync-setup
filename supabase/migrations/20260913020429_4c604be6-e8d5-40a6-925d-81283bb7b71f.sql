DROP POLICY IF EXISTS rastreamento_insert_supervisor ON public.rastreamento_localizacoes;
CREATE POLICY rastreamento_insert_supervisor ON public.rastreamento_localizacoes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'supervisor'));
CREATE OR REPLACE FUNCTION public.privacidade_registrar_acesso(
  _modulo text,
  _acao text,
  _finalidade text DEFAULT NULL,
  _referencia_interna text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.lgpd_acessos (user_id, modulo, recurso, acao, finalidade, base_legal, titular_ref)
  VALUES (
    auth.uid(),
    left(coalesce(_modulo, 'desconhecido'), 60),
    left(coalesce(_modulo, 'desconhecido'), 60),
    left(coalesce(_acao, 'leitura'), 60),
    left(coalesce(_finalidade, 'execucao_contrato'), 200),
    'obrigacao_legal',
    left(coalesce(_referencia_interna, ''), 64)
  );
EXCEPTION WHEN others THEN
  NULL;
END;
$$;
CREATE OR REPLACE FUNCTION public.privacidade_expurgar_dados()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _retencao_logs integer := 180;
  _retencao_chat integer := 365;
  _apagados jsonb := '{}'::jsonb;
  _n integer;
BEGIN
  SELECT coalesce(retencao_logs_dias, 180), coalesce(retencao_chat_dias, 365)
    INTO _retencao_logs, _retencao_chat
  FROM public.lgpd_config
  LIMIT 1;

  DELETE FROM public.security_api_events
   WHERE created_at < now() - make_interval(days => _retencao_logs);
  GET DIAGNOSTICS _n = ROW_COUNT;
  _apagados := _apagados || jsonb_build_object('security_api_events', _n);

  DELETE FROM public.lgpd_acessos
   WHERE created_at < now() - make_interval(days => _retencao_logs);
  GET DIAGNOSTICS _n = ROW_COUNT;
  _apagados := _apagados || jsonb_build_object('lgpd_acessos', _n);

  DELETE FROM public.rastreamento_localizacoes
   WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS _n = ROW_COUNT;
  _apagados := _apagados || jsonb_build_object('rastreamento_localizacoes', _n);

  RETURN jsonb_build_object('executado_em', now(), 'apagados', _apagados);
END;
$$;
DROP POLICY IF EXISTS "canais_drm_select_interno" ON public.canais_drm;
CREATE POLICY "canais_drm_select_interno" ON public.canais_drm FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "faltas_arquivos_select_interno" ON public.faltas_arquivos;
CREATE POLICY "faltas_arquivos_select_interno" ON public.faltas_arquivos FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "nexti_persons_select" ON public.nexti_persons;
CREATE POLICY "nexti_persons_select" ON public.nexti_persons FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "nexti_workplaces_select" ON public.nexti_workplaces;
CREATE POLICY "nexti_workplaces_select" ON public.nexti_workplaces FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "nexti_absences_select" ON public.nexti_absences;
CREATE POLICY "nexti_absences_select" ON public.nexti_absences FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "nexti_clockings_select" ON public.nexti_clockings;
CREATE POLICY "nexti_clockings_select" ON public.nexti_clockings FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "nexti_sync_runs_select" ON public.nexti_sync_runs;
CREATE POLICY "nexti_sync_runs_select" ON public.nexti_sync_runs FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));
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
DROP POLICY IF EXISTS "faltas own insert" ON public.faltas_sem_cobertura;
CREATE POLICY "faltas own insert" ON public.faltas_sem_cobertura FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "faltas read" ON public.faltas_sem_cobertura;
CREATE POLICY "faltas read" ON public.faltas_sem_cobertura FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'diretor'::public.app_role)
    OR private.has_role(auth.uid(), 'cordenador'::public.app_role)
  );
DROP POLICY IF EXISTS "faltas manage gestores" ON public.faltas_sem_cobertura;
CREATE POLICY "faltas manage gestores" ON public.faltas_sem_cobertura FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'diretor'::public.app_role)
    OR private.has_role(auth.uid(), 'cordenador'::public.app_role)
  );
CREATE INDEX IF NOT EXISTS faltas_sem_cobertura_created_idx ON public.faltas_sem_cobertura (created_at DESC);
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
GRANT SELECT ON public.monitor_heartbeats TO authenticated;
GRANT ALL ON public.monitor_heartbeats TO service_role;
ALTER TABLE public.monitor_heartbeats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins veem heartbeats" ON public.monitor_heartbeats;
CREATE POLICY "admins veem heartbeats" ON public.monitor_heartbeats FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS monitor_heartbeats_created_idx ON public.monitor_heartbeats (created_at DESC);
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
GRANT SELECT ON public.monitor_errors TO authenticated;
GRANT ALL ON public.monitor_errors TO service_role;
ALTER TABLE public.monitor_errors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins veem erros do monitor" ON public.monitor_errors;
CREATE POLICY "admins veem erros do monitor" ON public.monitor_errors FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS monitor_errors_created_idx ON public.monitor_errors (created_at DESC);
CREATE TABLE IF NOT EXISTS public.monitor_recovery_log (
  acao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  detalhe text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  resultado text
);
GRANT SELECT ON public.monitor_recovery_log TO authenticated;
GRANT ALL ON public.monitor_recovery_log TO service_role;
ALTER TABLE public.monitor_recovery_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins veem recuperacao" ON public.monitor_recovery_log;
CREATE POLICY "admins veem recuperacao" ON public.monitor_recovery_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TABLE IF NOT EXISTS public.monitor_cron (
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  token text NOT NULL
);
GRANT ALL ON public.monitor_cron TO service_role;
ALTER TABLE public.monitor_cron ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sem acesso ao token do agendador" ON public.monitor_cron;
CREATE POLICY "sem acesso ao token do agendador" ON public.monitor_cron FOR SELECT TO authenticated USING (false);
INSERT INTO public.monitor_cron (token)
SELECT encode(gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM public.monitor_cron);
DROP POLICY IF EXISTS "own dashboard layouts" ON public.user_dashboard_layouts;
CREATE POLICY "own dashboard layouts" ON public.user_dashboard_layouts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS rastreamento_capturado_idx ON public.rastreamento_localizacoes (capturado_em DESC);
CREATE INDEX IF NOT EXISTS rastreamento_user_idx ON public.rastreamento_localizacoes (user_id, capturado_em DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreamento_localizacoes TO authenticated;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_rooms','chat_room_members','chat_messages','chat_message_reads','chat_queues','chat_queue_agents','chat_queue_conversations','user_profiles',
    'protocolos','protocolo_folhas','funcionarios_ativos','colaboradores_ponto','protocolos_ponto','protocolo_ponto_itens',
    'nexti_persons','nexti_absences','nexti_clockings','nexti_documents','nexti_sync_runs','nexti_workplaces','nexti_checklist_answers',
    'whatsapp_conversations','whatsapp_messages','chat_direct_conversations','chat_direct_messages']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;