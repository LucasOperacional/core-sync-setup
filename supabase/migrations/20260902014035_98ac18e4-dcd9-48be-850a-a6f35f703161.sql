DROP POLICY IF EXISTS folhas_pdf_select ON storage.objects;
DROP POLICY IF EXISTS folhas_pdf_insert ON storage.objects;
DROP POLICY IF EXISTS folhas_pdf_update ON storage.objects;
DROP POLICY IF EXISTS folhas_pdf_delete ON storage.objects;
DROP FUNCTION IF EXISTS public.owns_protocolo_path(text);

CREATE POLICY folhas_pdf_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
);

CREATE POLICY folhas_pdf_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
);

CREATE POLICY folhas_pdf_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
)
WITH CHECK (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
);

CREATE POLICY folhas_pdf_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
);

DROP INDEX IF EXISTS public.funcionarios_ativos_empresa_matricula_key;

CREATE UNIQUE INDEX funcionarios_ativos_empresa_matricula_key
  ON public.funcionarios_ativos (empresa, matricula)
  WHERE matricula <> '' AND matricula <> 'Não identificado';

CREATE TABLE public.arquivos_importados (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_original text NOT NULL,
  formato text NOT NULL DEFAULT 'outro',
  tamanho bigint NOT NULL DEFAULT 0,
  storage_bucket text NOT NULL DEFAULT 'arquivos-dashboards',
  storage_path text NOT NULL,
  dashboard text NOT NULL,
  registros integer NOT NULL DEFAULT 0,
  importado_em timestamp with time zone NOT NULL DEFAULT now(),
  usuario_id uuid,
  usuario_nome text NOT NULL DEFAULT '',
  status_processamento text NOT NULL DEFAULT 'aguardando',
  status_sincronizacao text NOT NULL DEFAULT 'aguardando',
  ultima_sincronizacao timestamp with time zone,
  hash_arquivo text NOT NULL,
  mensagem_erro text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT arquivos_importados_dashboard_check CHECK (dashboard IN ('CONTROL','FALTAS','ATESTADOS')),
  CONSTRAINT arquivos_importados_status_proc_check CHECK (status_processamento IN ('aguardando','processando','processado','erro')),
  CONSTRAINT arquivos_importados_status_sync_check CHECK (status_sincronizacao IN ('aguardando','processando','atualizado','erro')),
  CONSTRAINT arquivos_importados_hash_unico UNIQUE (dashboard, hash_arquivo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arquivos_importados TO authenticated;
GRANT ALL ON public.arquivos_importados TO service_role;
ALTER TABLE public.arquivos_importados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam arquivos importados"
ON public.arquivos_importados FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER update_arquivos_importados_updated_at
BEFORE UPDATE ON public.arquivos_importados
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX arquivos_importados_dashboard_idx ON public.arquivos_importados (dashboard, importado_em DESC);

CREATE TABLE public.arquivos_sincronizacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  arquivo_id uuid REFERENCES public.arquivos_importados(id) ON DELETE CASCADE,
  dashboard text NOT NULL,
  resultado text NOT NULL,
  mensagem text NOT NULL DEFAULT '',
  registros integer NOT NULL DEFAULT 0,
  usuario_id uuid,
  usuario_nome text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT arquivos_sincronizacoes_dashboard_check CHECK (dashboard IN ('CONTROL','FALTAS','ATESTADOS')),
  CONSTRAINT arquivos_sincronizacoes_resultado_check CHECK (resultado IN ('sucesso','duplicado','sem_alteracao','erro'))
);

GRANT SELECT, INSERT, DELETE ON public.arquivos_sincronizacoes TO authenticated;
GRANT ALL ON public.arquivos_sincronizacoes TO service_role;
ALTER TABLE public.arquivos_sincronizacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam historico de sincronizacao"
ON public.arquivos_sincronizacoes FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX arquivos_sincronizacoes_arquivo_idx ON public.arquivos_sincronizacoes (arquivo_id, created_at DESC);

CREATE TABLE public.dashboards_config (
  dashboard text NOT NULL PRIMARY KEY,
  sincronizacao_automatica boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dashboards_config_dashboard_check CHECK (dashboard IN ('CONTROL','FALTAS','ATESTADOS'))
);

GRANT SELECT, INSERT, UPDATE ON public.dashboards_config TO authenticated;
GRANT ALL ON public.dashboards_config TO service_role;
ALTER TABLE public.dashboards_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam configuracao de dashboards"
ON public.dashboards_config FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER update_dashboards_config_updated_at
BEFORE UPDATE ON public.dashboards_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.dashboards_config (dashboard) VALUES ('CONTROL'), ('FALTAS'), ('ATESTADOS')
ON CONFLICT (dashboard) DO NOTHING;

CREATE POLICY "Admins leem arquivos dos dashboards"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'arquivos-dashboards' AND private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins enviam arquivos dos dashboards"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'arquivos-dashboards' AND private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins atualizam arquivos dos dashboards"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'arquivos-dashboards' AND private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'arquivos-dashboards' AND private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins removem arquivos dos dashboards"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'arquivos-dashboards' AND private.has_role(auth.uid(), 'admin'::public.app_role));