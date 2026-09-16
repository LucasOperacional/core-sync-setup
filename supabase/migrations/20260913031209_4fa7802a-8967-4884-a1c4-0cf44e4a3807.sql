CREATE TABLE public.areas_gerentes_postos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gerente_nome TEXT NOT NULL,
  posto_nome TEXT NOT NULL,
  posto_localidade TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.areas_gerentes_postos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.areas_gerentes_postos TO authenticated;
GRANT ALL ON public.areas_gerentes_postos TO service_role;

ALTER TABLE public.areas_gerentes_postos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados visualizam postos de gerentes"
  ON public.areas_gerentes_postos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Administradores gerenciam postos de gerentes"
  ON public.areas_gerentes_postos
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_areas_gerentes_postos_updated_at
  BEFORE UPDATE ON public.areas_gerentes_postos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();