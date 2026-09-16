CREATE TABLE IF NOT EXISTS public.roteiros_visita_campo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  data_visita DATE NOT NULL DEFAULT CURRENT_DATE,
  posto TEXT NOT NULL,
  cliente TEXT NOT NULL DEFAULT '',
  empresa TEXT NOT NULL DEFAULT '',
  funcao TEXT NOT NULL,
  colaborador TEXT NOT NULL DEFAULT '',
  supervisor TEXT NOT NULL DEFAULT '',
  respostas JSONB NOT NULL DEFAULT '{}'::jsonb,
  observacoes JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_conformes INTEGER NOT NULL DEFAULT 0,
  total_nao_conformes INTEGER NOT NULL DEFAULT 0,
  total_nao_aplicaveis INTEGER NOT NULL DEFAULT 0,
  criticas_abertas INTEGER NOT NULL DEFAULT 0,
  percentual_conformidade INTEGER NOT NULL DEFAULT 0,
  observacao_geral TEXT NOT NULL DEFAULT '',
  plano_acao TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roteiros_visita_campo_user_data_idx ON public.roteiros_visita_campo (user_id, data_visita DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roteiros_visita_campo TO authenticated;
GRANT ALL ON public.roteiros_visita_campo TO service_role;

ALTER TABLE public.roteiros_visita_campo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supervisores gerenciam seus roteiros" ON public.roteiros_visita_campo;
CREATE POLICY "Supervisores gerenciam seus roteiros"
ON public.roteiros_visita_campo FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins visualizam todos os roteiros" ON public.roteiros_visita_campo;
CREATE POLICY "Admins visualizam todos os roteiros"
ON public.roteiros_visita_campo FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_roteiros_visita_campo_updated_at ON public.roteiros_visita_campo;
CREATE TRIGGER update_roteiros_visita_campo_updated_at
BEFORE UPDATE ON public.roteiros_visita_campo
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();