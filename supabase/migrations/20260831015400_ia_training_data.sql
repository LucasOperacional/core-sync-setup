-- Tabela para dados de treinamento da IA Operacional
CREATE TABLE IF NOT EXISTS public.ia_training_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'instruction'
    CHECK (category IN ('instruction', 'qa_example', 'context')),
  title text NOT NULL,
  content text NOT NULL,
  question text,
  answer text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ia_training_data ENABLE ROW LEVEL SECURITY;

-- Admins podem gerenciar
CREATE POLICY "Admin manage ia_training_data"
  ON public.ia_training_data FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

-- Autenticados podem ler (para o chat montar contexto)
CREATE POLICY "Authenticated read ia_training_data"
  ON public.ia_training_data FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Autenticados podem inserir (para o formulário de treinamento)
CREATE POLICY "Authenticated insert ia_training_data"
  ON public.ia_training_data FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Autenticados podem atualizar seus próprios registros
CREATE POLICY "Owner update ia_training_data"
  ON public.ia_training_data FOR UPDATE
  USING (auth.uid() = user_id);

-- Autenticados podem deletar seus próprios registros
CREATE POLICY "Owner delete ia_training_data"
  ON public.ia_training_data FOR DELETE
  USING (auth.uid() = user_id);
