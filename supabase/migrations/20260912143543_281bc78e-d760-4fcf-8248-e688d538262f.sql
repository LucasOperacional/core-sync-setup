ALTER TABLE public.movimentacoes_posto
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS protocolo text,
  ADD COLUMN IF NOT EXISTS person_external_id text,
  ADD COLUMN IF NOT EXISTS novo_posto_external_id text,
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS validacao_detalhe text,
  ADD COLUMN IF NOT EXISTS aprovado_por uuid,
  ADD COLUMN IF NOT EXISTS aprovado_por_nome text,
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_recusa text;

UPDATE public.movimentacoes_posto SET status = 'aprovada' WHERE enviado_nexti_em IS NOT NULL AND status = 'pendente';
UPDATE public.movimentacoes_posto
  SET protocolo = 'MOV-' || to_char(created_at, 'YYYYMMDD') || '-' || upper(substr(replace(id::text, '-', ''), 1, 6))
  WHERE protocolo IS NULL;

ALTER TABLE public.movimentacoes_posto ALTER COLUMN protocolo SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS movimentacoes_posto_protocolo_key ON public.movimentacoes_posto (protocolo);
CREATE INDEX IF NOT EXISTS movimentacoes_posto_status_idx ON public.movimentacoes_posto (status, created_at DESC);

ALTER TABLE public.movimentacoes_posto
  ADD CONSTRAINT movimentacoes_posto_status_check CHECK (status IN ('pendente', 'aprovada', 'recusada'));

CREATE OR REPLACE FUNCTION public.pode_autorizar_movimentacao(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'cordenador')
  );
$$;

REVOKE ALL ON FUNCTION public.pode_autorizar_movimentacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_autorizar_movimentacao(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can update their workplace movements" ON public.movimentacoes_posto;
CREATE POLICY "Creators and authorizers can update workplace movements"
  ON public.movimentacoes_posto FOR UPDATE TO authenticated
  USING (auth.uid() = criado_por OR public.pode_autorizar_movimentacao(auth.uid()))
  WITH CHECK (auth.uid() = criado_por OR public.pode_autorizar_movimentacao(auth.uid()));