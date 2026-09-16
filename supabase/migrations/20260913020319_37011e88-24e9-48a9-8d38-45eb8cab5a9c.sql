CREATE OR REPLACE FUNCTION public.tem_papel_interno(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','diretor','cordenador','gerente','visualizador','supervisor','mesa_operacional')
  )
$$;
CREATE OR REPLACE FUNCTION public.pode_gerir_atendimento(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','diretor','cordenador','mesa_operacional')
  )
$$;
CREATE OR REPLACE FUNCTION public.pode_ver_conversa(_assigned uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.pode_gerir_atendimento(_user_id)
      OR (public.tem_papel_interno(_user_id) AND (_assigned IS NULL OR _assigned = _user_id))
$$;
REVOKE ALL ON FUNCTION public.tem_papel_interno(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.pode_gerir_atendimento(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.pode_ver_conversa(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.tem_papel_interno(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pode_gerir_atendimento(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pode_ver_conversa(uuid, uuid) TO authenticated, service_role;
ALTER TABLE public.lgpd_acessos ADD COLUMN IF NOT EXISTS modulo text NOT NULL DEFAULT '';
DROP POLICY IF EXISTS "nexti_checklist_answers_select" ON public.nexti_checklist_answers;
CREATE POLICY "nexti_checklist_answers_select" ON public.nexti_checklist_answers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  wa_chat_id text not null unique,
  telefone text,
  contato_nome text,
  is_group boolean not null default false,
  status text not null default 'aberta' check (status in ('aberta','em_atendimento','finalizada')),
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  nao_lidas integer not null default 0,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  wa_message_id text,
  direcao text not null check (direcao in ('recebida','enviada','sistema')),
  autor_nome text,
  user_id uuid references auth.users(id) on delete set null,
  content text not null default '',
  media_url text,
  media_type text,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS public.whatsapp_transfers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  de_user_id uuid,
  para_user_id uuid,
  motivo text,
  created_at timestamptz not null default now()
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wa_id_idx on public.whatsapp_messages(wa_message_id) where wa_message_id is not null;
CREATE INDEX IF NOT EXISTS whatsapp_messages_conv_idx on public.whatsapp_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_conv_status_idx on public.whatsapp_conversations(status, last_message_at desc);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_conversations TO authenticated;
GRANT ALL ON public.whatsapp_conversations TO service_role;
GRANT SELECT, INSERT ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
GRANT SELECT, INSERT ON public.whatsapp_transfers TO authenticated;
GRANT ALL ON public.whatsapp_transfers TO service_role;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa conv read" ON public.whatsapp_conversations;
CREATE POLICY "wa conv read" ON public.whatsapp_conversations FOR SELECT TO authenticated
  USING (public.pode_ver_conversa(assigned_to, auth.uid()));
DROP POLICY IF EXISTS "wa conv insert" ON public.whatsapp_conversations;
CREATE POLICY "wa conv insert" ON public.whatsapp_conversations FOR INSERT TO authenticated
  WITH CHECK (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "wa conv update" ON public.whatsapp_conversations;
CREATE POLICY "wa conv update" ON public.whatsapp_conversations FOR UPDATE TO authenticated
  USING (public.pode_ver_conversa(assigned_to, auth.uid()))
  WITH CHECK (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "wa msg read" ON public.whatsapp_messages;
CREATE POLICY "wa msg read" ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.whatsapp_conversations c
                 WHERE c.id = conversation_id AND public.pode_ver_conversa(c.assigned_to, auth.uid())));
DROP POLICY IF EXISTS "wa msg insert" ON public.whatsapp_messages;
CREATE POLICY "wa msg insert" ON public.whatsapp_messages FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) OR (user_id IS NULL))
    AND EXISTS (SELECT 1 FROM public.whatsapp_conversations c
                WHERE c.id = conversation_id AND public.pode_ver_conversa(c.assigned_to, auth.uid())));
DROP POLICY IF EXISTS "wa transfer read" ON public.whatsapp_transfers;
CREATE POLICY "wa transfer read" ON public.whatsapp_transfers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.whatsapp_conversations c
                 WHERE c.id = conversation_id AND public.pode_ver_conversa(c.assigned_to, auth.uid())));
DROP POLICY IF EXISTS "wa transfer insert" ON public.whatsapp_transfers;
CREATE POLICY "wa transfer insert" ON public.whatsapp_transfers FOR INSERT TO authenticated
  WITH CHECK (de_user_id = auth.uid() AND public.tem_papel_interno(auth.uid()));
DROP TRIGGER IF EXISTS whatsapp_conv_updated ON public.whatsapp_conversations;
CREATE TRIGGER whatsapp_conv_updated BEFORE UPDATE ON public.whatsapp_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP POLICY IF EXISTS "chat_direct_conv_auth" ON public.chat_direct_conversations;
DROP POLICY IF EXISTS "chat_direct_msg_auth" ON public.chat_direct_messages;
DROP POLICY IF EXISTS "chat_direct_transf_auth" ON public.chat_direct_transfers;
DROP POLICY IF EXISTS "direct conv read" ON public.chat_direct_conversations;
CREATE POLICY "direct conv read" ON public.chat_direct_conversations FOR SELECT TO authenticated
  USING (public.pode_ver_conversa(assigned_to, auth.uid()));
DROP POLICY IF EXISTS "direct conv write" ON public.chat_direct_conversations;
CREATE POLICY "direct conv write" ON public.chat_direct_conversations FOR INSERT TO authenticated
  WITH CHECK (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "direct conv update" ON public.chat_direct_conversations;
CREATE POLICY "direct conv update" ON public.chat_direct_conversations FOR UPDATE TO authenticated
  USING (public.pode_ver_conversa(assigned_to, auth.uid()))
  WITH CHECK (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "direct msg read" ON public.chat_direct_messages;
CREATE POLICY "direct msg read" ON public.chat_direct_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_direct_conversations c
                 WHERE c.id = conversation_id AND public.pode_ver_conversa(c.assigned_to, auth.uid())));
DROP POLICY IF EXISTS "direct msg write" ON public.chat_direct_messages;
CREATE POLICY "direct msg write" ON public.chat_direct_messages FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) OR (user_id IS NULL))
    AND EXISTS (SELECT 1 FROM public.chat_direct_conversations c
                WHERE c.id = conversation_id AND public.pode_ver_conversa(c.assigned_to, auth.uid())));
