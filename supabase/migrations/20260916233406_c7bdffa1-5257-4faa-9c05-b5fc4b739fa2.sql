CREATE TABLE public.mesa_postos_servico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  gerente_nome TEXT NOT NULL,
  localidade TEXT,
  cliente TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mesa_postos_servico_unico ON public.mesa_postos_servico (gerente_nome, nome);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesa_postos_servico TO authenticated;
GRANT ALL ON public.mesa_postos_servico TO service_role;
ALTER TABLE public.mesa_postos_servico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mesa_postos_leitura" ON public.mesa_postos_servico FOR SELECT TO authenticated USING (true);
CREATE POLICY "mesa_postos_escrita" ON public.mesa_postos_servico FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.mesa_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  posto_id UUID NOT NULL REFERENCES public.mesa_postos_servico(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  feito BOOLEAN NOT NULL DEFAULT false,
  observacao TEXT,
  registrado_por UUID,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mesa_checkins_posto_data ON public.mesa_checkins (posto_id, data);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesa_checkins TO authenticated;
GRANT ALL ON public.mesa_checkins TO service_role;
ALTER TABLE public.mesa_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mesa_checkins_leitura" ON public.mesa_checkins FOR SELECT TO authenticated USING (true);
CREATE POLICY "mesa_checkins_escrita" ON public.mesa_checkins FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER mesa_postos_servico_updated_at BEFORE UPDATE ON public.mesa_postos_servico FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER mesa_checkins_updated_at BEFORE UPDATE ON public.mesa_checkins FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();