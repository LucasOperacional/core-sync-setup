-- ============================================================
-- Tables for Medical Certificate Verification Module
-- ============================================================

-- Main verified certificates table
CREATE TABLE IF NOT EXISTS public.atestados_verificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_arquivo text NOT NULL,
  tipo_arquivo text NOT NULL,
  tamanho_arquivo bigint NOT NULL DEFAULT 0,
  hash_sha256 text NOT NULL,
  caminho_storage text NOT NULL,
  classificacao text NOT NULL,
  pontuacao_risco integer NOT NULL DEFAULT 50,
  faixa_risco text NOT NULL DEFAULT 'revisao',
  texto_extraido text NOT NULL DEFAULT '',
  observacao text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.atestados_verificados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verified certificates"
  ON public.atestados_verificados FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all verified certificates"
  ON public.atestados_verificados FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated users can insert verified certificates"
  ON public.atestados_verificados FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update verified certificates"
  ON public.atestados_verificados FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- Extracted data table
CREATE TABLE IF NOT EXISTS public.dados_extraidos_verificacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  nome_paciente text NOT NULL DEFAULT 'Não identificado',
  cpf text NOT NULL DEFAULT 'Não identificado',
  nome_medico text NOT NULL DEFAULT 'Não identificado',
  crm text NOT NULL DEFAULT 'Não identificado',
  uf_crm text NOT NULL DEFAULT 'Não identificado',
  data_emissao text NOT NULL DEFAULT 'Não identificado',
  hora_emissao text NOT NULL DEFAULT 'Não identificado',
  dias_afastamento text NOT NULL DEFAULT 'Não identificado',
  data_inicio_afastamento text NOT NULL DEFAULT 'Não identificado',
  data_fim_afastamento text NOT NULL DEFAULT 'Não identificado',
  nome_clinica text NOT NULL DEFAULT 'Não identificado',
  cnpj_estabelecimento text NOT NULL DEFAULT 'Não identificado',
  codigo_validacao text NOT NULL DEFAULT 'Não identificado',
  qr_code_detectado boolean NOT NULL DEFAULT false,
  qr_code_conteudo text NOT NULL DEFAULT 'Não identificado',
  assinatura_digital_detectada boolean NOT NULL DEFAULT false,
  cid text NOT NULL DEFAULT 'Não identificado',
  cid_descricao text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dados_extraidos_verificacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View extracted data via atestado ownership"
  ON public.dados_extraidos_verificacao FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id
      AND (a.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

CREATE POLICY "Insert extracted data"
  ON public.dados_extraidos_verificacao FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id AND a.user_id = auth.uid()
    )
  );

-- Validations table
CREATE TABLE IF NOT EXISTS public.validacoes_atestado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  resultado text NOT NULL, -- aprovado, reprovado, nao_verificavel, pendente
  detalhes text NOT NULL DEFAULT '',
  origem text NOT NULL DEFAULT '',
  impacto_pontuacao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.validacoes_atestado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View validations via atestado ownership"
  ON public.validacoes_atestado FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id
      AND (a.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

CREATE POLICY "Insert validations"
  ON public.validacoes_atestado FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id AND a.user_id = auth.uid()
    )
  );

-- Inconsistencies table
CREATE TABLE IF NOT EXISTS public.inconsistencias_atestado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descricao text NOT NULL,
  severidade text NOT NULL DEFAULT 'media', -- baixa, media, alta
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inconsistencias_atestado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View inconsistencies via atestado ownership"
  ON public.inconsistencias_atestado FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id
      AND (a.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

CREATE POLICY "Insert inconsistencies"
  ON public.inconsistencias_atestado FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id AND a.user_id = auth.uid()
    )
  );

-- Analysis history table
CREATE TABLE IF NOT EXISTS public.historico_analises_atestado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  acao text NOT NULL,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nome text NOT NULL DEFAULT 'Sistema',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.historico_analises_atestado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View history via atestado ownership"
  ON public.historico_analises_atestado FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id
      AND (a.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

CREATE POLICY "Insert history"
  ON public.historico_analises_atestado FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.atestados_verificados a
      WHERE a.id = atestado_id AND a.user_id = auth.uid()
    )
  );

-- Access logs table
CREATE TABLE IF NOT EXISTS public.logs_acesso_atestado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atestado_id uuid NOT NULL REFERENCES public.atestados_verificados(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acao text NOT NULL, -- visualizou, analisou, baixou, aprovou, rejeitou
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.logs_acesso_atestado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view access logs"
  ON public.logs_acesso_atestado FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Insert access logs"
  ON public.logs_acesso_atestado FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_atestados_verificados_user ON public.atestados_verificados(user_id);
CREATE INDEX IF NOT EXISTS idx_atestados_verificados_hash ON public.atestados_verificados(hash_sha256);
CREATE INDEX IF NOT EXISTS idx_dados_extraidos_atestado ON public.dados_extraidos_verificacao(atestado_id);
CREATE INDEX IF NOT EXISTS idx_validacoes_atestado ON public.validacoes_atestado(atestado_id);
CREATE INDEX IF NOT EXISTS idx_inconsistencias_atestado ON public.inconsistencias_atestado(atestado_id);
CREATE INDEX IF NOT EXISTS idx_historico_analises_atestado ON public.historico_analises_atestado(atestado_id);
CREATE INDEX IF NOT EXISTS idx_logs_acesso_atestado ON public.logs_acesso_atestado(atestado_id);
CREATE INDEX IF NOT EXISTS idx_logs_acesso_atestado_user ON public.logs_acesso_atestado(user_id);

-- Private storage bucket for verified certificates
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'atestados-verificacao',
  'atestados-verificacao',
  false,
  20971520, -- 20MB
  ARRAY['application/pdf','image/jpeg','image/png','image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload atestados for verification"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'atestados-verificacao');

CREATE POLICY "Authenticated users can read own atestados verification"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'atestados-verificacao');

CREATE POLICY "Admins can delete atestados verification"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'atestados-verificacao' AND private.has_role(auth.uid(), 'admin'::public.app_role));
