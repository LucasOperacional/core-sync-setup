DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['protocolos','protocolo_folhas','funcionarios_ativos','colaboradores_ponto','protocolos_ponto','protocolo_ponto_itens','nexti_persons','nexti_absences','nexti_clockings','nexti_documents','nexti_sync_runs','nexti_workplaces']
  LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.nexti_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  name text,
  checklist_type_id integer,
  status_id integer,
  start_date_time timestamptz,
  finish_date_time timestamptz,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  workplace_ids bigint[] NOT NULL DEFAULT '{}',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nexti_checklist_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  checklist_id bigint,
  checklist_name text,
  checklist_type_id integer,
  person_id bigint,
  supervisor_nome text,
  workplace_id bigint,
  workplace_name text,
  cliente text,
  cidade text,
  uf text,
  answer_date timestamptz,
  reference_date date,
  register_date timestamptz,
  device_code text,
  total_perguntas integer NOT NULL DEFAULT 0,
  conformes integer NOT NULL DEFAULT 0,
  nao_conformes integer NOT NULL DEFAULT 0,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
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

DROP POLICY IF EXISTS "Autenticados leem checklists" ON public.nexti_checklists;
CREATE POLICY "Autenticados leem checklists" ON public.nexti_checklists
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados leem respostas de checklist" ON public.nexti_checklist_answers;
CREATE POLICY "Autenticados leem respostas de checklist" ON public.nexti_checklist_answers
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS nexti_checklists_updated_at ON public.nexti_checklists;
CREATE TRIGGER nexti_checklists_updated_at BEFORE UPDATE ON public.nexti_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS nexti_checklist_answers_updated_at ON public.nexti_checklist_answers;
CREATE TRIGGER nexti_checklist_answers_updated_at BEFORE UPDATE ON public.nexti_checklist_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='nexti_checklist_answers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nexti_checklist_answers;
  END IF;
END $$;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role FROM auth.users u
WHERE u.email IN ('admin@admin','admin@admin.com')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (id, email)
SELECT u.id, u.email FROM auth.users u
WHERE u.email IN ('admin@admin','admin@admin.com')
ON CONFLICT (id) DO NOTHING;