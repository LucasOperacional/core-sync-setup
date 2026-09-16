CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.gerentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  cargo text NOT NULL DEFAULT '',
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gerentes TO authenticated;
GRANT ALL ON public.gerentes TO service_role;
ALTER TABLE public.gerentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gerentes readable" ON public.gerentes FOR SELECT TO authenticated USING (true);
CREATE POLICY "gerentes admin write" ON public.gerentes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.visitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gerente_id uuid REFERENCES public.gerentes(id) ON DELETE SET NULL,
  cliente text NOT NULL DEFAULT '',
  local text NOT NULL DEFAULT '',
  posto text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  uf text NOT NULL DEFAULT '',
  responsavel text NOT NULL DEFAULT '',
  cargo text NOT NULL DEFAULT '',
  inicio text,
  fim text,
  duracao_min integer,
  respostas jsonb NOT NULL DEFAULT '[]'::jsonb,
  conformes integer NOT NULL DEFAULT 0,
  nao_conformes integer NOT NULL DEFAULT 0,
  relatos jsonb NOT NULL DEFAULT '[]'::jsonb,
  arquivo text NOT NULL DEFAULT '',
  chave text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitas TO authenticated;
GRANT ALL ON public.visitas TO service_role;
ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visitas readable" ON public.visitas FOR SELECT TO authenticated USING (true);
CREATE POLICY "visitas admin write" ON public.visitas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX visitas_gerente_idx ON public.visitas(gerente_id);