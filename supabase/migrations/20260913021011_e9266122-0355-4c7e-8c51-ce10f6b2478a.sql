ALTER TABLE public.crt_lancamentos
  ALTER COLUMN person_id TYPE text USING person_id::text,
  ALTER COLUMN posto_id TYPE text USING posto_id::text,
  ALTER COLUMN substituto_person_id TYPE text USING substituto_person_id::text;
ALTER TABLE public.crt_lancamentos
  ADD COLUMN IF NOT EXISTS assinatura_colaborador text,
  ADD COLUMN IF NOT EXISTS assinatura_token text,
  ADD COLUMN IF NOT EXISTS assinatura_token_expira_em timestamptz,
  ADD COLUMN IF NOT EXISTS assinatura_em timestamptz,
  ADD COLUMN IF NOT EXISTS assinatura_nome text,
  ADD COLUMN IF NOT EXISTS assinatura_ip text;
CREATE UNIQUE INDEX IF NOT EXISTS crt_lancamentos_assinatura_token_idx
  ON public.crt_lancamentos (assinatura_token) WHERE assinatura_token IS NOT NULL;
DROP POLICY IF EXISTS crt_select_interno ON public.crt_lancamentos;
DROP POLICY IF EXISTS crt_select_auth ON public.crt_lancamentos;
CREATE POLICY crt_select_interno ON public.crt_lancamentos FOR SELECT TO authenticated
  USING (auth.uid() = criado_por OR public.tem_papel_interno(auth.uid()));

