CREATE TABLE public.nexti_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  external_id text,
  company_name text,
  fantasy_name text,
  company_number text,
  active boolean,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nexti_companies TO authenticated;
GRANT ALL ON public.nexti_companies TO service_role;
ALTER TABLE public.nexti_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nexti_companies_select" ON public.nexti_companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "nexti_companies_admin" ON public.nexti_companies FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_nexti_companies_external ON public.nexti_companies(external_id);
CREATE TRIGGER nexti_companies_updated_at BEFORE UPDATE ON public.nexti_companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.nexti_workplaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  external_id text,
  name text,
  company_id bigint,
  company_name text,
  client_name text,
  city text,
  state text,
  department text,
  cost_center text,
  active boolean,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nexti_workplaces TO authenticated;
GRANT ALL ON public.nexti_workplaces TO service_role;
ALTER TABLE public.nexti_workplaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nexti_workplaces_select" ON public.nexti_workplaces FOR SELECT TO authenticated USING (true);
CREATE POLICY "nexti_workplaces_admin" ON public.nexti_workplaces FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_nexti_workplaces_company ON public.nexti_workplaces(company_id);
CREATE INDEX idx_nexti_workplaces_external ON public.nexti_workplaces(external_id);
CREATE TRIGGER nexti_workplaces_updated_at BEFORE UPDATE ON public.nexti_workplaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.nexti_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  external_id text,
  name text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nexti_areas TO authenticated;
GRANT ALL ON public.nexti_areas TO service_role;
ALTER TABLE public.nexti_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nexti_areas_select" ON public.nexti_areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "nexti_areas_admin" ON public.nexti_areas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER nexti_areas_updated_at BEFORE UPDATE ON public.nexti_areas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.nexti_careers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  external_id text,
  name text,
  career_group_name text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nexti_careers TO authenticated;
GRANT ALL ON public.nexti_careers TO service_role;
ALTER TABLE public.nexti_careers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nexti_careers_select" ON public.nexti_careers FOR SELECT TO authenticated USING (true);
CREATE POLICY "nexti_careers_admin" ON public.nexti_careers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER nexti_careers_updated_at BEFORE UPDATE ON public.nexti_careers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.nexti_persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  external_id text,
  nome text,
  matricula text,
  situacao_id integer,
  situacao text,
  company_id bigint,
  workplace_id bigint,
  career_id bigint,
  workplace_name text,
  career_name text,
  admission_date date,
  demission_date date,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nexti_persons TO authenticated;
GRANT ALL ON public.nexti_persons TO service_role;
ALTER TABLE public.nexti_persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nexti_persons_select" ON public.nexti_persons FOR SELECT TO authenticated USING (true);
CREATE POLICY "nexti_persons_admin" ON public.nexti_persons FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_nexti_persons_company ON public.nexti_persons(company_id);
CREATE INDEX idx_nexti_persons_workplace ON public.nexti_persons(workplace_id);
CREATE INDEX idx_nexti_persons_career ON public.nexti_persons(career_id);
CREATE INDEX idx_nexti_persons_external ON public.nexti_persons(external_id);
CREATE INDEX idx_nexti_persons_situacao ON public.nexti_persons(situacao_id);
CREATE TRIGGER nexti_persons_updated_at BEFORE UPDATE ON public.nexti_persons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.nexti_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  person_id bigint,
  person_external_id text,
  absence_situation_id bigint,
  absence_situation_external_id text,
  start_date_time timestamptz,
  finish_date_time timestamptz,
  note text,
  medical_doctor_name text,
  medical_doctor_crm text,
  cid_code text,
  cid_description text,
  removed boolean NOT NULL DEFAULT false,
  last_update timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nexti_absences TO authenticated;
GRANT ALL ON public.nexti_absences TO service_role;
ALTER TABLE public.nexti_absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nexti_absences_select" ON public.nexti_absences FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente'));
CREATE POLICY "nexti_absences_admin" ON public.nexti_absences FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_nexti_absences_person ON public.nexti_absences(person_id);
CREATE INDEX idx_nexti_absences_start ON public.nexti_absences(start_date_time);
CREATE INDEX idx_nexti_absences_finish ON public.nexti_absences(finish_date_time);
CREATE TRIGGER nexti_absences_updated_at BEFORE UPDATE ON public.nexti_absences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.nexti_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  person_id bigint,
  workplace_id bigint,
  document_type_customer_id bigint,
  document_type_customer_name text,
  issue_date date,
  due_date date,
  note text,
  document_url text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nexti_documents TO authenticated;
