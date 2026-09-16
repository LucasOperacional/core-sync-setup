CREATE TABLE public.assinatura_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'pdf',
  campos jsonb NOT NULL DEFAULT '[]'::jsonb,
  original_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinatura_modelos TO authenticated;
GRANT ALL ON public.assinatura_modelos TO service_role;
ALTER TABLE public.assinatura_modelos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modelos_owner" ON public.assinatura_modelos FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER assinatura_modelos_updated_at BEFORE UPDATE ON public.assinatura_modelos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.assinatura_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinatura_documentos TO authenticated;
GRANT ALL ON public.assinatura_documentos TO service_role;
ALTER TABLE public.assinatura_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documentos_owner" ON public.assinatura_documentos FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER assinatura_documentos_updated_at BEFORE UPDATE ON public.assinatura_documentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX assinatura_documentos_user_idx ON public.assinatura_documentos (user_id, created_at DESC);

CREATE TABLE public.assinatura_signatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.assinatura_documentos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text,
  telefone text,
  ordem integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'enviado',
  token_hash text NOT NULL,
  codigo_hash text,
  codigo_expira_em timestamptz,
  assinatura_path text,
  visualizado_em timestamptz,
  assinado_em timestamptz,
  recusado_em timestamptz,
  motivo_recusa text,
  ip text,
  dispositivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinatura_signatarios TO authenticated;
GRANT ALL ON public.assinatura_signatarios TO service_role;
ALTER TABLE public.assinatura_signatarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signatarios_owner" ON public.assinatura_signatarios FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assinatura_documentos d WHERE d.id = documento_id AND (d.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assinatura_documentos d WHERE d.id = documento_id AND (d.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE TRIGGER assinatura_signatarios_updated_at BEFORE UPDATE ON public.assinatura_signatarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE UNIQUE INDEX assinatura_signatarios_token_idx ON public.assinatura_signatarios (token_hash);
CREATE INDEX assinatura_signatarios_doc_idx ON public.assinatura_signatarios (documento_id, ordem);

CREATE TABLE public.assinatura_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.assinatura_documentos(id) ON DELETE CASCADE,
  signatario_id uuid REFERENCES public.assinatura_signatarios(id) ON DELETE SET NULL,
  evento text NOT NULL,
  detalhe text,
  ip text,
  dispositivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.assinatura_auditoria TO authenticated;
GRANT ALL ON public.assinatura_auditoria TO service_role;
ALTER TABLE public.assinatura_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auditoria_owner_select" ON public.assinatura_auditoria FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assinatura_documentos d WHERE d.id = documento_id AND (d.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "auditoria_owner_insert" ON public.assinatura_auditoria FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.assinatura_documentos d WHERE d.id = documento_id AND (d.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE INDEX assinatura_auditoria_doc_idx ON public.assinatura_auditoria (documento_id, created_at DESC);