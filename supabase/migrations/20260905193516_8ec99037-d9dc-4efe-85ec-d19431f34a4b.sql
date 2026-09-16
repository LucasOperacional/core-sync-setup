CREATE TABLE public.solicitacoes_vagas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  cargo TEXT NOT NULL,
  posto TEXT,
  localidade TEXT,
  salario TEXT,
  horario TEXT,
  data_inicio TEXT,
  solicitante TEXT,
  tipo TEXT,
  justificativa TEXT,
  atividade TEXT,
  perfil TEXT,
  arquivo TEXT,
  caminho_pdf TEXT,
  email_destino TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  aprovacao_automatica BOOLEAN NOT NULL DEFAULT false,
  motivo_decisao TEXT,
  pendencias TEXT[] NOT NULL DEFAULT '{}',
  decidido_por UUID,
  decidido_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitacoes_vagas TO authenticated;
GRANT ALL ON public.solicitacoes_vagas TO service_role;

ALTER TABLE public.solicitacoes_vagas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados veem solicitacoes de vagas"
ON public.solicitacoes_vagas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios criam suas solicitacoes de vagas"
ON public.solicitacoes_vagas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Aprovadores atualizam solicitacoes de vagas"
ON public.solicitacoes_vagas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admins removem solicitacoes de vagas"
ON public.solicitacoes_vagas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_solicitacoes_vagas_updated_at
BEFORE UPDATE ON public.solicitacoes_vagas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_solicitacoes_vagas_status ON public.solicitacoes_vagas (status, created_at DESC);