DROP POLICY IF EXISTS "direct transfer read" ON public.chat_direct_transfers;
CREATE POLICY "direct transfer read" ON public.chat_direct_transfers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_direct_conversations c
                 WHERE c.id = conversation_id AND public.pode_ver_conversa(c.assigned_to, auth.uid())));
DROP POLICY IF EXISTS "direct transfer write" ON public.chat_direct_transfers;
CREATE POLICY "direct transfer write" ON public.chat_direct_transfers FOR INSERT TO authenticated
  WITH CHECK (de_user_id = auth.uid() AND public.tem_papel_interno(auth.uid()));
CREATE TABLE IF NOT EXISTS public.projeto_atualizacoes (
  aplicado_em text,
  arquivos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  enviado_por uuid,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  nome_arquivo text NOT NULL,
  observacoes text,
  status text NOT NULL DEFAULT ''::text,
  storage_bucket text NOT NULL DEFAULT ''::text,
  storage_path text NOT NULL,
  tamanho_bytes numeric NOT NULL DEFAULT 0,
  total_arquivos numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  versao text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projeto_atualizacoes TO authenticated;
GRANT ALL ON public.projeto_atualizacoes TO service_role;
ALTER TABLE public.projeto_atualizacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projeto_atualizacoes_admin" ON public.projeto_atualizacoes;
CREATE POLICY "projeto_atualizacoes_admin" ON public.projeto_atualizacoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS projeto_atualizacoes_updated_at ON public.projeto_atualizacoes;
CREATE TRIGGER projeto_atualizacoes_updated_at BEFORE UPDATE ON public.projeto_atualizacoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS projeto_atualizacoes_created_idx ON public.projeto_atualizacoes (created_at DESC);
CREATE TABLE IF NOT EXISTS public.solicitacoes_vagas (
  aprovacao_automatica boolean NOT NULL DEFAULT false,
  arquivo text,
  atividade text,
  caminho_pdf text,
  cargo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  data_inicio text,
  decidido_em text,
  decidido_por text,
  email_destino text,
  fiscal_responsavel text,
  horario text,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  justificativa text,
  localidade text,
  motivo_decisao text,
  pendencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  perfil text,
  posto text,
  salario text,
  solicitante text,
  status text NOT NULL DEFAULT 'pendente'::text,
  tipo text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitacoes_vagas TO authenticated;
GRANT ALL ON public.solicitacoes_vagas TO service_role;
ALTER TABLE public.solicitacoes_vagas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solicitante e aprovadores veem vagas" ON public.solicitacoes_vagas;
CREATE POLICY "Solicitante e aprovadores veem vagas" ON public.solicitacoes_vagas FOR SELECT TO authenticated
  USING (user_id = auth.uid()
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'diretor')
      OR public.has_role(auth.uid(),'cordenador'));
DROP POLICY IF EXISTS "Usuarios criam suas solicitacoes de vagas" ON public.solicitacoes_vagas;
CREATE POLICY "Usuarios criam suas solicitacoes de vagas"
ON public.solicitacoes_vagas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Aprovadores atualizam solicitacoes de vagas" ON public.solicitacoes_vagas;
CREATE POLICY "Aprovadores atualizam solicitacoes de vagas" ON public.solicitacoes_vagas FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'diretor')
      OR public.has_role(auth.uid(),'cordenador'))
  WITH CHECK (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'diretor')
      OR public.has_role(auth.uid(),'cordenador'));
