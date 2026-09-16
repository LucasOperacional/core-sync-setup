CREATE TABLE public.solicitacoes_acesso (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  nome text NOT NULL DEFAULT '',
  email text NOT NULL,
  role_solicitada text NOT NULL DEFAULT 'diretor',
  departamento text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pendente',
  observacao text NOT NULL DEFAULT '',
  decidido_por uuid,
  decidido_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX solicitacoes_acesso_user_pendente ON public.solicitacoes_acesso (user_id) WHERE status = 'pendente';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitacoes_acesso TO authenticated;
GRANT ALL ON public.solicitacoes_acesso TO service_role;

ALTER TABLE public.solicitacoes_acesso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve a propria solicitacao" ON public.solicitacoes_acesso
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin atualiza solicitacoes" ON public.solicitacoes_acesso
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin remove solicitacoes" ON public.solicitacoes_acesso
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER solicitacoes_acesso_updated_at BEFORE UPDATE ON public.solicitacoes_acesso
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();