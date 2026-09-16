CREATE TABLE public.colaboradores_ponto (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa text NOT NULL,
  nome text NOT NULL,
  cargo text NOT NULL,
  posto text NOT NULL,
  matricula text NOT NULL,
  revisar boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT colaboradores_ponto_empresa_matricula_key UNIQUE (empresa, matricula)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores_ponto TO authenticated;
GRANT ALL ON public.colaboradores_ponto TO service_role;
ALTER TABLE public.colaboradores_ponto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "colaboradores_ponto_auth_all" ON public.colaboradores_ponto FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_colaboradores_ponto_updated_at BEFORE UPDATE ON public.colaboradores_ponto FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE SEQUENCE public.protocolo_ponto_numero_seq START 1;
GRANT USAGE, SELECT ON SEQUENCE public.protocolo_ponto_numero_seq TO authenticated;
GRANT ALL ON SEQUENCE public.protocolo_ponto_numero_seq TO service_role;

CREATE TABLE public.protocolos_ponto (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_protocolo text NOT NULL UNIQUE DEFAULT ('PROT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.protocolo_ponto_numero_seq')::text, 5, '0')),
  empresa text NOT NULL,
  data_criacao timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Entregue')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolos_ponto TO authenticated;
GRANT ALL ON public.protocolos_ponto TO service_role;
ALTER TABLE public.protocolos_ponto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "protocolos_ponto_auth_all" ON public.protocolos_ponto FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.protocolo_ponto_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  protocolo_id uuid NOT NULL REFERENCES public.protocolos_ponto(id) ON DELETE CASCADE,
  empresa text NOT NULL,
  nome text NOT NULL,
  cargo text NOT NULL,
  posto text NOT NULL,
  matricula text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX protocolo_ponto_itens_protocolo_id_idx ON public.protocolo_ponto_itens(protocolo_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolo_ponto_itens TO authenticated;
GRANT ALL ON public.protocolo_ponto_itens TO service_role;
ALTER TABLE public.protocolo_ponto_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "protocolo_ponto_itens_auth_all" ON public.protocolo_ponto_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);