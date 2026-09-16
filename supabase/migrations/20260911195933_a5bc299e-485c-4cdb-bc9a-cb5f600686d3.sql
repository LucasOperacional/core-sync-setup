CREATE TABLE IF NOT EXISTS public.crt_lancamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  colaborador text NOT NULL,
  person_id text,
  posto_nome text NOT NULL DEFAULT '',
  posto_id text,
  motivo text NOT NULL DEFAULT '',
  inicio timestamptz,
  fim timestamptz,
  supervisor text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
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

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_crt_lancamentos_updated_at ON public.crt_lancamentos;
CREATE TRIGGER update_crt_lancamentos_updated_at BEFORE UPDATE ON public.crt_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
