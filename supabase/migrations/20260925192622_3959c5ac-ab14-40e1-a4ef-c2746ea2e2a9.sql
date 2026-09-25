CREATE TABLE public.dp_dados_funcionario (
  employee_id uuid PRIMARY KEY REFERENCES public.pnt_employees(id) ON DELETE CASCADE,
  salario numeric(12,2) NOT NULL DEFAULT 0,
  dependentes integer NOT NULL DEFAULT 0,
  vt_optante boolean NOT NULL DEFAULT true,
  vt_tarifa numeric(8,2) NOT NULL DEFAULT 0,
  vt_viagens_dia integer NOT NULL DEFAULT 2,
  va_valor_dia numeric(8,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.dp_ferias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.pnt_employees(id) ON DELETE CASCADE,
  aquisitivo_inicio date NOT NULL,
  aquisitivo_fim date NOT NULL,
  inicio date NOT NULL,
  dias integer NOT NULL DEFAULT 30,
  abono_dias integer NOT NULL DEFAULT 0,
  valores jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'programada',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.dp_folhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia text NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.pnt_employees(id) ON DELETE CASCADE,
  dados jsonb NOT NULL DEFAULT '{}',
  liquido numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'calculada',
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competencia, employee_id)
);
CREATE TABLE public.dp_esocial_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento text NOT NULL,
  competencia text,
  employee_id uuid REFERENCES public.pnt_employees(id) ON DELETE SET NULL,
  xml text NOT NULL,
  status text NOT NULL DEFAULT 'gerado',
  recibo text,
  mensagem text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['dp_dados_funcionario','dp_ferias','dp_folhas','dp_esocial_eventos'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "%1$s_gestao" ON public.%1$I FOR ALL TO authenticated USING (public.pnt_eh_gestor(auth.uid()) OR public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.pnt_eh_gestor(auth.uid()) OR public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;