CREATE TABLE IF NOT EXISTS public.movimentacoes_posto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  criado_por uuid NOT NULL,
  criado_por_nome text,
  colaborador text NOT NULL,
  person_id text,
  person_external_id text,
  cargo text,
  posto_atual text NOT NULL,
  posto_atual_id text,
  novo_posto text NOT NULL,
  novo_posto_id text,
  novo_posto_external_id text,
  data_movimentacao date NOT NULL,
  motivo text NOT NULL DEFAULT '',
  validacao_detalhe text,
  aprovado_por uuid,
  aprovado_por_nome text,
  aprovado_em timestamptz,
  motivo_recusa text,
  nexti_transfer_id text,
  nexti_http_status integer,
  enviado_nexti_em timestamptz,
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT movimentacoes_posto_status_check CHECK (status IN ('pendente','aprovada','recusada'))
);
CREATE UNIQUE INDEX IF NOT EXISTS movimentacoes_posto_protocolo_key ON public.movimentacoes_posto (protocolo);
CREATE INDEX IF NOT EXISTS movimentacoes_posto_status_idx ON public.movimentacoes_posto (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS movimentacoes_posto_assinatura_token_key
  ON public.movimentacoes_posto (assinatura_token) WHERE assinatura_token IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimentacoes_posto TO authenticated;
GRANT ALL ON public.movimentacoes_posto TO service_role;
ALTER TABLE public.movimentacoes_posto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mov_select_interno" ON public.movimentacoes_posto;
CREATE POLICY "mov_select_interno" ON public.movimentacoes_posto FOR SELECT TO authenticated
  USING (auth.uid() = criado_por OR public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "mov_insert_own" ON public.movimentacoes_posto;
CREATE POLICY "mov_insert_own" ON public.movimentacoes_posto FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = criado_por);
DROP POLICY IF EXISTS "mov_update_gestor" ON public.movimentacoes_posto;
CREATE POLICY "mov_update_gestor" ON public.movimentacoes_posto FOR UPDATE TO authenticated
  USING (auth.uid() = criado_por OR public.pode_gerir_atendimento(auth.uid()))
  WITH CHECK (auth.uid() = criado_por OR public.pode_gerir_atendimento(auth.uid()));
DROP POLICY IF EXISTS "mov_delete_gestor" ON public.movimentacoes_posto;
CREATE POLICY "mov_delete_gestor" ON public.movimentacoes_posto FOR DELETE TO authenticated
  USING (auth.uid() = criado_por OR private.has_role(auth.uid(), 'admin'::public.app_role));
DROP TRIGGER IF EXISTS set_updated_at_movimentacoes_posto ON public.movimentacoes_posto;
CREATE TRIGGER set_updated_at_movimentacoes_posto BEFORE UPDATE ON public.movimentacoes_posto
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.roteiros_visita_campo
  ADD COLUMN IF NOT EXISTS posto_nexti_id bigint,
  ADD COLUMN IF NOT EXISTS posto_external_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS relatorio_pdf_path text,
  ADD COLUMN IF NOT EXISTS relatorio_enviado_em timestamptz,
  ADD COLUMN IF NOT EXISTS enviado_por_nome text;

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roteiro_visita_fotos TO authenticated;
GRANT ALL ON public.roteiro_visita_fotos TO service_role;
ALTER TABLE public.roteiro_visita_fotos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internos veem fotos das visitas" ON public.roteiro_visita_fotos;
CREATE POLICY "Internos veem fotos das visitas" ON public.roteiro_visita_fotos FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()) OR user_id = auth.uid());
DROP POLICY IF EXISTS "Usuario registra suas fotos" ON public.roteiro_visita_fotos;
CREATE POLICY "Usuario registra suas fotos" ON public.roteiro_visita_fotos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Admin apaga fotos" ON public.roteiro_visita_fotos;
CREATE POLICY "Admin apaga fotos" ON public.roteiro_visita_fotos FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR user_id = auth.uid());
CREATE INDEX IF NOT EXISTS roteiro_visita_fotos_roteiro_idx ON public.roteiro_visita_fotos(roteiro_id);
DROP TRIGGER IF EXISTS set_updated_at_roteiro_visita_fotos ON public.roteiro_visita_fotos;
CREATE TRIGGER set_updated_at_roteiro_visita_fotos BEFORE UPDATE ON public.roteiro_visita_fotos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
GRANT SELECT, INSERT ON public.user_activity_logs TO authenticated;
GRANT ALL ON public.user_activity_logs TO service_role;
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Atividades: registrar as proprias" ON public.user_activity_logs;
CREATE POLICY "Atividades: registrar as proprias" ON public.user_activity_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Atividades: ver as proprias" ON public.user_activity_logs;
CREATE POLICY "Atividades: ver as proprias" ON public.user_activity_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Atividades: gestores veem todas" ON public.user_activity_logs;
CREATE POLICY "Atividades: gestores veem todas" ON public.user_activity_logs FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'cordenador'::public.app_role)
    OR private.has_role(auth.uid(), 'diretor'::public.app_role)
  );
CREATE INDEX IF NOT EXISTS user_activity_logs_created_at_idx ON public.user_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_logs_user_idx ON public.user_activity_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_logs_modulo_idx ON public.user_activity_logs (modulo);

DO $wrap$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='nxs_role') THEN
    CREATE TYPE public.nxs_role AS ENUM ('admin_geral','admin_empresa','gestor','supervisor','colaborador');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='nxs_device_status') THEN
    CREATE TYPE public.nxs_device_status AS ENUM ('online','offline','sem_sinal','manutencao','inativo');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='nxs_alert_status') THEN
    CREATE TYPE public.nxs_alert_status AS ENUM ('novo','reconhecido','em_atendimento','resolvido','falso_positivo','cancelado');
  END IF;
END $wrap$;

CREATE TABLE IF NOT EXISTS public.nxs_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nxs_companies TO authenticated;
GRANT ALL ON public.nxs_companies TO service_role;
ALTER TABLE public.nxs_companies ENABLE ROW LEVEL SECURITY;
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nxs_company_members TO authenticated;
GRANT ALL ON public.nxs_company_members TO service_role;
ALTER TABLE public.nxs_company_members ENABLE ROW LEVEL SECURITY;
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
DROP POLICY IF EXISTS "nxs_companies_select" ON public.nxs_companies;
CREATE POLICY "nxs_companies_select" ON public.nxs_companies FOR SELECT TO authenticated
  USING (public.nxs_is_member(id, auth.uid()));
