DROP POLICY IF EXISTS rastreamento_insert_own ON public.rastreamento_localizacoes;
CREATE POLICY rastreamento_insert_supervisor ON public.rastreamento_localizacoes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'supervisor'));