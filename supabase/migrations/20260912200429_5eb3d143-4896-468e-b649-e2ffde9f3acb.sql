-- ENUMS
CREATE TYPE public.nxs_role AS ENUM ('admin_geral','admin_empresa','supervisor','operador','colaborador','cliente');
CREATE TYPE public.nxs_device_status AS ENUM ('online','offline','manutencao','bloqueado');
CREATE TYPE public.nxs_alert_status AS ENUM ('novo','reconhecido','em_atendimento','resolvido','falso_positivo','cancelado');

-- COMPANIES
CREATE TABLE public.nxs_companies (
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

-- MEMBERS
CREATE TABLE public.nxs_company_members (
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

-- HELPERS
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
                    AND m.papel IN ('admin_empresa','operador'));
$$;

CREATE POLICY "nxs_companies_select" ON public.nxs_companies FOR SELECT TO authenticated
  USING (public.nxs_is_member(id, auth.uid()));
CREATE POLICY "nxs_companies_insert" ON public.nxs_companies FOR INSERT TO authenticated
  WITH CHECK (public.nxs_is_admin_geral(auth.uid()));
CREATE POLICY "nxs_companies_update" ON public.nxs_companies FOR UPDATE TO authenticated
  USING (public.nxs_can_manage(id, auth.uid())) WITH CHECK (public.nxs_can_manage(id, auth.uid()));
CREATE POLICY "nxs_companies_delete" ON public.nxs_companies FOR DELETE TO authenticated
  USING (public.nxs_is_admin_geral(auth.uid()));

CREATE POLICY "nxs_members_select" ON public.nxs_company_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.nxs_is_member(company_id, auth.uid()));
CREATE POLICY "nxs_members_write" ON public.nxs_company_members FOR ALL TO authenticated
  USING (public.nxs_can_manage(company_id, auth.uid())) WITH CHECK (public.nxs_can_manage(company_id, auth.uid()));

-- VEHICLES
CREATE TABLE public.nxs_vehicles (
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
CREATE POLICY "nxs_vehicles_select" ON public.nxs_vehicles FOR SELECT TO authenticated USING (public.nxs_is_member(company_id, auth.uid()));
CREATE POLICY "nxs_vehicles_write" ON public.nxs_vehicles FOR ALL TO authenticated USING (public.nxs_can_manage(company_id, auth.uid())) WITH CHECK (public.nxs_can_manage(company_id, auth.uid()));

-- EMPLOYEES
CREATE TABLE public.nxs_employees (
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
CREATE INDEX nxs_employees_company_idx ON public.nxs_employees (company_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nxs_employees TO authenticated;
GRANT ALL ON public.nxs_employees TO service_role;
ALTER TABLE public.nxs_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nxs_employees_select" ON public.nxs_employees FOR SELECT TO authenticated USING (public.nxs_is_member(company_id, auth.uid()));
CREATE POLICY "nxs_employees_write" ON public.nxs_employees FOR ALL TO authenticated USING (public.nxs_can_manage(company_id, auth.uid())) WITH CHECK (public.nxs_can_manage(company_id, auth.uid()));

-- DEVICES
CREATE TABLE public.nxs_devices (
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
CREATE UNIQUE INDEX nxs_devices_token_idx ON public.nxs_devices (ingest_token);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nxs_devices TO authenticated;
GRANT ALL ON public.nxs_devices TO service_role;
ALTER TABLE public.nxs_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nxs_devices_select" ON public.nxs_devices FOR SELECT TO authenticated USING (public.nxs_is_member(company_id, auth.uid()));
CREATE POLICY "nxs_devices_write" ON public.nxs_devices FOR ALL TO authenticated USING (public.nxs_can_manage(company_id, auth.uid())) WITH CHECK (public.nxs_can_manage(company_id, auth.uid()));

-- LOCATION EVENTS (append-only)
CREATE TABLE public.nxs_location_events (
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
CREATE INDEX nxs_location_company_time_idx ON public.nxs_location_events (company_id, registrado_em DESC);
CREATE INDEX nxs_location_device_time_idx ON public.nxs_location_events (device_id, registrado_em DESC);
GRANT SELECT ON public.nxs_location_events TO authenticated;
GRANT ALL ON public.nxs_location_events TO service_role;
ALTER TABLE public.nxs_location_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nxs_location_select" ON public.nxs_location_events FOR SELECT TO authenticated USING (public.nxs_is_member(company_id, auth.uid()));

-- ALERTS
CREATE TABLE public.nxs_alerts (
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
CREATE INDEX nxs_alerts_company_status_idx ON public.nxs_alerts (company_id, status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.nxs_alerts TO authenticated;
GRANT ALL ON public.nxs_alerts TO service_role;
ALTER TABLE public.nxs_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nxs_alerts_select" ON public.nxs_alerts FOR SELECT TO authenticated USING (public.nxs_is_member(company_id, auth.uid()));
CREATE POLICY "nxs_alerts_insert" ON public.nxs_alerts FOR INSERT TO authenticated WITH CHECK (public.nxs_is_member(company_id, auth.uid()));
CREATE POLICY "nxs_alerts_update" ON public.nxs_alerts FOR UPDATE TO authenticated USING (public.nxs_can_manage(company_id, auth.uid())) WITH CHECK (public.nxs_can_manage(company_id, auth.uid()));

-- AUDIT
CREATE TABLE public.nxs_audit_logs (
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
CREATE POLICY "nxs_audit_select" ON public.nxs_audit_logs FOR SELECT TO authenticated USING (company_id IS NOT NULL AND public.nxs_can_manage(company_id, auth.uid()));

-- updated_at triggers
CREATE TRIGGER set_updated_at_nxs_companies BEFORE UPDATE ON public.nxs_companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_nxs_company_members BEFORE UPDATE ON public.nxs_company_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_nxs_vehicles BEFORE UPDATE ON public.nxs_vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_nxs_employees BEFORE UPDATE ON public.nxs_employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_nxs_devices BEFORE UPDATE ON public.nxs_devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_nxs_alerts BEFORE UPDATE ON public.nxs_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();