CREATE TABLE IF NOT EXISTS public.assinatura_documentos (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  titulo text NOT NULL,
  tipo text NOT NULL DEFAULT 'pdf',
  status text NOT NULL DEFAULT 'rascunho',
  protocolo text NOT NULL UNIQUE,
  original_path text,
  preenchido_path text,
  assinado_path text,
  hash_sha256 text,
  campos jsonb NOT NULL DEFAULT '[]'::jsonb,
  exige_codigo boolean NOT NULL DEFAULT false,
  expira_em timestamptz,
  criado_por_nome text,
  concluido_em timestamptz,
  cancelado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.assinatura_signatarios (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.assinatura_documentos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text,
  telefone text,
  ordem integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'enviado',
  token_hash text,
  codigo_hash text,
  codigo_expira_em timestamptz,
  visualizado_em timestamptz,
  assinado_em timestamptz,
  recusado_em timestamptz,
  motivo_recusa text,
  ip text,
  dispositivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.assinatura_auditoria (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.assinatura_documentos(id) ON DELETE CASCADE,
  signatario_id uuid,
  evento text NOT NULL,
  detalhe text,
  ip text,
  dispositivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assinatura_documentos_user_idx ON public.assinatura_documentos (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS assinatura_signatarios_token_idx ON public.assinatura_signatarios (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS assinatura_signatarios_doc_idx ON public.assinatura_signatarios (documento_id, ordem);
CREATE INDEX IF NOT EXISTS assinatura_auditoria_doc_idx ON public.assinatura_auditoria (documento_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinatura_documentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinatura_signatarios TO authenticated;
GRANT SELECT ON public.assinatura_auditoria TO authenticated;
GRANT ALL ON public.assinatura_documentos TO service_role;
GRANT ALL ON public.assinatura_signatarios TO service_role;
GRANT ALL ON public.assinatura_auditoria TO service_role;

ALTER TABLE public.assinatura_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_signatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assinatura_doc_select" ON public.assinatura_documentos;
CREATE POLICY "assinatura_doc_select" ON public.assinatura_documentos FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "assinatura_doc_insert" ON public.assinatura_documentos;
CREATE POLICY "assinatura_doc_insert" ON public.assinatura_documentos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "assinatura_doc_update" ON public.assinatura_documentos;
CREATE POLICY "assinatura_doc_update" ON public.assinatura_documentos FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "assinatura_doc_delete" ON public.assinatura_documentos;
CREATE POLICY "assinatura_doc_delete" ON public.assinatura_documentos FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "assinatura_sig_all" ON public.assinatura_signatarios;
CREATE POLICY "assinatura_sig_all" ON public.assinatura_signatarios FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.assinatura_documentos d
    WHERE d.id = documento_id
      AND (d.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.assinatura_documentos d
    WHERE d.id = documento_id
      AND (d.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
  ));

DROP POLICY IF EXISTS "assinatura_auditoria_select" ON public.assinatura_auditoria;
CREATE POLICY "assinatura_auditoria_select" ON public.assinatura_auditoria FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.assinatura_documentos d
    WHERE d.id = documento_id
      AND (d.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
  ));

CREATE OR REPLACE FUNCTION public.assinatura_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS assinatura_documentos_updated_at ON public.assinatura_documentos;
CREATE TRIGGER assinatura_documentos_updated_at BEFORE UPDATE ON public.assinatura_documentos
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_set_updated_at();
DROP TRIGGER IF EXISTS assinatura_signatarios_updated_at ON public.assinatura_signatarios;
CREATE TRIGGER assinatura_signatarios_updated_at BEFORE UPDATE ON public.assinatura_signatarios
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_set_updated_at();