DROP POLICY IF EXISTS "Admins removem solicitacoes de vagas" ON public.solicitacoes_vagas;
CREATE POLICY "Admins removem solicitacoes de vagas"
ON public.solicitacoes_vagas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS update_solicitacoes_vagas_updated_at ON public.solicitacoes_vagas;
CREATE TRIGGER update_solicitacoes_vagas_updated_at
BEFORE UPDATE ON public.solicitacoes_vagas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_solicitacoes_vagas_status ON public.solicitacoes_vagas (status, created_at DESC);
CREATE TABLE IF NOT EXISTS public.app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  valor text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_config_select" ON public.app_config;
CREATE POLICY "app_config_select" ON public.app_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'diretor'));
DROP POLICY IF EXISTS "app_config_admin_write" ON public.app_config;
CREATE POLICY "app_config_admin_write" ON public.app_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'diretor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'diretor'));
INSERT INTO public.app_config (chave, valor) VALUES ('vagas_email_destino', 'recrutamento@operacional.cloud') ON CONFLICT (chave) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.rastreamento_localizacoes (
  bateria numeric,
  capturado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  direcao numeric,
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  nome text,
  precisao_metros numeric,
  tipo_sinal text,
  user_id uuid NOT NULL,
  velocidade numeric
);
CREATE INDEX IF NOT EXISTS rastreamento_localizacoes_user_idx ON public.rastreamento_localizacoes (user_id, capturado_em DESC);
CREATE INDEX IF NOT EXISTS rastreamento_localizacoes_capturado_idx ON public.rastreamento_localizacoes (capturado_em DESC);
GRANT SELECT, INSERT, DELETE ON public.rastreamento_localizacoes TO authenticated;
GRANT ALL ON public.rastreamento_localizacoes TO service_role;
ALTER TABLE public.rastreamento_localizacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rastreamento_insert_own" ON public.rastreamento_localizacoes;
CREATE POLICY "rastreamento_insert_own" ON public.rastreamento_localizacoes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "rastreamento_select_own" ON public.rastreamento_localizacoes;
CREATE POLICY "rastreamento_select_own" ON public.rastreamento_localizacoes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "rastreamento_select_gestores" ON public.rastreamento_localizacoes;
CREATE POLICY "rastreamento_select_gestores" ON public.rastreamento_localizacoes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'diretor')
    OR public.has_role(auth.uid(), 'cordenador')
    OR public.has_role(auth.uid(), 'supervisor')
  );
DROP POLICY IF EXISTS "rastreamento_delete_gestores" ON public.rastreamento_localizacoes;
CREATE POLICY "rastreamento_delete_gestores" ON public.rastreamento_localizacoes
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'diretor')
  );