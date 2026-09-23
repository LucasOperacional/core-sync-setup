-- ============ ENUMS ============
DO $$ BEGIN CREATE TYPE public.pnt_papel AS ENUM ('funcionario','supervisor','rh','admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pnt_tipo_marcacao AS ENUM ('entrada','intervalo_inicio','intervalo_fim','saida','saida_extraordinaria'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pnt_status_marcacao AS ENUM ('valido','fora_area','pendente','corrigido','rejeitado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pnt_status_solicitacao AS ENUM ('pendente','aprovada','rejeitada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ ORGANIZACAO ============
CREATE TABLE public.pnt_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  fuso text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_organizations TO authenticated;
GRANT ALL ON public.pnt_organizations TO service_role;
ALTER TABLE public.pnt_organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pnt_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  papel public.pnt_papel NOT NULL DEFAULT 'funcionario',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_members TO authenticated;
GRANT ALL ON public.pnt_members TO service_role;
ALTER TABLE public.pnt_members ENABLE ROW LEVEL SECURITY;

-- ============ FUNCOES DE APOIO ============
CREATE OR REPLACE FUNCTION public.pnt_papel_do_usuario(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'admin'::public.app_role) THEN 'admin'
    ELSE COALESCE((SELECT m.papel::text FROM public.pnt_members m WHERE m.user_id = _user_id LIMIT 1), 'funcionario')
  END
$$;

CREATE OR REPLACE FUNCTION public.pnt_eh_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.pnt_papel_do_usuario(_user_id) = 'admin'
$$;

CREATE OR REPLACE FUNCTION public.pnt_eh_gestor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.pnt_papel_do_usuario(_user_id) IN ('rh','admin')
$$;

-- ============ EMPRESAS / UNIDADES ============
CREATE TABLE public.pnt_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cnpj text,
  tolerancia_min integer NOT NULL DEFAULT 5,
  exige_geolocalizacao boolean NOT NULL DEFAULT false,
  exige_selfie boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_companies TO authenticated;
GRANT ALL ON public.pnt_companies TO service_role;
ALTER TABLE public.pnt_companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pnt_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.pnt_companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  endereco text,
  latitude double precision,
  longitude double precision,
  raio_metros integer NOT NULL DEFAULT 200,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_units TO authenticated;
GRANT ALL ON public.pnt_units TO service_role;
ALTER TABLE public.pnt_units ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pnt_geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.pnt_units(id) ON DELETE CASCADE,
  nome text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  raio_metros integer NOT NULL DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_geofences TO authenticated;
GRANT ALL ON public.pnt_geofences TO service_role;
ALTER TABLE public.pnt_geofences ENABLE ROW LEVEL SECURITY;

-- ============ FUNCIONARIOS ============
CREATE TABLE public.pnt_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.pnt_companies(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.pnt_units(id) ON DELETE SET NULL,
  user_id uuid,
  nome text NOT NULL,
  matricula text,
  cpf text,
  cargo text,
  supervisor_user_id uuid,
  admissao date,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pnt_employees_user_idx ON public.pnt_employees(user_id);
CREATE INDEX pnt_employees_sup_idx ON public.pnt_employees(supervisor_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_employees TO authenticated;
GRANT ALL ON public.pnt_employees TO service_role;
ALTER TABLE public.pnt_employees ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pnt_meu_funcionario(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id FROM public.pnt_employees e WHERE e.user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.pnt_pode_ver_funcionario(_employee_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.pnt_eh_gestor(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.pnt_employees e
        WHERE e.id = _employee_id
          AND (e.user_id = _user_id OR e.supervisor_user_id = _user_id)
      )
$$;

CREATE TABLE public.pnt_employment_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.pnt_employees(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'clt',
  inicio date NOT NULL,
  fim date,
  carga_semanal_min integer NOT NULL DEFAULT 2640,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_employment_contracts TO authenticated;
GRANT ALL ON public.pnt_employment_contracts TO service_role;
ALTER TABLE public.pnt_employment_contracts ENABLE ROW LEVEL SECURITY;

-- ============ ESCALAS ============
CREATE TABLE public.pnt_work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT '5x2',
  entrada time,
  saida time,
  intervalo_minutos integer NOT NULL DEFAULT 60,
  carga_diaria_min integer NOT NULL DEFAULT 480,
  carga_semanal_min integer NOT NULL DEFAULT 2640,
  tolerancia_min integer NOT NULL DEFAULT 5,
  limite_extra_diario_min integer NOT NULL DEFAULT 120,
  noturno boolean NOT NULL DEFAULT false,
  banco_horas boolean NOT NULL DEFAULT false,
  dias_semana integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  regras jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_work_schedules TO authenticated;
GRANT ALL ON public.pnt_work_schedules TO service_role;
ALTER TABLE public.pnt_work_schedules ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pnt_schedule_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.pnt_employees(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.pnt_work_schedules(id) ON DELETE CASCADE,
  inicio date NOT NULL DEFAULT CURRENT_DATE,
  fim date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pnt_sched_assign_emp_idx ON public.pnt_schedule_assignments(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_schedule_assignments TO authenticated;
GRANT ALL ON public.pnt_schedule_assignments TO service_role;
ALTER TABLE public.pnt_schedule_assignments ENABLE ROW LEVEL SECURITY;

-- ============ MARCACOES ============
CREATE TABLE public.pnt_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.pnt_employees(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.pnt_companies(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.pnt_units(id) ON DELETE SET NULL,
  tipo public.pnt_tipo_marcacao NOT NULL,
  registrado_em timestamptz NOT NULL DEFAULT now(),
  dispositivo_em timestamptz,
  data_ref date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  latitude double precision,
  longitude double precision,
  precisao_m double precision,
  endereco text,
  ip text,
  user_agent text,
  origem text NOT NULL DEFAULT 'online',
  status public.pnt_status_marcacao NOT NULL DEFAULT 'valido',
  distancia_m double precision,
  selfie_path text,
  comprovante text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  observacao text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pnt_entries_emp_data_idx ON public.pnt_time_entries(employee_id, data_ref);
CREATE INDEX pnt_entries_registrado_idx ON public.pnt_time_entries(registrado_em);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_time_entries TO authenticated;
GRANT ALL ON public.pnt_time_entries TO service_role;
ALTER TABLE public.pnt_time_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pnt_time_adjustment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.pnt_employees(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES public.pnt_time_entries(id) ON DELETE SET NULL,
  data_ref date NOT NULL,
  tipo public.pnt_tipo_marcacao NOT NULL,
  horario_correto timestamptz NOT NULL,
  motivo text NOT NULL,
  anexo_path text,
  status public.pnt_status_solicitacao NOT NULL DEFAULT 'pendente',
  decidido_por uuid,
  decidido_em timestamptz,
  justificativa_decisao text,
  solicitado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_time_adjustment_requests TO authenticated;
GRANT ALL ON public.pnt_time_adjustment_requests TO service_role;
ALTER TABLE public.pnt_time_adjustment_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pnt_time_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.pnt_time_adjustment_requests(id) ON DELETE SET NULL,
  entry_id uuid REFERENCES public.pnt_time_entries(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES public.pnt_employees(id) ON DELETE CASCADE,
  valor_anterior jsonb,
  valor_novo jsonb,
  aplicado_por uuid,
  aplicado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_time_adjustments TO authenticated;
GRANT ALL ON public.pnt_time_adjustments TO service_role;
ALTER TABLE public.pnt_time_adjustments ENABLE ROW LEVEL SECURITY;

-- ============ FALTAS / FERIADOS ============
CREATE TABLE public.pnt_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.pnt_employees(id) ON DELETE CASCADE,
  data date NOT NULL,
  tipo text NOT NULL DEFAULT 'falta',
  justificada boolean NOT NULL DEFAULT false,
  motivo text,
  anexo_path text,
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pnt_absences_emp_idx ON public.pnt_absences(employee_id, data);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_absences TO authenticated;
GRANT ALL ON public.pnt_absences TO service_role;
ALTER TABLE public.pnt_absences ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pnt_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  data date NOT NULL,
  nome text NOT NULL,
  abrangencia text NOT NULL DEFAULT 'nacional',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, data, nome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_holidays TO authenticated;
GRANT ALL ON public.pnt_holidays TO service_role;
ALTER TABLE public.pnt_holidays ENABLE ROW LEVEL SECURITY;

-- ============ DISPOSITIVOS / BANCO DE HORAS / RESUMOS ============
CREATE TABLE public.pnt_authorized_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.pnt_employees(id) ON DELETE CASCADE,
  device_hash text NOT NULL,
  descricao text,
  autorizado boolean NOT NULL DEFAULT true,
  ultimo_uso timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, device_hash)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_authorized_devices TO authenticated;
GRANT ALL ON public.pnt_authorized_devices TO service_role;
ALTER TABLE public.pnt_authorized_devices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pnt_hour_bank_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.pnt_employees(id) ON DELETE CASCADE,
  data date NOT NULL,
  minutos integer NOT NULL,
  origem text NOT NULL DEFAULT 'calculo',
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, data, origem)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_hour_bank_entries TO authenticated;
GRANT ALL ON public.pnt_hour_bank_entries TO service_role;
ALTER TABLE public.pnt_hour_bank_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pnt_daily_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.pnt_employees(id) ON DELETE CASCADE,
  data date NOT NULL,
  previsto_min integer NOT NULL DEFAULT 0,
  trabalhado_min integer NOT NULL DEFAULT 0,
  intervalo_min integer NOT NULL DEFAULT 0,
  extra_min integer NOT NULL DEFAULT 0,
  atraso_min integer NOT NULL DEFAULT 0,
  saida_antecipada_min integer NOT NULL DEFAULT 0,
  noturno_min integer NOT NULL DEFAULT 0,
  saldo_min integer NOT NULL DEFAULT 0,
  situacao text NOT NULL DEFAULT 'ok',
  regra jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, data)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_daily_summaries TO authenticated;
GRANT ALL ON public.pnt_daily_summaries TO service_role;
ALTER TABLE public.pnt_daily_summaries ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pnt_payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.pnt_companies(id) ON DELETE SET NULL,
  inicio date NOT NULL,
  fim date NOT NULL,
  status text NOT NULL DEFAULT 'aberto',
  fechado_por uuid,
  fechado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_payroll_periods TO authenticated;
GRANT ALL ON public.pnt_payroll_periods TO service_role;
ALTER TABLE public.pnt_payroll_periods ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pnt_approval_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  referencia text NOT NULL,
  referencia_id uuid,
  acao text NOT NULL,
  responsavel uuid,
  justificativa text,
  valor_anterior jsonb,
  valor_novo jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_approval_history TO authenticated;
GRANT ALL ON public.pnt_approval_history TO service_role;
ALTER TABLE public.pnt_approval_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pnt_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  user_id uuid,
  acao text NOT NULL,
  recurso text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pnt_audit_created_idx ON public.pnt_audit_logs(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_audit_logs TO authenticated;
GRANT ALL ON public.pnt_audit_logs TO service_role;
ALTER TABLE public.pnt_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pnt_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.pnt_organizations(id) ON DELETE CASCADE,
  tolerancia_min integer NOT NULL DEFAULT 5,
  raio_padrao_m integer NOT NULL DEFAULT 200,
  exige_geolocalizacao boolean NOT NULL DEFAULT false,
  exige_selfie boolean NOT NULL DEFAULT false,
  limite_extra_diario_min integer NOT NULL DEFAULT 120,
  banco_horas boolean NOT NULL DEFAULT true,
  retencao_dias integer NOT NULL DEFAULT 1825,
  integracoes jsonb NOT NULL DEFAULT '{"nexti":false,"folha":false,"push":false,"email":false,"whatsapp":false,"assinatura":false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnt_settings TO authenticated;
GRANT ALL ON public.pnt_settings TO service_role;
ALTER TABLE public.pnt_settings ENABLE ROW LEVEL SECURITY;

-- ============ TRIGGERS updated_at ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pnt_organizations','pnt_members','pnt_companies','pnt_units','pnt_geofences','pnt_employees','pnt_employment_contracts','pnt_work_schedules','pnt_schedule_assignments','pnt_time_entries','pnt_time_adjustment_requests','pnt_time_adjustments','pnt_absences','pnt_holidays','pnt_authorized_devices','pnt_hour_bank_entries','pnt_daily_summaries','pnt_payroll_periods','pnt_approval_history','pnt_audit_logs','pnt_settings']
  LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at_%1$s BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

-- ============ POLICIES ============
-- Configuracao: todos autenticados leem, gestores administram
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pnt_organizations','pnt_companies','pnt_units','pnt_geofences','pnt_work_schedules','pnt_holidays','pnt_settings']
  LOOP
    EXECUTE format('CREATE POLICY "%1$s_leitura" ON public.%1$s FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "%1$s_gestao" ON public.%1$s FOR ALL TO authenticated USING (public.pnt_eh_gestor(auth.uid())) WITH CHECK (public.pnt_eh_gestor(auth.uid()))', t);
  END LOOP;
END $$;

CREATE POLICY "pnt_members_leitura" ON public.pnt_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.pnt_eh_gestor(auth.uid()));
CREATE POLICY "pnt_members_gestao" ON public.pnt_members FOR ALL TO authenticated
  USING (public.pnt_eh_admin(auth.uid())) WITH CHECK (public.pnt_eh_admin(auth.uid()));

CREATE POLICY "pnt_employees_leitura" ON public.pnt_employees FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR supervisor_user_id = auth.uid() OR public.pnt_eh_gestor(auth.uid()));
CREATE POLICY "pnt_employees_gestao" ON public.pnt_employees FOR ALL TO authenticated
  USING (public.pnt_eh_gestor(auth.uid())) WITH CHECK (public.pnt_eh_gestor(auth.uid()));

-- Tabelas ligadas ao funcionario
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pnt_employment_contracts','pnt_schedule_assignments','pnt_absences','pnt_hour_bank_entries','pnt_daily_summaries','pnt_authorized_devices','pnt_time_adjustments']
  LOOP
    EXECUTE format('CREATE POLICY "%1$s_leitura" ON public.%1$s FOR SELECT TO authenticated USING (public.pnt_pode_ver_funcionario(employee_id, auth.uid()))', t);
    EXECUTE format('CREATE POLICY "%1$s_gestao" ON public.%1$s FOR ALL TO authenticated USING (public.pnt_eh_gestor(auth.uid())) WITH CHECK (public.pnt_eh_gestor(auth.uid()))', t);
  END LOOP;
END $$;

CREATE POLICY "pnt_time_entries_leitura" ON public.pnt_time_entries FOR SELECT TO authenticated
  USING (public.pnt_pode_ver_funcionario(employee_id, auth.uid()));
CREATE POLICY "pnt_time_entries_registro" ON public.pnt_time_entries FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.pnt_meu_funcionario(auth.uid()) OR public.pnt_eh_gestor(auth.uid()));
CREATE POLICY "pnt_time_entries_gestao" ON public.pnt_time_entries FOR UPDATE TO authenticated
  USING (public.pnt_eh_gestor(auth.uid())) WITH CHECK (public.pnt_eh_gestor(auth.uid()));
CREATE POLICY "pnt_time_entries_exclusao" ON public.pnt_time_entries FOR DELETE TO authenticated
  USING (public.pnt_eh_admin(auth.uid()));

CREATE POLICY "pnt_ajustes_leitura" ON public.pnt_time_adjustment_requests FOR SELECT TO authenticated
  USING (public.pnt_pode_ver_funcionario(employee_id, auth.uid()));
CREATE POLICY "pnt_ajustes_criar" ON public.pnt_time_adjustment_requests FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.pnt_meu_funcionario(auth.uid()) OR public.pnt_eh_gestor(auth.uid()));
CREATE POLICY "pnt_ajustes_decidir" ON public.pnt_time_adjustment_requests FOR UPDATE TO authenticated
  USING (public.pnt_pode_ver_funcionario(employee_id, auth.uid()) AND (public.pnt_eh_gestor(auth.uid()) OR EXISTS (SELECT 1 FROM public.pnt_employees e WHERE e.id = employee_id AND e.supervisor_user_id = auth.uid())))
  WITH CHECK (true);

CREATE POLICY "pnt_periodos_leitura" ON public.pnt_payroll_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "pnt_periodos_gestao" ON public.pnt_payroll_periods FOR ALL TO authenticated
  USING (public.pnt_eh_gestor(auth.uid())) WITH CHECK (public.pnt_eh_gestor(auth.uid()));

CREATE POLICY "pnt_aprovacoes_leitura" ON public.pnt_approval_history FOR SELECT TO authenticated
  USING (public.pnt_eh_gestor(auth.uid()) OR responsavel = auth.uid());
CREATE POLICY "pnt_aprovacoes_registro" ON public.pnt_approval_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "pnt_auditoria_leitura" ON public.pnt_audit_logs FOR SELECT TO authenticated
  USING (public.pnt_eh_gestor(auth.uid()));
CREATE POLICY "pnt_auditoria_registro" ON public.pnt_audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