DROP POLICY IF EXISTS "nxs_companies_insert" ON public.nxs_companies;
CREATE POLICY "nxs_companies_insert" ON public.nxs_companies FOR INSERT TO authenticated
  WITH CHECK (public.nxs_is_admin_geral(auth.uid()));
DROP POLICY IF EXISTS "nxs_companies_update" ON public.nxs_companies;
CREATE POLICY "nxs_companies_update" ON public.nxs_companies FOR UPDATE TO authenticated
  USING (public.nxs_can_manage(id, auth.uid())) WITH CHECK (public.nxs_can_manage(id, auth.uid()));
DROP POLICY IF EXISTS "nxs_companies_delete" ON public.nxs_companies;
CREATE POLICY "nxs_companies_delete" ON public.nxs_companies FOR DELETE TO authenticated
  USING (public.nxs_is_admin_geral(auth.uid()));
DROP POLICY IF EXISTS "nxs_members_select" ON public.nxs_company_members;
CREATE POLICY "nxs_members_select" ON public.nxs_company_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.nxs_is_member(company_id, auth.uid()));
DROP POLICY IF EXISTS "nxs_members_write" ON public.nxs_company_members;
CREATE POLICY "nxs_members_write" ON public.nxs_company_members FOR ALL TO authenticated
  USING (public.nxs_can_manage(company_id, auth.uid())) WITH CHECK (public.nxs_can_manage(company_id, auth.uid()));

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nxs_vehicles TO authenticated;
GRANT ALL ON public.nxs_vehicles TO service_role;
ALTER TABLE public.nxs_vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nxs_vehicles_select" ON public.nxs_vehicles;
CREATE POLICY "nxs_vehicles_select" ON public.nxs_vehicles FOR SELECT TO authenticated USING (public.nxs_is_member(company_id, auth.uid()));
DROP POLICY IF EXISTS "nxs_vehicles_write" ON public.nxs_vehicles;
CREATE POLICY "nxs_vehicles_write" ON public.nxs_vehicles FOR ALL TO authenticated USING (public.nxs_can_manage(company_id, auth.uid())) WITH CHECK (public.nxs_can_manage(company_id, auth.uid()));

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
CREATE INDEX IF NOT EXISTS nxs_employees_company_idx ON public.nxs_employees (company_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nxs_employees TO authenticated;
GRANT ALL ON public.nxs_employees TO service_role;
ALTER TABLE public.nxs_employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nxs_employees_select" ON public.nxs_employees;
CREATE POLICY "nxs_employees_select" ON public.nxs_employees FOR SELECT TO authenticated USING (public.nxs_is_member(company_id, auth.uid()));
DROP POLICY IF EXISTS "nxs_employees_write" ON public.nxs_employees;
CREATE POLICY "nxs_employees_write" ON public.nxs_employees FOR ALL TO authenticated USING (public.nxs_can_manage(company_id, auth.uid())) WITH CHECK (public.nxs_can_manage(company_id, auth.uid()));

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
CREATE UNIQUE INDEX IF NOT EXISTS nxs_devices_token_idx ON public.nxs_devices (ingest_token);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nxs_devices TO authenticated;
GRANT ALL ON public.nxs_devices TO service_role;
ALTER TABLE public.nxs_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nxs_devices_select" ON public.nxs_devices;
CREATE POLICY "nxs_devices_select" ON public.nxs_devices FOR SELECT TO authenticated USING (public.nxs_is_member(company_id, auth.uid()));
DROP POLICY IF EXISTS "nxs_devices_write" ON public.nxs_devices;
CREATE POLICY "nxs_devices_write" ON public.nxs_devices FOR ALL TO authenticated USING (public.nxs_can_manage(company_id, auth.uid())) WITH CHECK (public.nxs_can_manage(company_id, auth.uid()));

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
CREATE INDEX IF NOT EXISTS nxs_location_company_time_idx ON public.nxs_location_events (company_id, registrado_em DESC);
CREATE INDEX IF NOT EXISTS nxs_location_device_time_idx ON public.nxs_location_events (device_id, registrado_em DESC);
GRANT SELECT ON public.nxs_location_events TO authenticated;
GRANT ALL ON public.nxs_location_events TO service_role;
ALTER TABLE public.nxs_location_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nxs_location_select" ON public.nxs_location_events;
CREATE POLICY "nxs_location_select" ON public.nxs_location_events FOR SELECT TO authenticated USING (public.nxs_is_member(company_id, auth.uid()));

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
CREATE INDEX IF NOT EXISTS nxs_alerts_company_status_idx ON public.nxs_alerts (company_id, status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.nxs_alerts TO authenticated;
GRANT ALL ON public.nxs_alerts TO service_role;
ALTER TABLE public.nxs_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nxs_alerts_select" ON public.nxs_alerts;
CREATE POLICY "nxs_alerts_select" ON public.nxs_alerts FOR SELECT TO authenticated USING (public.nxs_is_member(company_id, auth.uid()));
DROP POLICY IF EXISTS "nxs_alerts_insert" ON public.nxs_alerts;
CREATE POLICY "nxs_alerts_insert" ON public.nxs_alerts FOR INSERT TO authenticated WITH CHECK (public.nxs_is_member(company_id, auth.uid()));
DROP POLICY IF EXISTS "nxs_alerts_update" ON public.nxs_alerts;
CREATE POLICY "nxs_alerts_update" ON public.nxs_alerts FOR UPDATE TO authenticated USING (public.nxs_can_manage(company_id, auth.uid())) WITH CHECK (public.nxs_can_manage(company_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.nxs_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.nxs_companies(id) ON DELETE CASCADE,
  user_id uuid,
  acao text NOT NULL,
  entidade text,
  entidade_id uuid,
  detalhes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nxs_audit_logs TO authenticated;
GRANT ALL ON public.nxs_audit_logs TO service_role;
ALTER TABLE public.nxs_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nxs_audit_select" ON public.nxs_audit_logs;
CREATE POLICY "nxs_audit_select" ON public.nxs_audit_logs FOR SELECT TO authenticated USING (company_id IS NOT NULL AND public.nxs_can_manage(company_id, auth.uid()));

DROP TRIGGER IF EXISTS set_updated_at_nxs_companies ON public.nxs_companies;
CREATE TRIGGER set_updated_at_nxs_companies BEFORE UPDATE ON public.nxs_companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_nxs_company_members ON public.nxs_company_members;
CREATE TRIGGER set_updated_at_nxs_company_members BEFORE UPDATE ON public.nxs_company_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_nxs_vehicles ON public.nxs_vehicles;
CREATE TRIGGER set_updated_at_nxs_vehicles BEFORE UPDATE ON public.nxs_vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_nxs_employees ON public.nxs_employees;
CREATE TRIGGER set_updated_at_nxs_employees BEFORE UPDATE ON public.nxs_employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_nxs_devices ON public.nxs_devices;
CREATE TRIGGER set_updated_at_nxs_devices BEFORE UPDATE ON public.nxs_devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_nxs_alerts ON public.nxs_alerts;
CREATE TRIGGER set_updated_at_nxs_alerts BEFORE UPDATE ON public.nxs_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.nxs_location_events REPLICA IDENTITY FULL;
ALTER TABLE public.nxs_alerts REPLICA IDENTITY FULL;
DO $wrap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='nxs_location_events') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.nxs_location_events; END IF; END $wrap$;
DO $wrap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='nxs_alerts') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.nxs_alerts; END IF; END $wrap$;