GRANT ALL ON public.nexti_documents TO service_role;
ALTER TABLE public.nexti_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nexti_documents_select" ON public.nexti_documents FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente'));
CREATE POLICY "nexti_documents_admin" ON public.nexti_documents FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_nexti_documents_person ON public.nexti_documents(person_id);
CREATE INDEX idx_nexti_documents_type ON public.nexti_documents(document_type_customer_id);
CREATE INDEX idx_nexti_documents_issue ON public.nexti_documents(issue_date);
CREATE TRIGGER nexti_documents_updated_at BEFORE UPDATE ON public.nexti_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.nexti_document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  name text,
  is_atestado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nexti_document_types TO authenticated;
GRANT ALL ON public.nexti_document_types TO service_role;
ALTER TABLE public.nexti_document_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nexti_document_types_select" ON public.nexti_document_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "nexti_document_types_admin" ON public.nexti_document_types FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER nexti_document_types_updated_at BEFORE UPDATE ON public.nexti_document_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.nexti_clockings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  person_id bigint,
  external_person_id text,
  person_name text,
  clocking_date timestamptz,
  reference_date date,
  clocking_type_id integer,
  clocking_type_name text,
  workplace_id bigint,
  external_workplace_id text,
  clocking_collector_name text,
  last_update timestamptz,
  removed boolean NOT NULL DEFAULT false,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nexti_clockings TO authenticated;
GRANT ALL ON public.nexti_clockings TO service_role;
ALTER TABLE public.nexti_clockings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nexti_clockings_select" ON public.nexti_clockings FOR SELECT TO authenticated USING (true);
CREATE POLICY "nexti_clockings_admin" ON public.nexti_clockings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_nexti_clockings_person ON public.nexti_clockings(person_id);
CREATE INDEX idx_nexti_clockings_workplace ON public.nexti_clockings(workplace_id);
CREATE INDEX idx_nexti_clockings_reference ON public.nexti_clockings(reference_date);
CREATE INDEX idx_nexti_clockings_date ON public.nexti_clockings(clocking_date);
CREATE TRIGGER nexti_clockings_updated_at BEFORE UPDATE ON public.nexti_clockings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.nexti_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo text NOT NULL,
  modo text NOT NULL DEFAULT 'completa',
  status text NOT NULL DEFAULT 'executando',
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  importados integer NOT NULL DEFAULT 0,
  atualizados integer NOT NULL DEFAULT 0,
  ignorados integer NOT NULL DEFAULT 0,
  com_erro integer NOT NULL DEFAULT 0,
  paginas integer NOT NULL DEFAULT 0,
  mensagem text,
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nexti_sync_runs TO authenticated;
GRANT ALL ON public.nexti_sync_runs TO service_role;
ALTER TABLE public.nexti_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nexti_sync_runs_select" ON public.nexti_sync_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "nexti_sync_runs_admin" ON public.nexti_sync_runs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_nexti_sync_runs_inicio ON public.nexti_sync_runs(iniciado_em DESC);
CREATE INDEX idx_nexti_sync_runs_modulo ON public.nexti_sync_runs(modulo);
CREATE TRIGGER nexti_sync_runs_updated_at BEFORE UPDATE ON public.nexti_sync_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.nexti_sync_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.nexti_sync_runs(id) ON DELETE CASCADE,
  modulo text NOT NULL,
  etapa text,
  status_http integer,
  mensagem text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nexti_sync_errors TO authenticated;
GRANT ALL ON public.nexti_sync_errors TO service_role;
ALTER TABLE public.nexti_sync_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nexti_sync_errors_select" ON public.nexti_sync_errors FOR SELECT TO authenticated USING (true);
CREATE POLICY "nexti_sync_errors_admin" ON public.nexti_sync_errors FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_nexti_sync_errors_run ON public.nexti_sync_errors(run_id);